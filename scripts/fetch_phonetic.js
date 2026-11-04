// 补抓音标（英/美），有道 jsonapi 的 simple.word[0].ukphone / usphone
// 用途：ECDICT 只覆盖英式且有个别缺口，Wiktionary 只覆盖 945 词
// 输出：bank/src/phonetic_src.json  { word: { uk, us } }
// 用法：node scripts/fetch_phonetic.js [--limit N] [--concurrency 6]
const fs = require('fs');
const path = require('path');
const { ROOT, getLevelWords } = require('./_data');

const PROG = path.join(ROOT, '.phonetic_progress.json');
const OUT = path.join(ROOT, 'bank', 'src', 'phonetic_src.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const argv = process.argv.slice(2);
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const LIMIT = getArg('--limit', 0);
const CONC = getArg('--concurrency', 6);
const MAX_RETRY = 3;
const TIMEOUT = 20000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWord(word) {
  const url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word) + '&doctype=json';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error('http ' + res.status);
  const data = JSON.parse(await res.text());
  const w0 = data.simple && data.simple.word && data.simple.word[0];
  const uk = String((w0 && w0.ukphone) || '').trim();
  const us = String((w0 && w0.usphone) || '').trim();
  return { uk, us };
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
  console.log(`[start] 目标=${words.length} 本次=${todo.length} 待抓=${pending.length}`);

  let idx = 0, done = 0, failed = 0;
  const t0 = Date.now();
  const save = () => fs.writeFileSync(PROG, JSON.stringify(prog));

  async function worker() {
    while (idx < pending.length) {
      const w = pending[idx++];
      let ok = false;
      for (let a = 0; a < MAX_RETRY && !ok; a++) {
        try {
          prog.done[w] = await fetchWord(w);
          if (prog.failed[w]) delete prog.failed[w];
          ok = true;
        } catch (e) {
          if (a === MAX_RETRY - 1) { prog.failed[w] = String(e.message || e); failed++; }
          else await sleep(800 * (a + 1));
        }
      }
      done++;
      if (done % 500 === 0) {
        save();
        console.log(`[progress] ${done}/${pending.length} 失败=${failed} 已用=${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONC }, () => worker()));
  save();

  const out = {};
  for (const w of words) if (prog.done[w]) out[w] = prog.done[w];
  fs.writeFileSync(OUT, JSON.stringify(out));
  const arr = Object.values(out);
  const ukN = arr.filter((x) => x.uk).length;
  const usN = arr.filter((x) => x.us).length;
  console.log(`[done] 有英音=${ukN} (${(ukN / arr.length * 100).toFixed(1)}%)  有美音=${usN} (${(usN / arr.length * 100).toFixed(1)}%)`);
  console.log(`[out] ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
