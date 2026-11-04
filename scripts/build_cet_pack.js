// 生成四六级精简包 bank/pack_cet.js（结构与 bank/pack.js 完全一致）
//
// 只装 App 学习页与题型真正会读的字段：音标（英/美含来源）、例句（真题优先、带出处）、
// 一条带中文与出处的词典句、词频星级。释义/相关词/配图仍由 App 现有的全局数据提供。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { ROOT, load } = require('./_data');

const SRC = path.join(ROOT, 'bank', 'src');
const OUT = path.join(ROOT, 'bank', 'pack_cet.js');
const MAX_EXAM = 3;
const MAX_MANUAL = 2;

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };

function normIpa(s) {
  return String(s || '')
    .replace(/\u04D9/g, 'ə').replace(/\u04D8/g, 'Ə')
    .replace(/'/g, 'ˈ').replace(/:/g, 'ː').trim();
}
function wrapSlash(s) {
  const t = normIpa(s);
  if (!t) return '';
  return /^\/.*\/$/.test(t) ? t : '/' + t.replace(/^\/|\/$/g, '') + '/';
}

function main() {
  const WORD_DB = load('WORD_DB');
  const ECDICT = load('ECDICT_DATA');
  const WIKT = load('WIKTIONARY_DATA');

  const EXAM = readJson(path.join(SRC, 'exam_examples_cet.json'), {});
  const DICT = readJson(path.join(SRC, 'examples_src.json'), {});
  const MANUAL = readJson(path.join(SRC, 'manual_examples.json'), {});
  const PH = readJson(path.join(SRC, 'phonetic_src.json'), {});

  // 四级/六级各自只装"本级新增词"，初中/高中词已在 pack.js 里
  const seen = new Set();
  const list = [];
  for (const lv of ['四级', '六级']) {
    for (const [w] of WORD_DB[lv] || []) {
      const k = String(w).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ w, lv, key: k });
    }
  }

  const pack = {};
  let exTotal = 0, examWords = 0, manualTotal = 0, dictTotal = 0, withPh = 0;

  for (const { w, lv, key } of list) {
    const ec = ECDICT[key] || {};
    const yd = PH[w] || PH[key] || {};
    const ukEcdict = wrapSlash(ec.ph);
    const uk = ukEcdict || wrapSlash(yd.uk);
    const ukSrc = ukEcdict ? 'ECDICT' : (uk ? '有道' : '');
    const usWiki = wrapSlash(WIKT[w] || WIKT[key]);
    const us = usWiki || wrapSlash(yd.us);
    const usSrc = usWiki ? 'Wiktionary' : (us ? '有道' : '');
    if (uk || us) withPh++;

    const pick = (obj) => (obj && (obj[w] || obj[key])) || [];
    const out = [];
    const used = new Set();
    const push = (en, src, srcType, cn) => {
      if (!en) return false;
      const k = String(en).toLowerCase();
      if (used.has(k)) return false;
      used.add(k);
      out.push([en, src || '', srcType || '', cn || '']);
      return true;
    };

    // ① 人工补充
    let manual = 0;
    for (const e of pick(MANUAL)) {
      if (manual >= MAX_MANUAL) break;
      if (push(e.en, e.src || '自建', 'manual', e.cn)) manual++;
    }
    manualTotal += manual;
    const cap = manual ? MAX_MANUAL + 2 : MAX_EXAM;

    // ② 真题：四六级卷优先，其次高考卷；同类按长度贴合度排序
    const pool = pick(EXAM).slice().sort((a, b) => {
      const pa = a.srcType === 'gaokao' ? 0 : 1;
      const pb = b.srcType === 'gaokao' ? 0 : 1;
      return pb - pa || (b.score || 0) - (a.score || 0);
    });
    let exam = 0;
    for (const e of pool) {
      if (out.length >= cap) break;
      if (push(e.en, e.src, e.srcType, '')) exam++;
    }
    if (exam) examWords++;
    exTotal += out.length;

    // ③ 一条「中文 + 出处」齐全的词典句
    let dx = [];
    for (const e of pick(DICT)) {
      if (!e.cn || !e.src) continue;
      dx = [[e.en, e.cn, e.src]];
      break;
    }
    if (dx.length) dictTotal++;

    const entry = { w, lv, ph: [uk, us], ex: out };
    if (dx.length) entry.dx = dx;
    if (ukSrc || usSrc) entry.phs = [ukSrc, usSrc];
    if (ec.collins) entry.co = Number(ec.collins) || ec.collins;
    if (ec.oxford) entry.ox = Number(ec.oxford) || ec.oxford;
    if (ec.frq) entry.fr = Number(ec.frq) || ec.frq;
    pack[key] = entry;
  }

  const lines = Object.entries(pack).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v));
  const body = 'const BANK_PACK_CET = {\n' + lines.join(',\n') + '\n};\n';
  fs.writeFileSync(OUT, body, 'utf8');

  const n = Object.keys(pack).length;
  const gz = zlib.gzipSync(Buffer.from(body)).length;
  console.log('词数            ', n, `（四级 ${list.filter(x => x.lv === '四级').length} / 六级 ${list.filter(x => x.lv === '六级').length}）`);
  console.log('体积            ', (Buffer.byteLength(body) / 1048576).toFixed(2) + ' MB', `（gzip ${(gz / 1048576).toFixed(2)} MB）`);
  console.log('有真题例句的词  ', examWords, `(${(examWords / n * 100).toFixed(1)}%)`, '共', exTotal, '条');
  console.log('人工补充        ', manualTotal, '条');
  console.log('带中文出处的词典句', dictTotal, '条');
  console.log('有音标          ', (withPh / n * 100).toFixed(1) + '%');
  console.log('输出            ', path.relative(ROOT, OUT));
}

main();
