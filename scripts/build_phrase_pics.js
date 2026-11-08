// 为「短语」批量生成专属插图（Agnes 文生图），生成结果写入 phrase_pics.js
// 背景：短语在词库里没有独立配图，之前的兜底是「取词尾名词的图」（take part in → take），
// 图和短语意思经常对不上。这里按短语+中文释义生成一张专属场景图，一次生成、永久复用。
//
// 用法：node scripts/build_phrase_pics.js [--limit=5] [--only=word1,word2]
// 断点续跑：phrase_pics.js 里已有的短语自动跳过。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'phrase_pics.js');
const API = 'https://apihub.agnes-ai.com/v1/images/generations';
// 密钥只从环境变量读，不要写进仓库（server.js 已被 .gitignore 排除，脚本会被提交）
// 运行前：export AGNES_API_KEY=sk-...   （Windows: set AGNES_API_KEY=sk-...）
const KEY = process.env.AGNES_API_KEY || '';

function loadData() {
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of ['textbooks_data.js', 'words-data.js', 'pics_data.js', 'atlas_pics.js']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  vm.runInContext('globalThis.__DATA = { TEXTBOOK_DB, WORD_DB, PICS_DATA, ATLAS_PICS };', ctx);
  return ctx.__DATA;
}
const DATA = loadData();

function collectPhrases() {
  const map = new Map();
  const add = (w, cn) => {
    const k = String(w || '').toLowerCase().trim();
    if (!k || map.has(k)) return;
    if (!/\s/.test(k)) return;                       // 只处理多词短语
    map.set(k, String(cn || '').trim());
  };
  Object.values(DATA.TEXTBOOK_DB || {}).forEach(tb => (tb.words || []).forEach(p => add(p[0], p[1])));
  Object.values(DATA.WORD_DB || {}).forEach(list => (list || []).forEach(p => add(p[0], p[1])));
  return map;
}
const PHRASES = collectPhrases();

function loadExisting() {
  if (!fs.existsSync(OUT)) return {};
  const src = fs.readFileSync(OUT, 'utf8');
  const m = src.match(/const PHRASE_PICS = (\{[\s\S]*\});/);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch (e) { return {}; }
}
let pics = loadExisting();

function save() {
  const sorted = {};
  Object.keys(pics).sort().forEach(k => { sorted[k] = pics[k]; });
  const body = '// 短语专属插图（Agnes 文生图，scripts/build_phrase_pics.js 生成）\n' +
    '// 结构：{ "look after": "https://.../look-after.png", ... }\n' +
    'const PHRASE_PICS = ' + JSON.stringify(sorted, null, 0) + ';\n';
  fs.writeFileSync(OUT, body, 'utf8');
}

// 把教材里的占位写法换成自然表达，提示词才读得顺
function natural(p) {
  return p
    .replace(/\.\.\./g, ' ')
    .replace(/\bsomebody\b/gi, 'someone')
    .replace(/\bsomething\b/gi, 'something')
    .replace(/\s+/g, ' ')
    .trim();
}
function promptOf(p, cn) {
  const naturalP = natural(p);
  // 只取第一个义项：像 put on（穿上；上演）这种多义词，把全部释义丢给模型容易画成「上台表演」
  const firstCn = String(cn || '').split(/[；;，,]/)[0].trim();
  const scene = firstCn ? ` (meaning: ${firstCn})` : '';
  return `A cute, clean flat cartoon illustration for the English phrase "${naturalP}"${scene}. ` +
    `Draw the most common, literal, everyday situation for this phrase, the meaning a middle-school student meets in a textbook; ` +
    `do not choose a metaphorical, idiomatic or stage-performance sense. ` +
    `Warm soft pastel colors, simple uncluttered background, centered composition, children's educational vocabulary card style, ` +
    `no text, no letters, no words, no watermark, no border.`;
}

async function genOne(p, cn) {
  const body = {
    model: 'agnes-image-2.5-flash',
    prompt: promptOf(p, cn),
    size: '1K',
    ratio: '1:1',
    extra_body: { response_format: 'url' }
  };
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const d = await r.json();
  const url = d && d.data && d.data[0] && d.data[0].url;
  if (!url) throw new Error('no url ' + JSON.stringify(d).slice(0, 160));
  return url;
}

(async () => {
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  let list = [...PHRASES.entries()].filter(([w]) => !pics[w]);
  if (onlyArg) {
    const only = new Set(onlyArg.split('=')[1].split(',').map(s => s.trim().toLowerCase()));
    list = [...PHRASES.entries()].filter(([w]) => only.has(w));
  }
  if (limitArg) list = list.slice(0, parseInt(limitArg.split('=')[1], 10));
  console.log('短语总数', PHRASES.size, '已有图', Object.keys(pics).length, '本次生成', list.length);

  let ok = 0, fail = 0, idx = 0;
  let cooldownUntil = 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // 免费额度有速率限制：遇到 429 就全局冷却，再重试同一条；不要硬刷
  const genWithRetry = async (p, cn) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const now = Date.now();
      if (cooldownUntil > now) await wait(cooldownUntil - now);
      try {
        return await genOne(p, cn);
      } catch (e) {
        const msg = String(e.message || '');
        if (msg.indexOf('429') >= 0) {
          cooldownUntil = Date.now() + 45000;
          console.log('  ⏳ 触发限流，冷却 45 秒（' + p + '）');
          await wait(2000);
          continue;
        }
        throw e;
      }
    }
    throw new Error('多次限流，跳过');
  };
  const worker = async () => {
    while (idx < list.length) {
      const [p, cn] = list[idx++];
      try {
        const url = await genWithRetry(p, cn);
        pics[p] = url;
        ok++;
        save();
        console.log('  ✔', p, '(' + ok + '/' + list.length + ')');
      } catch (e) {
        fail++;
        console.log('  ✘', p, e.message);
      }
      await wait(1200);
    }
  };
  // 4 路并发：单张约 12 秒，稳定在 ~15 张/分钟；遇到限流会自动冷却 45 秒再续
  await Promise.all([worker(), worker(), worker(), worker()]);
  save();
  console.log('完成：成功', ok, '失败', fail, '累计', Object.keys(pics).length);
})();
