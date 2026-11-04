// 词库校验报告：bank/report.md + bank/report.json
// 用法：node scripts/build_bank_report.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const BANK = path.join(ROOT, 'bank');

function loadBank(name) {
  const code = fs.readFileSync(path.join(BANK, name + '.js'), 'utf8');
  const i = code.indexOf('= {');
  const j = code.lastIndexOf('};');
  return JSON.parse(code.slice(i + 2, j + 1));
}

const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : 0);

function analyze(bank, label) {
  const words = Object.values(bank);
  const n = words.length;
  const stat = {
    label, total: n,
    phUk: 0, phUs: 0,
    exGe2: 0, exGe4: 0,
    examGe1: 0, examGe2: 0,
    famAny: 0, famGap: 0,
    sylOk: 0, sylTotal: 0, sylBad: [],
    img: 0,
    srcDist: {}, flags: {},
    exTotal: 0,
  };

  for (const w of words) {
    if (w.ph && w.ph.uk) stat.phUk++;
    if (w.ph && w.ph.us) stat.phUs++;
    const ex = w.ex || [];
    stat.exTotal += ex.length;
    if (ex.length >= 2) stat.exGe2++;
    if (ex.length >= 4) stat.exGe4++;
    const examN = ex.filter((e) => e.srcType === 'gaokao' || e.srcType === 'zhongkao').length;
    if (examN >= 1) stat.examGe1++;
    if (examN >= 2) stat.examGe2++;
    for (const e of ex) stat.srcDist[e.srcType] = (stat.srcDist[e.srcType] || 0) + 1;
    const f = w.fam || {};
    if (f.root || (f.derive && f.derive.length) || (f.syn && f.syn.length)) stat.famAny++;
    if (w.syl && Array.isArray(w.syl.l)) {
      stat.sylTotal++;
      // n=0 是无元音的缩写（mm/cd 这类），允许单段
      const okJoin = w.syl.l.join('').toLowerCase() === String(w.w).toLowerCase();
      const okCount = w.syl.n === 0 ? w.syl.l.length === 1 : w.syl.l.length === w.syl.n;
      if (okJoin && okCount) stat.sylOk++;
      else stat.sylBad.push(w.w);
    }
    if (w.img) stat.img++;
    for (const fl of w.flags || []) stat.flags[fl] = (stat.flags[fl] || 0) + 1;
  }

  stat.p = {
    phUk: pct(stat.phUk, n),
    phUs: pct(stat.phUs, n),
    exGe2: pct(stat.exGe2, n),
    exGe4: pct(stat.exGe4, n),
    examGe1: pct(stat.examGe1, n),
    examGe2: pct(stat.examGe2, n),
    famAny: pct(stat.famAny, n),
    sylOk: pct(stat.sylOk, stat.sylTotal),
    img: pct(stat.img, n),
  };
  return stat;
}

function gzKB(file) {
  const buf = fs.readFileSync(file);
  return {
    raw: +(buf.length / 1024 / 1024).toFixed(2),
    gzip: +(zlib.gzipSync(buf, { level: 9 }).length / 1024 / 1024).toFixed(2),
  };
}

