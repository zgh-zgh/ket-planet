// 给真题例句（bank/pack.js、bank/pack_cet.js 的 ex 第 4 项）补中文译文
// 与 gt_bridge.js 同一套流程：--prepare 生成 .gt_bank/queue.txt，bash 用 curl 逐批请求，--apply 回写
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '.gt_bank');
const OUT = path.join(DIR, 'out');
const MAPF = path.join(ROOT, '.gt_bank_map.json');
const BATCH = Number(process.env.GT_BATCH || 60);
const FILES = [
  { f: path.join(ROOT, 'bank/pack.js'), name: 'BANK_PACK' },
  { f: path.join(ROOT, 'bank/pack_cet.js'), name: 'BANK_PACK_CET' }
];
const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const mode = process.argv.includes('--apply') ? 'apply' : 'prepare';

if(mode === 'prepare'){
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const set = new Set();
  for(const { f, name } of FILES){
    const obj = new Function(fs.readFileSync(f, 'utf8') + ';return ' + name + ';')();
    for(const k in obj) (obj[k].ex || []).forEach(e => { if(!String(e[3] || '').trim()) set.add(plain(e[0])); });
  }
  const list = [...set].filter(Boolean);
  console.log('待翻译真题句（去重）', list.length);
  const meta = [], queue = [];
  for(let b = 0, p = 0; p < list.length; b++, p += BATCH){
    const items = list.slice(p, p + BATCH);
    const id = String(b).padStart(4, '0');
    meta.push({ id, items });
    queue.push(id + '\t' + items.map(t => 'q=' + encodeURIComponent(t)).join('&'));
  }
  fs.writeFileSync(path.join(DIR, 'meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(DIR, 'queue.txt'), queue.join('\n') + '\n');
  console.log('分', meta.length, '批');
}

if(mode === 'apply'){
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
  const map = {};
  let ok = 0, bad = 0;
  for(const { id, items } of meta){
    let arr = null;
    try{ arr = JSON.parse(fs.readFileSync(path.join(OUT, id + '.json'), 'utf8')); }catch(e){}
    if(!Array.isArray(arr) || arr.length !== items.length){ bad += items.length; continue; }
    items.forEach((en, k) => {
      const cn = String(arr[k] == null ? '' : arr[k]).trim();
      if(cn && /[\u4e00-\u9fa5]/.test(cn)){ map[en] = cn; ok++; } else bad++;
    });
  }
  fs.writeFileSync(MAPF, JSON.stringify(map));
  console.log('译文', ok, '条，失败', bad, '条');

  let filled = 0;
  for(const { f, name } of FILES){
    const obj = new Function(fs.readFileSync(f, 'utf8') + ';return ' + name + ';')();
    for(const k in obj) (obj[k].ex || []).forEach(e => {
      if(String(e[3] || '').trim()) return;
      const cn = map[plain(e[0])];
      if(cn){ e[3] = cn; filled++; }
    });
    fs.writeFileSync(f, 'const ' + name + ' = ' + JSON.stringify(obj) + ';\n');
  }
  console.log('写入真题例句', filled, '条');
}
