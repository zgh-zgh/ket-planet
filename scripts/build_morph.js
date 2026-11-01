/**
 * 透明构词补充数据（morph_data.js）
 * 目的：像 refuel = re(再) + fuel(燃料) 这类「前缀 + 常用实词」的词，
 *      有道 rel_word 不提供同根词、WordNet 也没有派生关系，导致词汇发散板块空白。
 * 做法：人工确认「前缀 + 词根」的拆解（不自动推断，避免 recent = re + cent 这类误判），
 *      词族成员与音标释义全部走有道词典实时校验，查不到的不写入。
 * 运行：node scripts/build_morph.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'morph_data.js');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// [目标词, 前缀, 词根, 词族成员（人工核订，均为真实词形；不含屈折错误形如 writed）]
const HEADS = [
  ['refuel', 're', 'fuel', ['fuel', 'fueling', 'fueled', 'refueling']],
  ['replay', 're', 'play', ['play', 'player', 'replaying', 'replayed']],
  ['rewrite', 're', 'write', ['write', 'writer', 'rewriting', 'rewritten']],
  ['reopen', 're', 'open', ['open', 'opening', 'reopened', 'reopening']],
  ['rebuild', 're', 'build', ['build', 'builder', 'rebuilding', 'rebuilt']],
  ['restart', 're', 'start', ['start', 'starting', 'restarted', 'restarting']],
  ['retell', 're', 'tell', ['tell', 'telling', 'retelling', 'retold']],
  ['retry', 're', 'try', ['try', 'trying', 'retried', 'retries']],
  ['refill', 're', 'fill', ['fill', 'filling', 'refilled', 'refillable']],
  ['reread', 're', 'read', ['read', 'reading', 'rereading']],
  ['redo', 're', 'do', ['do', 'doing', 'redoing', 'redone']],
  ['rewind', 're', 'wind', ['wind', 'winding', 'rewinding', 'rewound']],
  ['refresh', 're', 'fresh', ['fresh', 'refreshing', 'refreshed', 'refresher']],
  ['unlock', 'un', 'lock', ['lock', 'locking', 'unlocked', 'unlocking']],
  ['unpack', 'un', 'pack', ['pack', 'packing', 'unpacked', 'unpacking']],
  ['undo', 'un', 'do', ['do', 'doing', 'undoing', 'undone']],
  ['untie', 'un', 'tie', ['tie', 'tying', 'untied', 'untying']],
  ['unload', 'un', 'load', ['load', 'loading', 'unloaded', 'unloading']],
  ['unfold', 'un', 'fold', ['fold', 'folding', 'unfolded', 'unfolding']],
  ['unzip', 'un', 'zip', ['zip', 'zipping', 'unzipped', 'unzipping']],
  ['preview', 'pre', 'view', ['view', 'viewer', 'previewing', 'previewed']],
  ['preheat', 'pre', 'heat', ['heat', 'heating', 'preheated', 'preheating']],
  ['prepay', 'pre', 'pay', ['pay', 'payment', 'prepaid', 'prepaying']],
  ['preschool', 'pre', 'school', ['school', 'preschooler', 'preschoolers']],
  ['mislead', 'mis', 'lead', ['lead', 'leading', 'misled', 'misleading']],
  ['misspell', 'mis', 'spell', ['spell', 'spelling', 'misspelled', 'misspelling']],
  ['misunderstand', 'mis', 'understand', ['understand', 'understanding', 'misunderstood', 'misunderstanding']],
  ['misplace', 'mis', 'place', ['place', 'placing', 'misplaced', 'misplacing']],
  ['overlook', 'over', 'look', ['look', 'looking', 'overlooked', 'overlooking']],
  ['overwork', 'over', 'work', ['work', 'worker', 'overworked', 'overworking']],
  ['overeat', 'over', 'eat', ['eat', 'eating', 'overate', 'overeating']],
  ['overcoat', 'over', 'coat', ['coat', 'coats', 'overcoats']],
  ['underline', 'under', 'line', ['line', 'lining', 'underlined', 'underlining']],
  ['underestimate', 'under', 'estimate', ['estimate', 'estimation', 'underestimated', 'underestimating']],
  ['underground', 'under', 'ground', ['ground', 'grounds', 'undergrounds']],
  ['interact', 'inter', 'act', ['act', 'action', 'interaction', 'interactive']],
  ['interchange', 'inter', 'change', ['change', 'interchanged', 'interchangeable']],
  ['supermarket', 'super', 'market', ['market', 'markets', 'supermarkets']],
  ['superman', 'super', 'man', ['man', 'supermen']],
  ['automobile', 'auto', 'mobile', ['mobile', 'automobiles', 'automotive']]
];

function cleanPh(p) {
  const s = String(p || '').trim().replace(/^\/|\/$/g, '');
  return s ? '/' + s + '/' : '';
}
function cleanCn(d) {
  const ec = d && d.ec && d.ec.word && d.ec.word[0];
  if (!ec || !ec.trs) return '';
  const parts = [];
  for (const t of ec.trs) {
    for (const tr of (t.tr || [])) {
      const v = tr && tr.l && tr.l.i && tr.l.i[0];
      if (v) parts.push(String(v).trim());
    }
  }
  if (!parts.length) return '';
  // 只取第一组词性释义 + 最多两个近义项，避免长句被硬截断
  let cn = parts[0].split('；')[0].replace(/\s+/g, ' ').trim();
  cn = cn.split('，')[0].trim();                 // 只保留第一个义项，避免半句截断
  if (cn.length > 20) cn = cn.slice(0, 20) + '…';
  return cn;
}
async function lookup(word) {
  try {
    const r = await fetch('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word) + '&doctype=json', {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const ec = d && d.ec && d.ec.word && d.ec.word[0];
    if (!ec) return null;
    const cn = cleanCn(d);
    if (!cn) return null;
    return { w: word, ph: cleanPh(ec.usphone || ec.ukphone), cn };
  } catch (e) {
    return null;
  }
}

(async () => {
  const out = {};
  let done = 0;
  const queue = HEADS.slice();
  const worker = async () => {
    while (queue.length) {
      const [head, pre, root, fam] = queue.shift();
      const got = [];
      for (const w of fam) {
        if (w === head) continue;
        const info = await lookup(w);
        if (info) got.push(info);
      }
      const rootInfo = got.find(x => x.w === root);
      if (got.length) {
        out[head] = { pre, root, m: rootInfo ? rootInfo.cn : '', fam: got.map(x => [x.w, x.ph, x.cn]) };
      }
      done++;
      if (done % 5 === 0) console.log('  ', done + '/' + HEADS.length);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  const head = '// 透明构词补充数据：scripts/build_morph.js 生成\n'
    + '// 结构：{ 目标词: { pre:前缀, root:词根, m:词根释义, fam:[[词,音标,释义]...] } }\n'
    + '// 数据来源：拆解人工核订，音标与释义来自有道词典（逐词校验，查不到不写入）\n';
  fs.writeFileSync(OUT, head + 'const MORPH_DATA = ' + JSON.stringify(out) + ';\n');
  console.log('写出 morph_data.js', (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB，覆盖', Object.keys(out).length, '词');
  for (const k of ['refuel', 'rewrite', 'unlock', 'overcoat']) {
    if (out[k]) console.log(' ', k, '=', out[k].pre + '+' + out[k].root, '|', out[k].fam.map(x => x[0]).join(', '));
  }
})();
