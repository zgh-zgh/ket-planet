// 音节数据自检：保证「内置词库 100% 有拆分」且「每一条拆分都能拼回原词」
// 用法：node scripts/check_syllables.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const WORD_DB = new Function(read('words-data.js') + '; return WORD_DB;')();
const SYLLABLES_DATA = new Function(read('syllables_data.js') + '; return SYLLABLES_DATA;')();
const { SYL_EXTRA, SYL_FIX } = new Function(read('syllables_extra.js') + '; return { SYL_EXTRA, SYL_FIX };')();

const info = w => SYL_FIX[String(w).toLowerCase()] || SYLLABLES_DATA[String(w).toLowerCase()] || SYL_EXTRA[String(w).toLowerCase()] || null;

let total = 0, missing = [], bad = [];
for (const lv of Object.keys(WORD_DB)) {
  for (const [w] of WORD_DB[lv]) {
    total++;
    const v = info(w);
    if (!v) { missing.push(`${lv}:${w}`); continue; }
    if (v.l.join('').toLowerCase() !== String(w).toLowerCase()) bad.push(`${w} 拼不回原词: ${v.l.join('·')}`);
    if (v.n !== v.l.length) bad.push(`${w} 音节数不符: n=${v.n} 实际 ${v.l.length}`);
    if (v.s >= v.l.length || v.s < -1) bad.push(`${w} 重音下标越界: ${v.s}`);
    if (v.l.some(x => !x)) bad.push(`${w} 存在空分段`);
  }
}
for (const [k, tbl] of [['extra', SYL_EXTRA], ['fix', SYL_FIX]]) {
  for (const [w, v] of Object.entries(tbl)) {
    if (v.l.join('').toLowerCase() !== w) bad.push(`[${k}] ${w} 拼不回原词`);
    if (v.n !== v.l.length) bad.push(`[${k}] ${w} 音节数不符`);
  }
}

console.log(`词库总数 ${total}`);
console.log(`缺音节数据 ${missing.length}` + (missing.length ? '：' + missing.slice(0, 20).join('、') : ''));
console.log(`数据异常 ${bad.length}` + (bad.length ? '：\n  ' + bad.slice(0, 20).join('\n  ') : ''));
console.log(`人工校正 ${Object.keys(SYL_FIX).length} 条，补充 ${Object.keys(SYL_EXTRA).length} 条`);
if (missing.length || bad.length) process.exitCode = 1; else console.log('✅ 覆盖率 100%，全部拆分自洽');
