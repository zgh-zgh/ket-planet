// 四六级词汇例句 + 有道配图 批量抓取脚本
// 数据源：有道词典 jsonapi（blng_sents_part 双语例句 + pic_dict 图解配图）
// 用法：node scripts/fetch_cet.js   （支持断点续传，进度存 .fetch_progress.json）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadConst(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=\s*(\{[\s\S]*\})/);
  if (!m) throw new Error('解析失败: ' + file);
  return eval('(' + m[2] + ')');
}

const W = loadConst('words-data.js');
const words = [...(W['四级'] || []).map(x => x[0]), ...(W['六级'] || []).map(x => x[0])];

const PROG_FILE = path.join(ROOT, '.fetch_progress.json');
let prog = { done: {}, failed: {} };
if (fs.existsSync(PROG_FILE)) {
  try { prog = JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); } catch (e) { prog = { done: {}, failed: {} }; }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const CONCURRENCY = 8;
const MAX_RETRY = 3;
const TIMEOUT = 15000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanEn(s) {
  return (s || '').replace(/<b>/g, '<B>').replace(/<\/b>/g, '</B>').trim();
}

async function fetchWord(word) {
  const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&doctype=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error('http ' + res.status);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('json parse'); }

  const out = { ex: [], pic: '' };
  const bp = data.blng_sents_part;
  if (bp && bp['sentence-pair'] && bp['sentence-pair'].length) {
    out.ex = bp['sentence-pair'].map(sp => {
      const en = cleanEn(sp['sentence-eng'] || sp.sentence || '');
      const cn = (sp['sentence-translation'] || '').trim();
      return (en && cn) ? { en, cn } : null;
    }).filter(Boolean);
  }
  const pic = data.pic_dict && data.pic_dict.pic && data.pic_dict.pic[0];
  if (pic && pic.image) out.pic = String(pic.image).split('?')[0];
  return out;
}

function save() {
  fs.writeFileSync(PROG_FILE, JSON.stringify(prog));
}

async function run() {
  // 待抓 = 所有尚未成功的词（含之前失败的重试）
  const todo = words.filter(w => !prog.done[w]);
  const doneCount = Object.keys(prog.done).length;
  const failCount = Object.keys(prog.failed).length;
  console.log(`[start] 总数=${words.length} 已完成=${doneCount} 待抓=${todo.length} 曾失败=${failCount}`);

  let idx = 0;
  let fetched = 0;

  async function worker() {
    while (idx < todo.length) {
      const word = todo[idx++];
      if (prog.done[word]) continue;
      let ok = false;
      for (let attempt = 0; attempt < MAX_RETRY && !ok; attempt++) {
        try {
          const r = await fetchWord(word);
          prog.done[word] = r;
          if (prog.failed[word]) delete prog.failed[word];
          ok = true;
        } catch (e) {
          if (attempt === MAX_RETRY - 1) prog.failed[word] = String(e.message || e);
          else await sleep(600 * (attempt + 1));
        }
      }
      fetched++;
      if (fetched % 50 === 0) {
        save();
        const pct = ((doneCount + Object.keys(prog.done).length) / words.length * 100).toFixed(1);
        console.log(`[progress] 已处理 ${fetched}/${todo.length}，累计成功 ${doneCount + Object.keys(prog.done).length}/${words.length} (${pct}%)`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);
  save();

  const okN = Object.keys(prog.done).length;
  const failN = Object.keys(prog.failed).length;
  let exN = 0, picN = 0;
  for (const k in prog.done) { if (prog.done[k].ex.length) exN++; if (prog.done[k].pic) picN++; }
  console.log(`[done] 成功=${okN} 失败=${failN} 其中抓到例句=${exN} 抓到有道配图=${picN}`);
  if (failN) console.log('失败词:', Object.keys(prog.failed).join(', '));
}

run();
