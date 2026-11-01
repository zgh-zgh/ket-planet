// 权威例句抓取脚本：为学习词池（初中+高中）补 2 条「报刊/通讯社」源例句
// 数据源：有道词典 jsonapi → auth_sents_part（source 字段即真实出处，如 BBC / FORBES / CNN）
// 用途：不同题型各用不同例句（3 条双语例句 + 2 条权威例句 = 5 条，5 个题型互不重复）
// 用法：node scripts/fetch_extras.js   （断点续传，进度存 .extras_progress.json）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'extras_data.js');
const PROG = path.join(ROOT, '.extras_progress.json');

function loadConst(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=\s*(\{[\s\S]*\})/);
  if (!m) throw new Error('解析失败: ' + file);
  return eval('(' + m[2] + ')');
}

const W = loadConst('words-data.js');
const LEVELS = Object.keys(W);                   // 初中/高中/四级/六级 全部启用，词池与前端一致
const pool = [];
const seen = new Set();
for (const lv of LEVELS) for (const [w] of (W[lv] || [])) {
  const k = w.toLowerCase();
  if (!seen.has(k)) { seen.add(k); pool.push({ w, max: 2 }); }
}

let prog = {};
if (fs.existsSync(PROG)) {
  try { prog = JSON.parse(fs.readFileSync(PROG, 'utf8')); } catch (e) { prog = {}; }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const CONCURRENCY = 8;
const MAX_RETRY = 3;
const TIMEOUT = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 清洗：统一 <B> 标记、去残留 HTML、压缩空白（注意保留 <B></B> 高亮标记）
function cleanEn(s) {
  return (s || '')
    .replace(/<b>/gi, '<B>').replace(/<\/b>/gi, '</B>')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<(?!\/?B>)[^>]*>/g, ' ')           // 只删非 <B> 标签
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanSrc(s) {
  let t = (s || '').replace(/<[^>]+>/g, '').trim();
  t = t.split(':')[0].trim();                    // "BBC: Have train fares..." → "BBC"
  if (!t || /error occurred/i.test(t)) return '';
  return t.slice(0, 18);
}
function wordCount(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean).length;
}

// 合格判定：含目标词标记、6~20 词、首字母大写、以句末标点收尾
function accept(w, en) {
  if (!en) return false;
  const plain = en.replace(/<[^>]+>/g, '');
  if (!new RegExp(`<B>\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]{0,3}\\s*</B>`, 'i').test(en)) return false;
  const n = wordCount(plain);
  if (n < 6 || n > 20) return false;
  if (!/^[A-Z"'(]/.test(plain)) return false;
  if (!/[.!?"']$/.test(plain.trim())) return false;
  if (/\d{3,}/.test(plain)) return false;        // 剔除长数字（股价/年份密集句）
  return true;
}

async function fetchWord(word, max = 2) {
  const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&doctype=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error('http ' + res.status);
  const data = await res.json();
  const sent = (data.auth_sents_part && data.auth_sents_part.sent) || [];
  // 先收集全部合格句，再按「来源多样优先」排序，最后不足时用同源句补位
  const all = [];
  for (const s of sent) {
    const en = cleanEn(s.foreign || '');
    if (!accept(word, en)) continue;
    all.push({ en, src: cleanSrc(s.source || '') || '报刊' });
  }
  const out = [];
  const usedSrc = new Set();
  for (const c of all) {                         // 第一轮：同来源只取一条
    if (usedSrc.has(c.src)) continue;
    usedSrc.add(c.src);
    out.push(c);
    if (out.length >= max) break;
  }
  for (const c of all) {                         // 第二轮：数量不够才允许同源
    if (out.length >= max) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function saveProgress() {
  fs.writeFileSync(PROG, JSON.stringify(prog));
}
function writeOut() {
  const body = JSON.stringify(prog);
  fs.writeFileSync(OUT, 'const EXTRAS_DATA = ' + body + ';\n');
}

async function run() {
  const todo = pool.filter(it => !prog[it.w]);
  console.log(`[start] 词池=${pool.length} 已完成=${pool.length - todo.length} 待抓=${todo.length}`);
  let idx = 0, done = 0;

  async function worker() {
    while (idx < todo.length) {
      const item = todo[idx++];
      const word = item.w;
      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        try {
          prog[word] = await fetchWord(word, item.max);
          break;
        } catch (e) {
          if (attempt === MAX_RETRY - 1) prog[word] = [];
          else await sleep(500 * (attempt + 1));
        }
      }
      done++;
      if (done % 100 === 0) {
        saveProgress();
        const got = Object.values(prog).filter(v => v.length).length;
        console.log(`[progress] ${done}/${todo.length} 累计有例句词=${got}/${pool.length}`);
      }
    }
  }
  const ws = [];
  for (let i = 0; i < CONCURRENCY; i++) ws.push(worker());
  await Promise.all(ws);
  saveProgress();
  writeOut();

  const total = Object.keys(prog).length;
  const got = Object.values(prog).filter(v => v.length).length;
  const two = Object.values(prog).filter(v => v.length >= 2).length;
  console.log(`[done] 覆盖=${total} 有权威例句=${got} 其中两条以上=${two}`);
  console.log('[out]', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
}

run();
