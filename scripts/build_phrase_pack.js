// 为「短语」补齐真实双语例句（有道词典 jsonapi）
// 背景：教材词库里有 341 条 look after / be good at 这类短语，本地 EXAMPLES_DATA 只收单词，
// 短语只能落到 3 条通用模板（"I learned the word ..."），学生一眼就看出是凑数的。
// 这个脚本把短语逐条查有道，取 3 条自然例句（带中文译文），生成 phrase_examples.js。
//
// 用法：node scripts/build_phrase_pack.js [--all]
//   --all  连 443 个「本地没有例句的单词」一起补（默认只补短语）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'phrase_examples.js');

function loadData(files) {
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  // 这些数据文件是给浏览器 <script> 写的，`const` 不会挂到 context 上，显式导出一份
  vm.runInContext('globalThis.__DATA = { WORD_DB, TEXTBOOK_DB, EXAMPLES_DATA, PHRASE_EXAMPLES };', ctx);
  return Object.assign({}, ctx, ctx.__DATA);
}

const ctx = loadData(['words-data.js', 'textbooks_data.js', 'examples_data.js', 'phrase_examples.js']);
const WORD_DB = ctx.WORD_DB || {};
const TEXTBOOK_DB = ctx.TEXTBOOK_DB || {};
const EXAMPLES_DATA = ctx.EXAMPLES_DATA || {};
const OLD_PHRASE = ctx.PHRASE_EXAMPLES || {};

function collectWords() {
  const map = new Map(); // word -> cn
  const add = (w, cn) => {
    const k = String(w || '').toLowerCase().trim();
    if (!k || map.has(k)) return;
    map.set(k, String(cn || '').trim());
  };
  Object.values(WORD_DB).forEach(list => (list || []).forEach(p => add(p[0], p[1])));
  Object.values(TEXTBOOK_DB).forEach(tb => (tb.words || []).forEach(p => add(p[0], p[1])));
  return map;
}

const ALL = collectWords();
const onlyPhrase = !process.argv.includes('--all');

const targets = [...ALL.entries()].filter(([w]) => {
  if (EXAMPLES_DATA[w] && EXAMPLES_DATA[w].length) return false;
  if (OLD_PHRASE[w] && OLD_PHRASE[w].length) return false;   // 已补过的不重复抓
  if (onlyPhrase) return /\s/.test(w);
  return true;
});
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
const list = targets.slice(0, LIMIT || targets.length);

console.log('待补例句：', targets.length, onlyPhrase ? '（仅短语）' : '（全部缺例句的词）');

// ---- 清洗与筛选 ----
const BAD = /[◆■●▪►★☆<>{}[\]\\|]/;
function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function goodPair(pair, phrase) {
  if (!pair || !pair.sentence || !pair['sentence-translation']) return null;
  const en = stripTags(pair['sentence-eng'] || pair.sentence);
  const cn = String(pair['sentence-translation']).trim();
  if (!en || !cn) return null;
  if (en.length < 12 || en.length > 170) return null;
  if (BAD.test(en) || BAD.test(cn)) return null;
  // 例句必须真的包含这个短语（有道偶尔会拿拆开的单词凑数）
  const low = en.toLowerCase().replace(/[’']/g, "'");
  const key = phrase.toLowerCase().replace(/[’']/g, "'");
  if (!low.includes(key)) return null;
  // 排除「这个单词/短语……」这类元例句
  if (/^the (word|phrase)\b/i.test(en)) return null;
  return {
    en: String(pair['sentence-eng'] || pair.sentence).replace(/<b>/gi, '<B>').replace(/<\/b>/gi, '</B>').trim(),
    cn
  };
}
function score(p) {
  const n = stripTags(p.en).split(/\s+/).length;
  let s = 0;
  if (n >= 6 && n <= 16) s += 4;            // 课堂例句最舒服的长度
  else if (n <= 20) s += 2;
  else if (n > 26) s -= 3;
  if (/[?!"']$/.test(stripTags(p.en))) s += 1;
  return s;
}

async function fetchOne(phrase) {
  const url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(phrase) + '&doctype=json';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const sp = (d.blng_sents_part && d.blng_sents_part['sentence-pair']) || [];
  const seen = new Set();
  const out = [];
  for (const pair of sp) {
    const it = goodPair(pair, phrase);
    if (!it) continue;
    const k = stripTags(it.en).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  out.sort((a, b) => score(b) - score(a));
  return out.slice(0, 3);
}

async function pool(items, worker, concurrency) {
  const results = new Map();
  let idx = 0, done = 0, failed = 0;
  const run = async () => {
    while (idx < items.length) {
      const i = idx++;
      const [w] = items[i];
      try {
        const ex = await worker(w);
        if (ex && ex.length) results.set(w, ex);
        else failed++;
      } catch (e) {
        failed++;
        if (failed < 8) console.log('  失败', w, e.message);
      }
      done++;
      if (done % 25 === 0) console.log('  进度', done + '/' + items.length, '已拿到', results.size);
      await new Promise(r => setTimeout(r, 60));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, run));
  return { results, failed };
}

(async () => {
  const { results, failed } = await pool(list, fetchOne, 3);
  console.log('完成：有例句', results.size, '条，无结果/失败', failed, '条');

  const obj = Object.assign({}, OLD_PHRASE);
  for (const [w, ex] of [...results.entries()].sort((a, b) => a[0].localeCompare(b[0]))) obj[w] = ex;
  const body = '// 短语/缺例句单词的真实双语例句（有道词典 jsonapi，scripts/build_phrase_pack.js 生成）\n' +
    '// 结构：{ "look after": [{ en, cn }, ...], ... }\n' +
    'const PHRASE_EXAMPLES = ' + JSON.stringify(obj, null, 0) + ';\n';
  fs.writeFileSync(OUT, body, 'utf8');
  console.log('写出', path.relative(ROOT, OUT), (Buffer.byteLength(body) / 1024).toFixed(1) + 'KB');
})();
