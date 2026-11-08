// 批量给 extras_data.js 的报刊例句补中文译文（调用 Agnes OpenAI 兼容接口）
// 用法：node scripts/translate_extras.js [--limit 100] [--batch 20] [--conc 4]
// 断点续跑：进度写 .extras_cn_progress.json，脚本可随时中断重跑
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'extras_data.js');
const PROG = path.join(ROOT, '.extras_cn_progress.json');
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/chat/completions';
// 密钥只从环境变量读，不要写进仓库（仓库公开时等于把额度送人）
// 运行前：export AGNES_API_KEY=sk-...
const KEY = process.env.AGNES_API_KEY || '';
const MODEL = process.env.TRANSLATE_MODEL || 'agnes-3.0-flash';

const argv = process.argv.slice(2);
function arg(name, def){ const i = argv.indexOf('--' + name); return i >= 0 ? Number(argv[i + 1]) : def; }
const LIMIT = arg('limit', 0);
const BATCH = arg('batch', 20);
const CONC = arg('conc', 4);
const MAX_RETRY = 3;

const src = fs.readFileSync(DATA, 'utf8');
const EXTRAS = new Function(src + '\nreturn EXTRAS_DATA;')();

let prog = {};
try{ prog = JSON.parse(fs.readFileSync(PROG, 'utf8')); }catch(e){}
function saveProg(){ fs.writeFileSync(PROG, JSON.stringify(prog)); }

const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const hasCJK = s => /[\u4e00-\u9fa5]/.test(s);

// 待翻译清单（已翻译过的跳过）
const todo = [];
for(const w of Object.keys(EXTRAS)){
  const arr = EXTRAS[w] || [];
  const got = prog[w] || [];
  arr.forEach((e, i) => {
    if(got[i]) return;
    const en = plain(e.en);
    if(!en) return;
    todo.push({ w, i, en });
  });
}
console.log('待翻译句子:', todo.length, '（已完成', Object.keys(prog).reduce((n,k)=>n+(prog[k]||[]).filter(Boolean).length,0), '条）');

const work = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;
const batches = [];
for(let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH));

function buildPrompt(items){
  const lines = items.map((it, k) => `${k + 1}. ${it.en}`).join('\n');
  return `你是资深英语教研编辑。把下面 ${items.length} 条英文例句逐条翻译成准确、自然、通顺的简体中文。

要求：
1. 面向中国中学生，译文要像教材例句的中文，读得懂、不拗口；
2. 忠实原句信息，不加解释、不省略、不合并句子；
3. 专有名词（人名、机构、地名）用通行译名，没有就音译；
4. 只输出 JSON 数组，长度必须等于 ${items.length}，每个元素是一条中文译文，不要代码块、不要序号、不要任何说明。

${lines}`;
}

async function callAPI(items){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try{
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.15,
        messages: [
          { role: 'system', content: '你只输出合法 JSON，不要任何解释文字。' },
          { role: 'user', content: buildPrompt(items) }
        ]
      }),
      signal: ctrl.signal
    });
    if(!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const d = await r.json();
    let txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    txt = txt.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = txt.indexOf('['), end = txt.lastIndexOf(']');
    if(start < 0 || end < 0) throw new Error('返回里没有 JSON 数组');
    const arr = JSON.parse(txt.slice(start, end + 1));
    if(!Array.isArray(arr) || arr.length !== items.length) throw new Error('长度不符 ' + (arr && arr.length) + '/' + items.length);
    return arr.map(x => String(x == null ? '' : x).trim());
  } finally { clearTimeout(timer); }
}

function writeBack(items, cns){
  items.forEach((it, k) => {
    const cn = cns[k];
    if(!cn || !hasCJK(cn)) return;
    if(!prog[it.w]) prog[it.w] = [];
    prog[it.w][it.i] = cn;
  });
}

let done = 0, failed = 0;
async function runBatch(items){
  for(let attempt = 1; attempt <= MAX_RETRY; attempt++){
    try{
      const cns = await callAPI(items);
      writeBack(items, cns);
      done += items.length;
      if(done % 200 < items.length || done === work.length) {
        saveProg();
        console.log(`  进度 ${done}/${work.length}`);
      }
      return;
    }catch(e){
      if(attempt === MAX_RETRY){
        if(items.length > 1){
          const mid = Math.ceil(items.length / 2);
          await runBatch(items.slice(0, mid));
          await runBatch(items.slice(mid));
          return;
        }
        failed += items.length;
        console.warn('  ✗ 单句失败:', items[0].w, items[0].en.slice(0, 50), String(e.message).slice(0, 80));
        return;
      }
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

(async () => {
  const t0 = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while(true){
      const idx = next++;
      if(idx >= batches.length) return;
      await runBatch(batches[idx]);
      if(done % 400 < BATCH) saveProg();
    }
  }));
  saveProg();
  console.log(`翻译完成：成功 ${done} 条，失败 ${failed} 条，用时 ${((Date.now()-t0)/1000).toFixed(0)}s`);

  if(LIMIT === 0){
    // 回写 extras_data.js：保留原有顺序与字段，只追加 cn
    let n = 0, miss = 0;
    for(const w of Object.keys(EXTRAS)){
      const arr = EXTRAS[w] || [];
      const got = prog[w] || [];
      arr.forEach((e, i) => {
        if(e.cn) return;
        if(got[i]){ e.cn = got[i]; n++; } else miss++;
      });
    }
    fs.writeFileSync(DATA, 'const EXTRAS_DATA = ' + JSON.stringify(EXTRAS) + ';\n');
    console.log(`已写入 extras_data.js：新增译文 ${n} 条，仍缺 ${miss} 条`);
  }
})();
