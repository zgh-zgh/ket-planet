// 首轮兜底：用 Google 翻译给 extras_data.js 里所有还缺中文的报刊例句补译文
// （之后可用 scripts/translate_extras.js 的 AI 译文覆盖，质量更高）
// 用法：node scripts/backfill_extras_google.js [--limit N] [--batch 15] [--conc 6]
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'extras_data.js');
const PROG = path.join(ROOT, '.extras_google_progress.json');
const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:7897';

const argv = process.argv.slice(2);
function arg(n, d){ const i = argv.indexOf('--' + n); return i >= 0 ? Number(argv[i + 1]) : d; }
const LIMIT = arg('limit', 0);
const BATCH = arg('batch', 15);
const CONC = arg('conc', 6);

const src = fs.readFileSync(DATA, 'utf8');
const EXTRAS = new Function(src + '\nreturn EXTRAS_DATA;')();
let prog = {};
try{ prog = JSON.parse(fs.readFileSync(PROG, 'utf8')); }catch(e){}
const saveProg = () => fs.writeFileSync(PROG, JSON.stringify(prog));

const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const hasCJK = s => /[\u4e00-\u9fa5]/.test(s);

const todo = [];
for(const w of Object.keys(EXTRAS)){
  (EXTRAS[w] || []).forEach((e, i) => {
    if(e.cn) return;                       // 已有 AI 译文的跳过
    const got = prog[w] || [];
    if(got[i]) return;
    const en = plain(e.en);
    if(en) todo.push({ w, i, en });
  });
}
console.log('待补译文:', todo.length, '（本次上限', LIMIT || '不限', '）');
const work = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;

function curlTranslate(url){
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '--max-time', '30', '-x', PROXY, url], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if(err) return reject(err);
      try{
        const arr = JSON.parse(stdout);
        resolve(arr);
      }catch(e){ reject(new Error('返回无法解析：' + String(stdout).slice(0, 80))); }
    });
  });
}

async function runBatch(items){
  const q = items.map(it => 'q=' + encodeURIComponent(it.en)).join('&');
  const url = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=en&tl=zh-CN&' + q;
  for(let attempt = 1; attempt <= 3; attempt++){
    try{
      const arr = await curlTranslate(url);
      if(!Array.isArray(arr) || arr.length !== items.length) throw new Error('长度不符');
      items.forEach((it, k) => {
        const cn = String(arr[k] == null ? '' : arr[k]).trim();
        if(!cn || !hasCJK(cn)) return;
        if(!prog[it.w]) prog[it.w] = [];
        prog[it.w][it.i] = cn;
      });
      done += items.length;
      if(done % 500 < items.length){ saveProg(); console.log('  进度', done + '/' + work.length); }
      return;
    }catch(e){
      if(attempt === 3){
        if(items.length > 1){
          const mid = Math.ceil(items.length / 2);
          await runBatch(items.slice(0, mid));
          await runBatch(items.slice(mid));
          return;
        }
        failed++;
        return;
      }
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
}

let done = 0, failed = 0;
(async () => {
  const t0 = Date.now();
  const batches = [];
  for(let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH));
  let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while(true){
      const idx = next++;
      if(idx >= batches.length) return;
      await runBatch(batches[idx]);
    }
  }));
  saveProg();
  console.log(`完成：${done} 条，失败 ${failed} 条，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // 回写：只填空缺（AI 译文优先保留）；--limit 试跑不写文件
  if(LIMIT > 0){ console.log('（试跑模式，不写 extras_data.js）'); return; }
  let filled = 0;
  for(const w of Object.keys(EXTRAS)){
    const got = prog[w] || [];
    (EXTRAS[w] || []).forEach((e, i) => {
      if(e.cn) return;
      if(got[i]){ e.cn = got[i]; filled++; }
    });
  }
  fs.writeFileSync(DATA, 'const EXTRAS_DATA = ' + JSON.stringify(EXTRAS) + ';\n');
  console.log('写入 extras_data.js：新增', filled, '条');
})();
