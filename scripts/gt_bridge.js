// Google 翻译补译文：准备批次（--prepare）/ 回写结果（--apply）
// 由 bash 负责实际发请求（本机 Node 子进程被沙箱限制，bash 里的 curl 可以走代理）
// 用法：
//   node scripts/gt_bridge.js --prepare
//   bash: 读 .gt/queue.txt，逐行 POST，结果存 .gt/out/<id>.json
//   node scripts/gt_bridge.js --apply
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'extras_data.js');
const DIR = path.join(ROOT, '.gt');
const OUT = path.join(DIR, 'out');
const PROG = path.join(ROOT, '.extras_google_progress.json');
const BATCH = Number(process.env.GT_BATCH || 60);

const src = fs.readFileSync(DATA, 'utf8');
const EXTRAS = new Function(src + '\nreturn EXTRAS_DATA;')();
let prog = {};
try{ prog = JSON.parse(fs.readFileSync(PROG, 'utf8')); }catch(e){}
const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const hasCJK = s => /[\u4e00-\u9fa5]/.test(s);

const mode = process.argv.includes('--apply') ? 'apply' : 'prepare';

if(mode === 'prepare'){
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const todo = [];
  for(const w of Object.keys(EXTRAS)){
    (EXTRAS[w] || []).forEach((e, i) => {
      if(e.cn) return;
      if((prog[w] || [])[i]) return;
      const en = plain(e.en);
      if(en) todo.push({ w, i, en });
    });
  }
  const meta = [], queue = [];
  for(let b = 0, p = 0; p < todo.length; b++, p += BATCH){
    const items = todo.slice(p, p + BATCH);
    const id = String(b).padStart(4, '0');
    meta.push({ id, items: items.map(it => [it.w, it.i]) });
    queue.push(id + '\t' + items.map(it => 'q=' + encodeURIComponent(it.en)).join('&'));
  }
  fs.writeFileSync(path.join(DIR, 'meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(DIR, 'queue.txt'), queue.join('\n') + '\n');
  console.log('待翻译', todo.length, '条，分', meta.length, '批');
}

if(mode === 'apply'){
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
  let ok = 0, bad = 0, filled = 0;
  for(const { id, items } of meta){
    let arr = null;
    try{ arr = JSON.parse(fs.readFileSync(path.join(OUT, id + '.json'), 'utf8')); }catch(e){}
    if(!Array.isArray(arr) || arr.length !== items.length){ bad += items.length; continue; }
    items.forEach(([w, i], k) => {
      const cn = String(arr[k] == null ? '' : arr[k]).trim();
      if(!cn || !hasCJK(cn)){ bad++; return; }
      if(!prog[w]) prog[w] = [];
      prog[w][i] = cn;
      ok++;
    });
  }
  fs.writeFileSync(PROG, JSON.stringify(prog));
  // AI 译文优先：.extras_cn_progress.json 里有的先用，其次 Google，最后保留原值
  let ai = {};
  try{ ai = JSON.parse(fs.readFileSync(path.join(ROOT, '.extras_cn_progress.json'), 'utf8')); }catch(e){}
  for(const w of Object.keys(EXTRAS)){
    const g = prog[w] || [], a = ai[w] || [];
    (EXTRAS[w] || []).forEach((e, i) => {
      const best = a[i] || g[i];
      if(best && best !== e.cn){ e.cn = best; filled++; }
    });
  }
  fs.writeFileSync(DATA, 'const EXTRAS_DATA = ' + JSON.stringify(EXTRAS) + ';\n');
  const total = Object.keys(EXTRAS).reduce((n, w) => n + (EXTRAS[w] || []).length, 0);
  const withCn = Object.keys(EXTRAS).reduce((n, w) => n + (EXTRAS[w] || []).filter(e => e.cn).length, 0);
  console.log(`应用：成功 ${ok} 条，失败 ${bad} 条；写入 ${filled} 条；现有 ${withCn}/${total} 条有译文`);
}
