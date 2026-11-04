// 从四六级真题题库（SQLite）里抽取「词级例句池」
//
// 语料：corpus/cet/cet4_v2.db
//   来源 ShepiTT/CET_practice_questions（Apache-2.0），含 2019–2025 四六级真题的
//   仔细阅读（reading）与长篇阅读（matching）原文。选词填空（cloze）被挖空，不用。
// 产出：bank/src/exam_examples_cet.json
const fs = require('fs');
const path = require('path');
const { ROOT, getLevelWords, wordVariants } = require('./_data');
const { splitSentences, countWords, loadGaokao } = require('./_corpus');
const { DatabaseSync } = require('node:sqlite');

const CET_DIR = path.join(ROOT, 'corpus', 'cet');
const DB_FILE = path.join(CET_DIR, 'cet4_v2.db');
const OUT = path.join(ROOT, 'bank', 'src', 'exam_examples_cet.json');

const MAX_PER_WORD = 6;
const MAX_PER_PASSAGE = 2;
const LEVEL_EXPECT = { 四级: 16, 六级: 18 };
const BAD_START = /^(Questions?|Directions?|Section|Part|Passage|According to the passage|What|Which|Why|How|Where|When|Who|Identify|Answer)\b/i;
const SECTION_NAME = { reading: '仔细阅读', matching: '长篇阅读' };