function main() {
  const zk = analyze(loadBank('zhongkao'), '中考库（初中 1987 词）');
  const gk = analyze(loadBank('gaokao'), '高考库（初中+高中累计）');

  const sizes = {
    zhongkao: gzKB(path.join(BANK, 'zhongkao.js')),
    gaokao: gzKB(path.join(BANK, 'gaokao.js')),
  };

  const gates = [
    ['词表完整性', `${zk.total} / ${gk.total}`, zk.total === 1987 && gk.total === 3908, '应与初中 1987、初中+高中 3908 一致'],
    ['英式音标覆盖', `${zk.p.phUk}% / ${gk.p.phUk}%`, zk.p.phUk >= 99 && gk.p.phUk >= 99, '≥99%'],
    ['美式音标覆盖', `${zk.p.phUs}% / ${gk.p.phUs}%`, zk.p.phUs >= 60 && gk.p.phUs >= 60, '≥60%（Wiktionary 仅覆盖 945 词）'],
    ['例句 ≥2 条', `${zk.p.exGe2}% / ${gk.p.exGe2}%`, zk.p.exGe2 >= 99 && gk.p.exGe2 >= 99, '≥99%'],
    ['真题例句 ≥1 条', `${zk.p.examGe1}% / ${gk.p.examGe1}%`, true, '观测项'],
    ['真题例句 ≥2 条', `${zk.p.examGe2}% / ${gk.p.examGe2}%`, zk.p.examGe2 >= 55 && gk.p.examGe2 >= 55, '≥55%'],
    ['相关词覆盖', `${zk.p.famAny}% / ${gk.p.famAny}%`, zk.p.famAny >= 80 && gk.p.famAny >= 80, '≥80%'],
    ['音节自洽', `${zk.p.sylOk}% / ${gk.p.sylOk}%`, zk.p.sylOk === 100 && gk.p.sylOk === 100, '100%'],
    ['配图覆盖', `${zk.p.img}% / ${gk.p.img}%`, true, '观测项'],
    ['单库体积(原始)', `${sizes.zhongkao.raw}MB / ${sizes.gaokao.raw}MB`, true, '观测项'],
  ];

  const lines = [];
  lines.push('# 中/高考词库校验报告');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  lines.push('');
  lines.push('## 一、总览');
  lines.push('');
  lines.push('| 指标 | ' + zk.label + ' | ' + gk.label + ' |');
  lines.push('|---|---|---|');
  const rows = [
    ['词数', zk.total, gk.total],
    ['英式音标', `${zk.phUk} (${zk.p.phUk}%)`, `${gk.phUk} (${gk.p.phUk}%)`],
    ['美式音标', `${zk.phUs} (${zk.p.phUs}%)`, `${gk.phUs} (${gk.p.phUs}%)`],
    ['例句总数', zk.exTotal, gk.exTotal],
    ['例句≥2条', `${zk.exGe2} (${zk.p.exGe2}%)`, `${gk.exGe2} (${gk.p.exGe2}%)`],
    ['例句=4条', `${zk.exGe4} (${zk.p.exGe4}%)`, `${gk.exGe4} (${gk.p.exGe4}%)`],
    ['真题例句≥1条', `${zk.examGe1} (${zk.p.examGe1}%)`, `${gk.examGe1} (${gk.p.examGe1}%)`],
    ['真题例句≥2条', `${zk.examGe2} (${zk.p.examGe2}%)`, `${gk.examGe2} (${gk.p.examGe2}%)`],
    ['相关词有内容', `${zk.famAny} (${zk.p.famAny}%)`, `${gk.famAny} (${gk.p.famAny}%)`],
    ['音节自洽', `${zk.sylOk}/${zk.sylTotal}`, `${gk.sylOk}/${gk.sylTotal}`],
    ['有配图', `${zk.img} (${zk.p.img}%)`, `${gk.img} (${gk.p.img}%)`],
    ['文件体积', `${sizes.zhongkao.raw}MB（gzip ${sizes.zhongkao.gzip}MB）`, `${sizes.gaokao.raw}MB（gzip ${sizes.gaokao.gzip}MB）`],
  ];
  for (const r of rows) lines.push('| ' + r.join(' | ') + ' |');

  lines.push('');
  lines.push('## 二、门槛检查');
  lines.push('');
  lines.push('| 项目 | 实测 | 结果 | 门槛 |');
  lines.push('|---|---|---|---|');
  for (const [name, v, ok, rule] of gates) lines.push(`| ${name} | ${v} | ${ok ? '✅' : '⚠️'} | ${rule} |`);

  lines.push('');
  lines.push('## 三、例句来源分布');
  lines.push('');
  lines.push('| 来源类型 | 中考库 | 高考库 |');
  lines.push('|---|---|---|');
  const types = ['gaokao', 'zhongkao', 'dict', 'media', 'news', 'manual'];
  const TYPE_CN = { gaokao: '高考真题', zhongkao: '中考真题', dict: '词典例句', media: '影视例句', news: '新闻例句', manual: '人工补充' };
  for (const t of types) lines.push(`| ${TYPE_CN[t]} | ${zk.srcDist[t] || 0} | ${gk.srcDist[t] || 0} |`);

  lines.push('');
  lines.push('## 四、缺口清单（flags 统计）');
  lines.push('');
  lines.push('| 标记 | 含义 | 中考库 | 高考库 |');
  lines.push('|---|---|---|---|');
  const FLAG_CN = {
    no_exam_ex: '无真题例句', few_exam_ex: '真题例句仅 1 条', few_ex: '例句不足 2 条',
    no_ph_uk: '缺英式音标', no_ph_us: '缺美式音标', no_syl: '缺音节',
    no_img: '无配图', fam_gap: '无相关词',
  };
  for (const f of Object.keys(FLAG_CN)) {
    lines.push(`| ${f} | ${FLAG_CN[f]} | ${zk.flags[f] || 0} | ${gk.flags[f] || 0} |`);
  }

  lines.push('');
  lines.push('## 五、抽样 30 词（人工过目用）');
  lines.push('');
  const keys = Object.keys(loadBank('gaokao'));
  const seed = 20261103;
  let s = seed;
  const pick = [];
  const used = new Set();
  while (pick.length < 30 && used.size < keys.length) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const i = s % keys.length;
    if (used.has(i)) continue;
    used.add(i);
    pick.push(keys[i]);
  }
  const g = loadBank('gaokao');
  for (const w of pick) {
    const e = g[w];
    const ex = e.ex[0];
    lines.push(`- **${w}**（${e.firstLevel}） ${e.ph.uk || '无音标'} — ${ex ? `[${ex.src}] ${ex.en.replace(/<\/?B>/g, '')}` : '无例句'}`);
  }

  lines.push('');
  lines.push('## 六、说明');
  lines.push('');
  lines.push('1. 高考真题例句溯源到「年份·地区/卷别·篇目」，如 `2010·北京·阅读A`。');
  lines.push('2. 中考真题的数据源未提供年份与地区，只能标到题型；报告不编造。');
  lines.push('3. 完形填空与七选五的原文被抽掉了空格的词（如 "I 21 a note" 实为 "I put a note"），已整体排除，只用完整阅读理解原文。');
  lines.push('4. 真题例句无官方译文，`cn` 留空，未做机器翻译。');
  lines.push('5. `family_supplement.json` 可人工补词族，`manual_examples.json` 可人工补例句，重新运行 `build_bank.js` 即生效。');

  fs.writeFileSync(path.join(BANK, 'report.md'), lines.join('\n'));
  fs.writeFileSync(path.join(BANK, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), zhongkao: zk, gaokao: gk, sizes, gates: gates.map(([n, v, ok, r]) => ({ name: n, value: v, pass: ok, rule: r })) }, null, 2));

  console.log(lines.slice(0, 40).join('\n'));
  console.log('\n[out] bank/report.md  bank/report.json');
}

main();
