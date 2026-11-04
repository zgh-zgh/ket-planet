// 从真题语料中提取"词级例句池"
// 产出：bank/src/exam_examples.json  { word: [ {en, src, srcType, srcFull, year, region, section, len, score} ] }
// 规则见计划 §4：真题优先、超长降权、回指/残句剔除、同一篇最多取 3 句
const fs = require('fs');
const path = require('path');
const { ROOT, getLevelWords, wordVariants } = require('./_data');
const { splitSentences, tokenize, countWords, loadGaokao, loadZhongkao, buildVariantIndex } = require('./_corpus');

const OUT = path.join(ROOT, 'bank', 'src', 'exam_examples.json');
const LEVEL_EXPECT = { 初中: 10, 高中: 14 };
const GRADE_CN = { 7: '七年级', 8: '八年级', 9: '九年级' };
const MAX_PER_WORD = 6;          // 池子里每词最多留 6 条，词库构建时再挑 4
const MAX_PER_PASSAGE = 2;       // 同一篇语篇最多贡献 2 句，保证例句来自不同文章

// 明显是题目指令 / 回指 / 残句的，直接剔除
const BAD_PATTERNS = [
  /_{2,}/,                       // 填空
  /Directions?\s*:/i,
  /you will hear/i,
  /as mentioned (above|before)/i,
  /the (former|latter)\b/i,
  /this (passage|text|article)\b/i,
  /according to the (passage|text|author)/i,
  /https?:\/\//i,
  /^[-–—]\s/,                    // 对话破折号开头
  /\bA\)\s|\bB\)\s/,             // 选项残留
];

// 以代词开头的句子，脱离上下文往往读不懂 → 重罚
const PRONOUN_START = /^(He|She|It|They|This|That|These|Those|I|We|You|His|Her|Its|Their|Our|My|Your)\b/;

// 常见动词/助动词：一句话里一个都没有，大概率是课表、名单、标题这类碎片
const VERB_HINT = new Set(('is are was were be been being am has have had do does did can could will would shall should may might must ' +
  'go goes went make made get got take took see saw know knew think thought want wanted need needed like liked use used find found ' +
  'give gave come came look looked work worked help helped try tried play played learn learned study studied say said tell told ' +
  'ask asked answer answered become became leave left feel felt keep kept let put mean meant show showed bring brought happen happened ' +
  'start started stop stopped live lived believe believed hold held turn turned follow followed change changed lead led understand understood ' +
  'watch watched sit sat stand stood run ran read write wrote speak spoke buy bought sell sold pay paid send sent build built ' +
  'teach taught learn learnt meet met lose lost win won eat ate drink drank sleep slept walk walked talk talked call called ' +
  'carry carried create created describe described explain explained improve improved include included offer offered provide provided ' +
  'receive received remember remembered decide decided discover discovered develop developed allow allowed consider considered').split(' '));

