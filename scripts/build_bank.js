// 组装中/高考词库数据包
// 输入：words-data.js / examples_src.json / exam_examples.json / extras_data.js
//       ecdict_data.js / wiktionary_data.js / families_data.js / morph_data.js
//       wordnet_data.js / synonyms_data.js / syllables_data.js / pics_data.js / atlas_pics.js
// 输出：bank/zhongkao.js、bank/gaokao.js（每行一个词，可直接 <script> 加载，也可人工改）
const fs = require('fs');
const path = require('path');
const { ROOT, load, getLevelWords } = require('./_data');

const BANK_DIR = path.join(ROOT, 'bank');
const SRC_DIR = path.join(BANK_DIR, 'src');
const MAX_EX = 4;          // 每词最多例句数（2~3 条学习 + 1 条留给填空）
const MAX_EXAM = 3;        // 其中真题最多 3 条
const MAX_DERIVE = 6;
const MAX_SYN = 6;

function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; }
}

// ---------- 释义结构化 ----------
const POS_RE = /^(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|modal|abbr)\.\s*(.*)$/i;

function parseSenses(cn) {
  const parts = String(cn || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let cur = null;
  for (const p of parts) {
    const m = p.match(POS_RE);
    if (m) {
      const pos = m[1].toLowerCase();
      const last = out[out.length - 1];
      if (last && last.pos === pos) { cur = last; } else { cur = { pos, cn: [] }; out.push(cur); }
      if (m[2]) cur.cn.push(m[2]);
    } else if (cur) {
      cur.cn.push(p);
    } else {
      cur = { pos: '', cn: [p] };
      out.push(cur);
    }
  }
  for (const o of out) {
    o.cn = [...new Set(o.cn.flatMap((x) => x.split(/[，,、]/).map((s) => s.trim())).filter(Boolean))].slice(0, 5);
  }
  return out.filter((o) => o.cn.length);
}

// ---------- 音标 ----------
// ECDICT 用的是西里尔字母 ә(U+04D9)、ASCII 撇号与冒号，转成标准 IPA 字符
function normIpa(s) {
  return String(s || '')
    .replace(/\u04D9/g, 'ə')   // ә -> ə
    .replace(/\u04D8/g, 'Ə')
    .replace(/'/g, 'ˈ')         // ' -> ˈ
    .replace(/:/g, 'ː')         // : -> ː
    .trim();
}

function wrapSlash(s) {
  const t = normIpa(s);
  if (!t) return '';
  return /^\/.*\/$/.test(t) ? t : '/' + t.replace(/^\/|\/$/g, '') + '/';
}

// ---------- 相关词 ----------
function buildFamily(w, ctx) {
  const { FAMILY, MORPH, WORDNET, SYN_MAP, ECDICT, VOCAB_CN, SUPPLEMENT } = ctx;
  const key = w.toLowerCase();
  const res = { root: '', affix: [], derive: [], syn: [] };
  const seen = new Set([key]);

  const pushDerive = (arr) => {
    for (const it of arr || []) {
      const word = Array.isArray(it) ? it[0] : it && it.w;
      let ph = Array.isArray(it) ? it[1] : it && it.ph;
      let cn = Array.isArray(it) ? it[2] : it && it.cn;
      if (!word) continue;
      const k = String(word).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      // 派生词缺音标/释义时，用本地数据补齐
      if (!ph) ph = (ECDICT[k] || {}).ph || '';
      if (!cn) cn = VOCAB_CN[k] || '';
      res.derive.push({ w: word, ph: wrapSlash(ph), cn: String(cn || '').slice(0, 28) });
      if (res.derive.length >= MAX_DERIVE) return;
    }
  };

  // ① 人工核订的透明构词优先
  const mo = MORPH[key];
  if (mo) {
    res.root = mo.root || '';
    if (mo.pre) res.affix.push({ part: mo.pre + '-', type: '前缀', mean: (FAMILY.meta.pfx || {})[mo.pre] || '' });
    pushDerive(mo.fam);
  }

  // ② 词根族 / 词族
  if (!res.derive.length) {
    const head = FAMILY.w2f[key];
    if (head && FAMILY.roots[head]) {
      res.root = head;
      pushDerive(FAMILY.roots[head].w);
    } else if (head && FAMILY.fams[head]) {
      pushDerive(FAMILY.fams[head]);
    }
  }

  // ③ 同义词（WordNet）+ 近义辨析组
  // WordNet 会给出生僻同义词（如 abandon -> unconstraint），用 ECDICT 词频/星级过滤
  const isCommon = (x) => {
    const e = ECDICT[String(x).toLowerCase()];
    if (!e) return false;
    const col = Number(e.collins) || 0;
    const frq = Number(e.frq) || 0;
    return col >= 2 || (frq > 0 && frq <= 12000);
  };
  const wn = WORDNET[key];
  if (wn && Array.isArray(wn.s)) {
    for (const s of wn.s) {
      const word = String(s).replace(/\(.*?\)/g, '').trim();
      if (!word || word.toLowerCase() === key) continue;
      if (!isCommon(word)) continue;
      if (!res.syn.includes(word)) res.syn.push(word);
      if (res.syn.length >= MAX_SYN) break;
    }
  }
  const groups = SYN_MAP[key];
  if (groups) {
    for (const g of groups) {
      if (!res.synGroup) res.synGroup = { topic: g.topic, items: [] };
      for (const it of g.words) {
        if (it.w.toLowerCase() === key) continue;
        if (res.synGroup.items.length < 4) res.synGroup.items.push({ w: it.w, d: it.d });
      }
    }
  }

  // ④ 人工补充词族（bank/src/family_supplement.json，优先级最高）
  const sup = SUPPLEMENT[key];
  if (sup) {
    if (sup.root) res.root = sup.root;
    if (Array.isArray(sup.derive)) pushDerive(sup.derive.map((x) => (typeof x === 'string' ? { w: x } : x)));
    if (Array.isArray(sup.syn)) {
      for (const s of sup.syn) if (!res.syn.includes(s)) res.syn.push(s);
    }
  }

  return res;
}

// ---------- 例句组装 ----------
function cleanEn(s) {
  return String(s || '').replace(/<\/?b>/gi, (m) => (m.toLowerCase() === '<b>' ? '<B>' : '</B>'));
}

function dedupeKey(en) {
  return String(en).replace(/<\/?B>/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function dictMeta(src) {
  const s = String(src || '').trim();
  if (!s) return { src: '有道例句', srcType: 'dict', srcFull: '有道词典双语例句（接口未标注具体词典）' };
  if (/柯林斯/.test(s)) return { src: '柯林斯', srcType: 'dict', srcFull: '《柯林斯英汉双解大词典》（有道词典接口）' };
  if (/牛津/.test(s)) return { src: '牛津', srcType: 'dict', srcFull: '《牛津词典》（有道词典接口）' };
  if (/新英汉/.test(s)) return { src: '新英汉', srcType: 'dict', srcFull: '《新英汉大辞典》（有道词典接口）' };
  // 影视剧名形如《家有儿女》刘星，只取书名号内的剧名
  const drama = s.match(/^《([^》]+)》/);
  if (drama) return { src: drama[1], srcType: 'media', srcFull: s + '（有道词典接口）' };
  return { src: s.replace(/^《|》$/g, ''), srcType: 'media', srcFull: s + '（有道词典接口）' };
}

function buildExamples(w, ctx) {
  const key = w.toLowerCase();
  const { EXAM_POOL, DICT_EX, EXTRAS, MANUAL } = ctx;
  // 数据源的键有的是原词（China）、有的是小写（china），两种都要试
  const pick = (obj) => (obj && (obj[w] || obj[key])) || [];
  const out = [];
  const seen = new Set();

  const push = (item) => {
    if (!item || !item.en) return;
    const k = dedupeKey(item.en);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(item);
  };

  // ① 人工补充（最高优先级）
  let examCount = 0;
  for (const e of pick(MANUAL)) {
    push({
      en: cleanEn(e.en), cn: String(e.cn || ''),
      src: e.src || '自建', srcType: 'manual', srcFull: e.srcFull || '人工补充例句',
    });
  }

  // ② 真题
  for (const e of pick(EXAM_POOL)) {
    if (examCount >= MAX_EXAM || out.length >= MAX_EX) break;
    const yearNum = Number(e.year);
    const full = e.srcType === 'gaokao'
      ? `${Number.isFinite(yearNum) ? yearNum + '年' : ''}高考英语（${e.region || ''}）· ${e.sectionFull || e.section || ''}`
      : '中考真题 · ' + (e.section || '阅读理解') + '（该来源未提供年份/地区）';
    push({
      en: e.en, cn: '',
      src: e.src, srcType: e.srcType, srcFull: full,
      ...(Number.isFinite(yearNum) ? { year: yearNum } : {}),
      ...(e.region ? { region: e.region } : {}),
      ...(e.section ? { section: e.section } : {}),
    });
    examCount++;
  }

  // ③ 词典句
  for (const e of pick(DICT_EX)) {
    if (out.length >= MAX_EX) break;
    const m = dictMeta(e.src);
    push({ en: cleanEn(e.en), cn: String(e.cn || ''), ...m });
  }

  // ④ 新闻句（无中文）
  for (const e of pick(EXTRAS)) {
    if (out.length >= MAX_EX) break;
    push({ en: cleanEn(e.en), cn: '', src: String(e.src || 'NEWS'), srcType: 'news', srcFull: '新闻语料 · ' + (e.src || '') });
  }

  return out;
}

function main() {
  const WORD_DB = load('WORD_DB');
  const VOCAB_CN = {};
  for (const lv of Object.keys(WORD_DB)) {
    for (const [w, cn] of WORD_DB[lv]) VOCAB_CN[String(w).toLowerCase()] = cn;
  }

  const ctx = {
    EXAM_POOL: readJson(path.join(SRC_DIR, 'exam_examples.json'), {}),
    DICT_EX: readJson(path.join(SRC_DIR, 'examples_src.json'), {}),
    MANUAL: readJson(path.join(SRC_DIR, 'manual_examples.json'), {}),
    SUPPLEMENT: readJson(path.join(SRC_DIR, 'family_supplement.json'), {}),
    PH_SRC: readJson(path.join(SRC_DIR, 'phonetic_src.json'), {}),
    VOCAB_CN,
    FAMILY: load('FAMILY_DATA'),
    MORPH: load('MORPH_DATA'),
    WORDNET: load('WORDNET_DATA'),
    ECDICT: load('ECDICT_DATA'),
    WIKT: load('WIKTIONARY_DATA'),
    SYL: load('SYLLABLES_DATA'),
    PICS: load('PICS_DATA'),
    ATLAS: load('ATLAS_PICS'),
    EXTRAS: load('EXTRAS_DATA'),
  };

  // 近义辨析组：word -> [{topic, words}]
  const SYN_MAP = {};
  const SG = load('SYNONYM_GROUPS');
  for (const k of Object.keys(SG || {})) {
    const g = SG[k];
    if (!g || !Array.isArray(g.words)) continue;
    for (const it of g.words) {
      const w = String(it.w || '').toLowerCase();
      if (!w) continue;
      (SYN_MAP[w] = SYN_MAP[w] || []).push({ topic: g.topic, words: g.words });
    }
  }
  ctx.SYN_MAP = SYN_MAP;

  const junior = getLevelWords('初中');
  const senior = getLevelWords('高中');
  const firstLevel = new Map();
  for (const x of junior) firstLevel.set(x.w, '初中');
  for (const x of senior) if (!firstLevel.has(x.w)) firstLevel.set(x.w, '高中');

  const zkWords = junior.map((x) => x.w);
  const gkWords = [...firstLevel.keys()];

  function makeEntry(w, cn) {
    const key = w.toLowerCase();
    const ec = ctx.ECDICT[key] || {};
    const yd = ctx.PH_SRC[w] || ctx.PH_SRC[key] || {};
    // 英音：ECDICT 优先，缺失用有道；美音：Wiktionary 优先，缺失用有道
    const ukEcdict = wrapSlash(ec.ph);
    const uk = ukEcdict || wrapSlash(yd.uk);
    const ukSrc = ukEcdict ? 'ECDICT' : (uk ? '有道' : '');
    const usWiki = wrapSlash(ctx.WIKT[w] || ctx.WIKT[key]);
    const us = usWiki || wrapSlash(yd.us);
    const usSrc = usWiki ? 'Wiktionary' : (us ? '有道' : '');
    const syl = ctx.SYL[key] || null;
    const img = ctx.PICS[key] || ctx.ATLAS[key] || '';
    const fam = buildFamily(w, ctx);
    const ex = buildExamples(w, ctx);

    const flags = [];
    const examN = ex.filter((e) => e.srcType === 'gaokao' || e.srcType === 'zhongkao').length;
    if (examN === 0) flags.push('no_exam_ex');
    else if (examN < 2) flags.push('few_exam_ex');
    if (ex.length < 2) flags.push('few_ex');
    if (!uk) flags.push('no_ph_uk');
    if (!us) flags.push('no_ph_us');
    if (!syl) flags.push('no_syl');
    if (!img) flags.push('no_img');
    if (!fam.root && fam.derive.length < 2 && !fam.syn.length) flags.push('fam_gap');

    const tag = ec.tag ? String(ec.tag).split(/\s+/).filter(Boolean) : [];

    return {
      w,
      firstLevel: firstLevel.get(w) || '高中',
      cn,
      senses: parseSenses(cn),
      ph: { uk, ukSrc, us, usSrc },
      audio: { url: 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(w) + '&type=2', src: '有道真人发音' },
      ex,
      fam,
      tag,
      collins: Number(ec.collins) || 0,
      oxford: Number(ec.oxford) || 0,
      frq: Number(ec.frq) || 0,
      img,
      syl,
      flags,
    };
  }

  function writeBank(name, words, varName) {
    const lines = [];
    const report = { total: words.length };
    for (const { w, cn } of words) {
      const e = makeEntry(w, cn);
      lines.push(JSON.stringify(e.w) + ':' + JSON.stringify(e));
    }
    const head = '// 自动生成，请勿手改格式；改数据请改 bank/src/*.json 或本文件对应行后重跑 node scripts/build_bank.js\n'
      + '// 词库：' + (name === 'zhongkao' ? '中考（初中词表）' : '高考（初中+高中累计）') + '  生成时间：' + new Date().toISOString().slice(0, 10) + '\n'
      + '// 字段说明见 bank/README.md\n'
      + 'const ' + varName + ' = {\n' + lines.join(',\n') + '\n};\n'
      + 'if (typeof module !== "undefined" && module.exports) module.exports = ' + varName + ';\n';
    const out = path.join(BANK_DIR, name + '.js');
    fs.writeFileSync(out, head);
    const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
    console.log(`[write] ${name}.js  ${words.length} 词  ${mb}MB`);
    return report;
  }

  writeBank('zhongkao', junior, 'BANK_ZHONGKAO');
  writeBank('gaokao', gkWords.map((w) => {
    const cn = (junior.find((x) => x.w === w) || senior.find((x) => x.w === w) || {}).cn || '';
    return { w, cn };
  }), 'BANK_GAOKAO');

  // 两库关系
  const overlap = {
    generatedAt: new Date().toISOString(),
    zhongkao: zkWords.length,
    gaokao: gkWords.length,
    shared: zkWords.length,
    gaokaoOnly: gkWords.filter((w) => !zkWords.includes(w)),
  };
  fs.writeFileSync(path.join(BANK_DIR, 'overlap.json'), JSON.stringify(overlap, null, 2));
  console.log(`[write] overlap.json  共有=${overlap.shared}  高考独有=${overlap.gaokaoOnly.length}`);
}

main();
