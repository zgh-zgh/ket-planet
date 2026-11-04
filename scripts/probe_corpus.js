// 真题覆盖率探测（只读，不产出词库）
// 用途：判断"真题例句"能不能作为主例句来源。门槛见计划 §6。
// 用法：node scripts/probe_corpus.js
const fs = require('fs');
const path = require('path');
const { ROOT, getLevelWords } = require('./_data');
const { splitSentences, tokenize, countWords, loadGaokao, loadZhongkao, buildVariantIndex } = require('./_corpus');

function statsOf(sentences) {
  const lens = sentences.map(countWords).filter((n) => n > 0);
  lens.sort((a, b) => a - b);
  const sum = lens.reduce((a, b) => a + b, 0);
  return {
    sentences: sentences.length,
    words: sum,
    avgLen: +(sum / Math.max(1, lens.length)).toFixed(1),
    medianLen: lens[Math.floor(lens.length / 2)] || 0,
  };
}

function scan(name, items, variantIdx, targetSet) {
  const hits = new Map(); // word -> count
  let sentenceCount = 0;
  const allSentences = [];

  for (const it of items) {
    const sents = splitSentences(it.passage);
    for (const s of sents) {
      const n = countWords(s);
      if (n < 5 || n > 60) continue;
      sentenceCount++;
      allSentences.push(s);
      const toks = tokenize(s);
      const seen = new Set();
      for (const t of toks) {
        const set = variantIdx.get(t);
        if (!set) continue;
        for (const w of set) {
          if (targetSet.has(w) && !seen.has(w + '|' + w)) {
            // 同一句里同一个词只记一次
          }
          if (!targetSet.has(w)) continue;
          if (seen.has(w)) continue;
          seen.add(w);
          hits.set(w, (hits.get(w) || 0) + 1);
        }
      }
    }
  }

  const st = statsOf(allSentences);
  return { name, items: items.length, sentenceCount, ...st, hits };
}

function describe(label, words, hits) {
  const total = words.length;
  const c1 = words.filter((w) => hits.get(w) >= 1).length;
  const c2 = words.filter((w) => hits.get(w) >= 2).length;
  const c3 = words.filter((w) => hits.get(w) >= 3).length;
  const c4 = words.filter((w) => hits.get(w) >= 4).length;
  const pct = (n) => +((n / Math.max(1, total)) * 100).toFixed(1);
  return { label, total, ge1: c1, ge2: c2, ge3: c3, ge4: c4, p1: pct(c1), p2: pct(c2), p3: pct(c3), p4: pct(c4) };
}

function main() {
  const junior = getLevelWords('初中');
  const senior = getLevelWords('高中');
  const target = [...new Set([...junior, ...senior].map((x) => x.w))];
  const targetSet = new Set(target);
  const variantIdx = buildVariantIndex(target);

  console.log(`[目标] 初中=${junior.length} 高中=${senior.length} 去重合计=${target.length}`);

  const gk = loadGaokao();
  console.log(`[语料] 高考：${gk.stats.papers} 套卷，${gk.stats.passages} 篇语篇`);
  const zk = loadZhongkao();
  console.log(`[语料] 中考：${zk.stats.files} 个文件，${zk.stats.items} 个题组`);

  const gkScan = scan('高考', gk.items, variantIdx, targetSet);
  console.log(`[切句] 高考 ${gkScan.sentenceCount} 句，平均 ${gkScan.avgLen} 词，中位 ${gkScan.medianLen} 词，共 ${gkScan.words} 词`);

  const zkScan = scan('中考', zk.items, variantIdx, targetSet);
  console.log(`[切句] 中考 ${zkScan.sentenceCount} 句，平均 ${zkScan.avgLen} 词，中位 ${zkScan.medianLen} 词，共 ${zkScan.words} 词`);

  // 合并命中（高考+中考）
  const merged = new Map();
  for (const [w, n] of gkScan.hits) merged.set(w, (merged.get(w) || 0) + n);
  for (const [w, n] of zkScan.hits) merged.set(w, (merged.get(w) || 0) + n);

  const rows = [
    describe('高考语料 → 初中词', junior.map((x) => x.w), gkScan.hits),
    describe('高考语料 → 高中词', senior.map((x) => x.w), gkScan.hits),
    describe('中考语料 → 初中词', junior.map((x) => x.w), zkScan.hits),
    describe('中考语料 → 高中词', senior.map((x) => x.w), zkScan.hits),
    describe('合并语料 → 初中词', junior.map((x) => x.w), merged),
    describe('合并语料 → 高中词', senior.map((x) => x.w), merged),
  ];

  console.log('\n===== 覆盖率 =====');
  console.log('口径'.padEnd(22), '词数'.padStart(6), '≥1条'.padStart(14), '≥2条'.padStart(14), '≥3条'.padStart(14), '≥4条'.padStart(14));
  for (const r of rows) {
    console.log(
      r.label.padEnd(22),
      String(r.total).padStart(6),
      `${r.ge1}(${r.p1}%)`.padStart(14),
      `${r.ge2}(${r.p2}%)`.padStart(14),
      `${r.ge3}(${r.p3}%)`.padStart(14),
      `${r.ge4}(${r.p4}%)`.padStart(14)
    );
  }

  // 每词命中数分布（合并口径，高中词）
  const dist = {};
  for (const w of senior.map((x) => x.w)) {
    const n = Math.min(10, merged.get(w) || 0);
    dist[n] = (dist[n] || 0) + 1;
  }
  console.log('\n高中词命中条数分布(10表示≥10)：', JSON.stringify(dist));

  const report = {
    generatedAt: new Date().toISOString(),
    corpus: { gaokao: gk.stats, zhongkao: zk.stats, gaokaoSentences: gkScan.sentenceCount, zhongkaoSentences: zkScan.sentenceCount },
    rows,
  };
  fs.writeFileSync(path.join(ROOT, 'bank', 'src', 'probe_report.json'), JSON.stringify(report, null, 2));

  // 门禁判断
  const j = rows.find((r) => r.label === '合并语料 → 初中词');
  const s = rows.find((r) => r.label === '合并语料 → 高中词');
  const pass = j.p2 >= 55 && s.p2 >= 55;
  console.log(`\n[门禁] 初中≥2条 ${j.p2}% / 高中≥2条 ${s.p2}% → ${pass ? '通过（真题可作主来源）' : '未通过（真题仅作加分项）'}`);
}

main();