function isGoodSentence(s) {
  const n = countWords(s);
  if (n < 5 || n > 38) return false;
  for (const re of BAD_PATTERNS) if (re.test(s)) return false;
  // 中文残留（中考语料里有"borrow(借)money"这类夹注、偶有整句中文）→ 一律剔除
  if (/[\u4e00-\u9fa5]/.test(s)) return false;
  // 必须以句末标点收尾（表格行、标题碎片通常没有）
  if (!/[.!?]["')\]]?$/.test(s.trim())) return false;
  // 课表/时间表
  if (/\d{1,2}\s*[:：]\s*\d{2}/.test(s) || /\d{1,2}:\d{2}\s*[~-]\s*\d{1,2}:\d{2}/.test(s)) return false;
  const toks = tokenize(s);
  const rawToks = s.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  const capRatio = rawToks.filter((t) => /^[A-Z]/.test(t)).length / Math.max(1, rawToks.length);
  // 大写词占比过高 = 专有名词堆/表格；再叠加"没有动词"就基本可以确定是碎片
  const hasVerb = toks.some((t) => VERB_HINT.has(t));
  if (capRatio > 0.45 && !hasVerb) return false;
  if (!hasVerb) return false;
  // 全大写（标题）
  if (rawToks.length && rawToks.filter((t) => /^[A-Z]{2,}$/.test(t)).length / rawToks.length > 0.5) return false;
  // 引号不成对（切句切在了引语中间，读起来是残句）
  const dq = (s.match(/"/g) || []).length;
  const cdq = (s.match(/[“”]/g) || []).length;
  if (dq % 2 !== 0 || cdq % 2 !== 0) return false;
  return true;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 把句中的目标词（含变形）包成 <B>...</B>，只处理第一次出现
function highlight(s, variants) {
  for (const v of variants) {
    const re = new RegExp('\\b(' + escapeRe(v) + ')\\b', 'i');
    const m = s.match(re);
    if (m) return s.replace(re, '<B>' + m[1] + '</B>');
  }
  return s;
}

function buildAllowedSets() {
  const junior = getLevelWords('初中').map((x) => x.w.toLowerCase());
  const senior = getLevelWords('高中').map((x) => x.w.toLowerCase());
  // 常见功能词兜底（避免把 the/of/and 算成超纲）
  const FUNC = 'a an the and or but if because when while that which who whom whose what how why where this these those it its he she they them his her their we our you your i me my mine not no nor so than then there here as at by for from in into of on onto over to up with without about above after again against all am are be been being both can could did do does doing down during each few had has have having just may might more most much must now off once only other out own same should some such too under until very was were will would'.split(' ');
  const j = new Set([...junior, ...FUNC]);
  const s = new Set([...junior, ...senior, ...FUNC]);
  return { 初中: j, 高中: s };
}

function oovCount(sentence, allowed) {
  let n = 0;
  for (const t of tokenize(sentence)) if (!allowed.has(t)) n++;
  return n;
}

function main() {
  const junior = getLevelWords('初中');
  const senior = getLevelWords('高中');
  const levelOf = new Map();
  for (const x of junior) levelOf.set(x.w, '初中');
  for (const x of senior) if (!levelOf.has(x.w)) levelOf.set(x.w, '高中');

  const target = [...levelOf.keys()];
  const variantIdx = buildVariantIndex(target);
  const allowedSets = buildAllowedSets();

  const gk = loadGaokao();
  const zk = loadZhongkao();
  console.log(`[语料] 高考 ${gk.stats.papers} 套 / ${gk.stats.passages} 篇；中考 ${zk.stats.items} 题组`);

  // word -> Map(归一化句子 -> 候选)
  const pool = new Map();

  function ingest(items, srcType) {
    let kept = 0, rejected = 0;
    for (const it of items) {
      const sents = splitSentences(it.passage);
      const perWordCount = new Map();   // 本篇内每个词已贡献的句数
      for (const s of sents) {
        if (!isGoodSentence(s)) { rejected++; continue; }
        const toks = tokenize(s);
        const hitWords = new Set();
        for (const t of toks) {
          const set = variantIdx.get(t);
          if (set) for (const w of set) hitWords.add(w);
        }
        if (!hitWords.size) continue;
        const len = countWords(s);
        for (const w of hitWords) {
          if ((perWordCount.get(w) || 0) >= MAX_PER_PASSAGE) continue;
          const lv = levelOf.get(w) || '高中';
          const priority = srcType === 'gaokao' ? 100 : 90;
          const levelMatch = (lv === '初中' && srcType === 'zhongkao') || (lv === '高中' && srcType === 'gaokao') ? 8 : 0;
          const pen = Math.abs(len - LEVEL_EXPECT[lv]) * 1.2
            + oovCount(s, allowedSets[lv]) * 1.0
            + (PRONOUN_START.test(s) ? 6 : 0);
          const score = priority + levelMatch - pen;

          const en = highlight(s, [...wordVariants(w)]);
          const key = en.toLowerCase().replace(/\s+/g, ' ');
          if (!pool.has(w)) pool.set(w, new Map());
          const m = pool.get(w);
          if (m.has(key)) continue;

          const cand = {
            en,
            srcType,
            src: srcType === 'gaokao'
              ? `${it.year}·${it.region}·${it.section}`
              // 中考语料只有年级信息（grade7/8/9），没有年份和卷别。
              // 九年级按中考同难度处理，但不冒充"中考真题"，避免标错。
              : `${GRADE_CN[it.grade] || '初中'}·${it.section}`,
            srcFull: srcType === 'gaokao'
              ? `${it.paperTitle || ''} · ${it.sectionFull || ''}`.trim()
              : `《初中英语试卷数据集》 · ${GRADE_CN[it.grade] || ''} · ${it.section}（该数据源未提供年份/地区/卷别）`,
            year: it.year || null,
            region: it.region || null,
            section: it.section || '',
            len,
            score: +score.toFixed(1),
          };
          m.set(key, cand);
          kept++;
          perWordCount.set(w, (perWordCount.get(w) || 0) + 1);
        }
      }
    }
    console.log(`[ingest] ${srcType}: 保留 ${kept} 条候选，剔除 ${rejected} 句`);
  }

  ingest(gk.items, 'gaokao');
  ingest(zk.items, 'zhongkao');

  // 每词按分数截断
  const out = {};
  let wordsWithExam = 0, totalKept = 0;
  for (const w of target) {
    const m = pool.get(w);
    if (!m) { out[w] = []; continue; }
    const arr = [...m.values()].sort((a, b) => b.score - a.score).slice(0, MAX_PER_WORD);
    out[w] = arr;
    if (arr.length) wordsWithExam++;
    totalKept += arr.length;
  }

  fs.writeFileSync(OUT, JSON.stringify(out));
  const sizeMB = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log(`[done] 有真题例句的词=${wordsWithExam}/${target.length} (${(wordsWithExam / target.length * 100).toFixed(1)}%)  总数=${totalKept}  体积=${sizeMB}MB`);
  console.log(`[out] ${OUT}`);
}

main();
