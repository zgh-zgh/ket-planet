// 语料通用工具：读取中/高考语料 -> 切句 -> 词形索引
// 供 probe_corpus.js 与 build_exam_examples.js 共用
const fs = require('fs');
const path = require('path');
const { ROOT, getLevelWords, wordVariants } = require('./_data');

const CORPUS = path.join(ROOT, 'corpus');

// 常见缩写，切句时先遮住，避免 Mr. / U.S. 被当成句末
const ABBR = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'St.', 'Jr.', 'Sr.', 'vs.', 'etc.', 'e.g.', 'i.e.',
  'U.S.', 'U.K.', 'No.', 'Ave.', 'Fig.', 'p.m.', 'a.m.', 'Inc.', 'Ltd.', 'Co.'];

function splitSentences(text) {
  let t = String(text || '').replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  // 遮住缩写
  ABBR.forEach((a, i) => { t = t.split(a).join('§' + i + '§'); });
  const parts = t.match(/[^.!?]+[.!?]+["')\]]?/g) || [t];
  return parts
    .map((s) => {
      let r = s;
      ABBR.forEach((a, i) => { r = r.split('§' + i + '§').join(a); });
      return r.trim();
    })
    .filter((s) => s.length > 0);
}

function tokenize(s) {
  return (String(s).toLowerCase().match(/[a-z][a-z'’-]*/g) || []).map((x) => x.replace(/[’]/g, "'"));
}

function countWords(s) {
  return tokenize(s).length;
}

// ---------- 高考语料 ----------
// 只取"完整语篇"：阅读理解文章。
// 完形/七选五的原文被抽掉了空格处的词（"I 21 a note" 实为 "I put a note"），
// 直接当例句会误导学生，故整体排除。
function loadGaokao() {
  const file = path.join(CORPUS, 'gaokao', 'structured', 'database.json');
  if (!fs.existsSync(file)) return { items: [], stats: { papers: 0, passages: 0 } };
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = [];

  for (const p of db.papers || []) {
    const base = { year: p.year, region: p.region, paperTitle: p.title, level: '高中' };
    for (const r of p.readings || []) {
      if (!r || !r.passage) continue;
      if (/_{2,}/.test(r.passage)) continue;          // 带填空标记的不要
      items.push({
        ...base,
        section: r.label ? '阅读' + r.label : '阅读',
        sectionFull: '阅读理解 ' + (r.label || '') + ' 篇',
        passage: r.passage,
        difficulty: r.difficulty,
      });
    }
  }
  return { items, stats: { papers: (db.papers || []).length, passages: items.length } };
}

// ---------- 中考语料 ----------
// JSONL：{ context, questions:[...], type }
// 只取阅读理解（原文完整）；完形/单选一律排除（前者被挖空，后者多为一句话题干）。
// 注意：该数据源没有年份/地区，section 只能到题型。
const ZK_KEEP = {
  'Reading-Comprehension-With-Multiple-Choices': '阅读理解',
  'Reading-Comprehension-With-True-or-False': '阅读理解',
};

function loadZhongkao() {
  const dir = path.join(CORPUS, 'zhongkao');
  if (!fs.existsSync(dir)) return { items: [], stats: { files: 0, items: 0 } };
  const items = [];
  let files = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const typeKey = f.replace(/^grade\d_/, '').replace(/\.jsonl$/, '');
    const section = ZK_KEEP[typeKey];
    if (!section) continue;                            // 只要阅读理解
    files++;
    const grade = (f.match(/^grade(\d)/) || [, '?'])[1];
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let j;
      try { j = JSON.parse(line); } catch (e) { continue; }
      const ctx = j.context || '';
      if (!ctx || ctx.length < 60) continue;
      if (/<blank|blank text|Directions:|you will hear/i.test(ctx)) continue;
      if (/_{2,}/.test(ctx)) continue;
      items.push({
        year: null, region: null, paperTitle: null, level: '初中',
        grade: grade === '?' ? null : Number(grade),
        section, sectionFull: section, passage: ctx,
      });
    }
  }
  return { items, stats: { files, items: items.length } };
}

// ---------- 变体索引 ----------
// variant -> Set(原词)
function buildVariantIndex(words) {
  const idx = new Map();
  for (const w of words) {
    for (const v of wordVariants(w)) {
      if (!idx.has(v)) idx.set(v, new Set());
      idx.get(v).add(w);
    }
  }
  return idx;
}

module.exports = { splitSentences, tokenize, countWords, loadGaokao, loadZhongkao, buildVariantIndex, CORPUS };
