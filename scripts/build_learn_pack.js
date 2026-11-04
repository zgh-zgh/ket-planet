/**
 * 从 bank/{gaokao,zhongkao}.js 抽取「App 直接可用」的精简数据包
 *
 * 只保留学习页与题型真正会读的字段：
 *   音标（英/美）、词性化义项、例句（含出处）、同源词/近义词、词频、配图
 * 丢弃：audio（可由单词推导）、syllables（App 用自己的音节库，未改动）、
 *       tag / bnc / srcFull（可由 src 还原）、重复的 cn 文本
 *
 * 产物：bank/pack.js —— const BANK_PACK = {...}，每词一行，可直接手改
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'bank', 'pack.js');
const MAX_EXAM = 3;     // 每词最多 3 条真题句（词典句仍走原有 examples_data，避免重复占体积）
const MAX_MANUAL = 2;   // 每词最多 2 条人工补充句（管理页添加，优先展示）
const MAX_DERIVE = 4;
const MAX_SYN = 4;

function loadBank(file) {
  const code = fs.readFileSync(path.join(ROOT, 'bank', file), 'utf8');
  const i = code.indexOf('{');
  const j = code.lastIndexOf('}');
  return JSON.parse(code.slice(i, j + 1));
}

const gk = loadBank('gaokao.js');
const zk = loadBank('zhongkao.js');

// 高考库是"初中+高中累计"，已覆盖中考库；中考库仅用于补 firstLevel=初中 的标注
const words = new Map();
for (const [k, v] of Object.entries(zk)) words.set(k, { ...v, firstLevel: v.firstLevel || '初中' });
for (const [k, v] of Object.entries(gk)) words.set(k, v);   // 高考覆盖，含 firstLevel

// 只取真题句：词典句在 examples_data.js 里已经有了，重复打包会让体积翻倍
function pickExamples(ex) {
  const out = [];
  const seen = new Set();
  const push = (e) => {
    const key = String(e.en).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    // [英文(带<B>标记), 出处, 类型, 中文] —— 人工例句带中文，真题句没有
    out.push([e.en, e.src || '', e.srcType, e.cn || '']);
    return true;
  };
  // ① 人工补充优先：管理页加的句子必须出现在 App 里，不能被真题挤掉
  let manual = 0;
  for (const e of ex || []) {
    if (manual >= MAX_MANUAL) break;
    if (e.srcType !== 'manual') continue;
    if (push(e)) manual++;
  }
  // ② 真题补位：有人的例句时多给一个名额，保证学生既能看到自建句也能看到真题
  const cap = manual ? MAX_MANUAL + 2 : MAX_EXAM;
  for (const e of ex || []) {
    if (out.length >= cap) break;
    if (e.srcType !== 'gaokao' && e.srcType !== 'zhongkao') continue;
    push(e);
  }
  return out;
}
// 额外带 1 条「有中文 + 有出处」的词典句：
// 现有 examples_data 是早先抓的，句子和重抓后的不一样，所以很多旧句补不到来源；
// 这条能保证每个词至少有一条例句是「中文 + 出处」齐全的。
function pickDict(ex) {
  for (const e of ex || []) {
    if (e.srcType === 'gaokao' || e.srcType === 'zhongkao') continue;
    if (e.srcType === 'manual') continue;   // 人工句已由 pickExamples 处理，避免重复
    if (!e.cn || !e.src) continue;
    return [[e.en, e.cn, e.src]];
  }
  return [];
}

const pack = {};
let exTotal = 0, withPh = 0, withDict = 0;

for (const [k, v] of words) {
  const ph = v.ph || {};
  const uk = ph.uk || '';
  const us = ph.us || '';
  const ukSrc = uk ? (ph.ukSrc || '') : '';
  const usSrc = us ? (ph.usSrc || '') : '';
  if (uk || us) withPh++;

  const sn = [];   // 释义与 WORD_DB 同源，App 直接读原词表，不再重复打包

  const ex = pickExamples(v.ex);
  const dx = pickDict(v.ex);
  if (dx.length) withDict++;
  exTotal += ex.length;

  const fam = v.fam || {};
  const derive = [];   // 相关词与现有 families_data 98% 重复，不再打包
  const syn = [];
  if (derive.length || syn.length) withFam++;

  const img = '';   // 配图与现有图片库 91% 重复，不再打包
  if (img) withImg++;

  const entry = { w: v.w || k, lv: v.firstLevel || '', ph: [uk, us], ex };
  if (dx.length) entry.dx = dx;
  if (ukSrc || usSrc) entry.phs = [ukSrc, usSrc];
  if (v.collins) entry.co = v.collins;
  if (v.oxford) entry.ox = v.oxford;
  if (v.frq) entry.fr = v.frq;
  pack[k] = entry;
}

const lines = Object.entries(pack).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v));

const body = 'const BANK_PACK = {\n' + lines.join(',\n') + '\n};\n';
fs.writeFileSync(OUT, body, 'utf8');

const bytes = Buffer.byteLength(body);
const gz = require('zlib').gzipSync(Buffer.from(body)).length;
const n = Object.keys(pack).length;

console.log('词数            ', n);
console.log('体积            ', (bytes / 1024 / 1024).toFixed(2) + ' MB', '（gzip ' + (gz / 1024 / 1024).toFixed(2) + ' MB）');
console.log('真题例句        ', exTotal, '条');
console.log('带中文+出处的词典句', withDict, '条');
console.log('平均每词例句    ', (exTotal / n).toFixed(2), '条');
console.log('有音标          ', (withPh / n * 100).toFixed(1) + '%');
console.log('输出            ', path.relative(ROOT, OUT));