// 全角标点转半角（OCR 残留）
function normalize(s) {
  return String(s || '')
    .replace(/[，]/g, ', ').replace(/[。]/g, '. ').replace(/[；]/g, '; ')
    .replace(/[！]/g, '! ').replace(/[？]/g, '? ').replace(/[：]/g, ': ')
    .replace(/[（）]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// 长篇阅读开头有一整段 Directions，段落还带 A) B) 编号，都要清掉
function cleanPassage(text, type) {
  let t = normalize(text);
  if (type === 'matching') {
    const i = t.search(/Answer Sheet\s*\d?\.?/i);
    if (i > 0) t = t.slice(i + t.slice(i).search(/\./) + 1);
    t = t.replace(/(^|\s)[A-J]\)\s*/g, ' $1');   // 去掉段落字母
  }
  return t;
}

function isGoodSentence(s) {
  const n = countWords(s);
  if (n < 6 || n > 38) return false;
  if (/[\u4e00-\u9fa5]/.test(s)) return false;
  if (/_{2,}/.test(s)) return false;
  if (/[A-D]\s*\)/.test(s)) return false;
  if (/^[\d\s.]+/.test(s)) return false;
  if (BAD_START.test(s)) return false;
  if ((s.match(/"/g) || []).length % 2) return false;
  return /[a-z]{3}/.test(s);
}

function highlight(sentence, forms) {
  const re = /[A-Za-z][A-Za-z'-]*/g;
  let m;
  while ((m = re.exec(sentence))) {
    const w = m[0].toLowerCase().replace(/['’]s$/, '');
    if (forms.has(w)) {
      return sentence.slice(0, m.index) + '<B>' + m[0] + '</B>' + sentence.slice(m.index + m[0].length);
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('缺少题库 corpus/cet/cet4_v2.db（来源见 corpus/cet/README.md）');
    process.exit(1);
  }

  const lv4 = getLevelWords('四级');
  const lv6 = getLevelWords('六级');
  const levelOf = new Map();
  lv4.forEach(x => levelOf.set(x.w.toLowerCase(), '四级'));
  lv6.forEach(x => { if (!levelOf.has(x.w.toLowerCase())) levelOf.set(x.w.toLowerCase(), '六级'); });

  const variantIdx = new Map();
  for (const w of levelOf.keys()) {
    for (const v of wordVariants(w)) {
      if (!variantIdx.has(v)) variantIdx.set(v, new Set());
      variantIdx.get(v).add(w);
    }
  }

  const db = new DatabaseSync(DB_FILE);
  const rows = db.prepare(
    "select source_file, group_type, passage from question_group where group_type in ('reading','matching') and passage is not null and length(passage) > 400"
  ).all();
  db.close();

  const pool = new Map();
  let passages = 0, sents = 0, kept = 0, rejected = 0, noSource = 0;

  // 把一篇语料喂进池子：四六级真题与高考真题共用同一套过滤/匹配逻辑
  function ingest(text, meta) {
    const list = splitSentences(text);
    const perPassage = new Map();
    for (const s of list) {
      sents++;
      if (!isGoodSentence(s)) { rejected++; continue; }
      const toks = (s.toLowerCase().match(/[a-z][a-z'’-]*/g) || []).map(t => t.replace(/['’]s$/, ''));
      const hit = new Set();
      for (const t of toks) {
        const set = variantIdx.get(t);
        if (set) for (const w of set) hit.add(w);
      }
      if (!hit.size) continue;
      const len = countWords(s);
      for (const w of hit) {
        if ((perPassage.get(w) || 0) >= MAX_PER_PASSAGE) continue;
        const en = highlight(s, wordVariants(w));
        if (!en) continue;
        const key = en.toLowerCase().replace(/\s+/g, ' ');
        if (!pool.has(w)) pool.set(w, new Map());
        const bag = pool.get(w);
        if (bag.has(key)) continue;
        const lv = levelOf.get(w) || '四级';
        bag.set(key, {
          en,
          src: meta.src,
          srcType: meta.srcType,
          srcFull: meta.srcFull,
          ...(meta.year ? { year: meta.year } : {}),
          ...(meta.section ? { section: meta.section } : {}),
          len,
          score: +(meta.priority - Math.abs(len - LEVEL_EXPECT[lv]) * 1.5).toFixed(1),
        });
        perPassage.set(w, (perPassage.get(w) || 0) + 1);
        kept++;
      }
    }
  }

  for (const r of rows) {
    const m = String(r.source_file || '').match(/^(\d{4})-(\d{2})-CET([46])-(\d+)/);
    if (!m) { noSource++; continue; }
    const year = Number(m[1]), month = Number(m[2]), book = m[3], paper = Number(m[4]);
    const section = SECTION_NAME[r.group_type] || '阅读';
    const text = cleanPassage(r.passage, r.group_type);
    if (text.length < 400) continue;
    passages++;
    ingest(text, {
      src: `${year}.${String(month).padStart(2, '0')}·CET${book}·${section}`,
      srcType: 'cet' + book,
      srcFull: `${year} 年 ${month} 月大学英语${book === '4' ? '四' : '六'}级考试（第 ${paper} 套）· ${section}`,
      year, section, priority: 100,
    });
  }

  // 高考真题补充：四六级词里有相当一部分在高考阅读中出现过，比只剩词典句强
  let gkPassages = 0;
  try {
    const gk = loadGaokao();
    for (const it of gk.items) {
      if (!it.passage || it.passage.length < 300) continue;
      gkPassages++;
      ingest(it.passage, {
        src: `${it.year}·${it.region}·${it.section}`,
        srcType: 'gaokao',
        srcFull: `${it.paperTitle || ''} · ${it.sectionFull || ''}`.trim(),
        year: it.year, section: it.section, priority: 92,
      });
    }
  } catch (e) {
    console.log('[warn] 高考语料未读取：', e.message);
  }

  const out = {};
  for (const [w, bag] of pool) {
    out[w] = [...bag.values()].sort((a, b) => b.score - a.score).slice(0, MAX_PER_WORD);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0), 'utf8');

  const c4 = lv4.filter(x => out[x.w.toLowerCase()]).length;
  const c6 = lv6.filter(x => out[x.w.toLowerCase()]).length;
  console.log(`[语料] 四六级 ${passages} 篇 + 高考 ${gkPassages} 篇 / ${sents} 句，剔除 ${rejected} 句`);
  console.log(`[产出] ${Object.keys(out).length} 词有真题例句，共 ${kept} 条，${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
  console.log(`[覆盖] 四级 ${c4}/${lv4.length} (${(c4 / lv4.length * 100).toFixed(1)}%)  六级 ${c6}/${lv6.length} (${(c6 / lv6.length * 100).toFixed(1)}%)`);
}

main();
