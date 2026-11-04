// 例句 + 来源抓取（中考/高考词库专用）
// 数据源：有道词典 jsonapi -> blng_sents_part.sentence-pair
// 关键：该接口每条例句自带 source 字段（《柯林斯英汉双解大词典》/《牛津词典》/影视剧名），
//       旧脚本 fetch_cet.js 只取了 en/cn，把来源丢了。这里完整保留。
// 用法：node scripts/fetch_sources.js [--limit 50] [--concurrency 6]
// 断点续传：.source_progress.json（已 gitignore）
const fs = require('fs');
const path = require('path');
const { ROOT, getLevelWords } = require('./_data');

const PROG = path.join(ROOT, '.source_progress.json');
const OUT = path.join(ROOT, 'bank', 'src', 'examples_src.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const LIMIT = getArg('--limit', 0);
const CONC = getArg('--concurrency', 6);
const MAX_RETRY = 3;
const TIMEOUT = 20000;
const MAX_PER_WORD = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return String(s || '')
    .replace(/<b>/gi, '<B>').replace(/<\/b>/gi, '</B>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWord(word) {
  const url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word) + '&doctype=json';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error('http ' + res.status);
  const data = JSON.parse(await res.text());
  const pairs = (data.blng_sents_part && data.blng_sents_part['sentence-pair']) || [];
  const out = [];
  for (const sp of pairs) {
    const en = norm(sp['sentence-eng'] || sp.sentence);
    const cn = String(sp['sentence-translation'] || '').trim();
    if (!en || !cn) continue;
    if (!new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(en.replace(/<\/?B>/g, ''))) continue;
    out.push({ en, cn, src: String(sp.source || '').trim() });
    if (out.length >= MAX_PER_WORD) break;
  }
  return out;
}

async function main() {
  const seen = new Set();
  const words = [];
  for (const lv of ['初中', '高中', '四级', '六级']) {
    for (const { w } of getLevelWords(lv)) {
      const k = w.toLowerCase();
      if (!seen.has(k)) { seen.add(k); words.push(w); }
    }
  }
  const todo = LIMIT ? words.slice(0, LIMIT) : words;

  let prog = { done: {}, failed: {} };
  if (fs.existsSync(PROG)) {
    try { prog = JSON.parse(fs.readFileSync(PROG, 'utf8')); } catch (e) { /* 重新开始 */ }
  }

  const pending = todo.filter((w) => !prog.done[w]);
  console.log(`[start] 目标词=${words.length}  本次处理=${todo.length}  已完成=${Object.keys(prog.done).length}  待抓=${pending.length}`);

  let idx = 0, done = 0, failed = 0;
  const t0 = Date.now();
  const save = () => fs.writeFileSync(PROG, JSON.stringify(prog));

  async function worker() {
    while (idx < pending.length) {
      const w = pending[idx++];
      let ok = false;
      for (let attempt = 0; attempt < MAX_RETRY && !ok; attempt++) {
        try {
          prog.done[w] = await fetchWord(w);
          if (prog.failed[w]) delete prog.failed[w];
          ok = true;
        } catch (e) {
          if (attempt === MAX_RETRY - 1) { prog.failed[w] = String(e.message || e); failed++; }
          else await sleep(800 * (attempt + 1));
        }
      }
      done++;
      if (done % 100 === 0) {
        save();
        const sec = ((Date.now() - t0) / 1000).toFixed(0);
        const rate = (done / Math.max(1, sec)).toFixed(1);
        console.log(`[progress] ${done}/${pending.length}  失败=${failed}  ${rate}/s  已用 ${sec}s`);
      }
    }
  }

  const workers = Array.from({ length: CONC }, () => worker());
  await Promise.all(workers);
  save();

  // 汇总输出
  const out = {};
  for (const w of words) if (prog.done[w]) out[w] = prog.done[w];
  fs.writeFileSync(OUT, JSON.stringify(out));

  const wordsWithEx = Object.keys(out).length;
  const totalEx = Object.values(out).reduce((a, arr) => a + arr.length, 0);
  const withSrc = Object.values(out).flat().filter((e) => e.src).length;
  console.log(`[done] 有例句的词=${wordsWithEx}  例句总数=${totalEx}  带来源=${withSrc} (${(withSrc / Math.max(1, totalEx) * 100).toFixed(1)}%)`);
  console.log(`[out] ${OUT}`);
  if (failed) console.log('[warn] 失败词数:', failed);
}

main().catch((e) => { console.error(e); process.exit(1); });
