// 合并抓取结果到 examples_data.js 与 pics_data.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadConst(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = code.match(/const\s+(\w+)\s*=\s*(\{[\s\S]*\})/);
  return { name: m[1], obj: eval('(' + m[2] + ')') };
}

const prog = JSON.parse(fs.readFileSync(path.join(ROOT, '.fetch_progress.json'), 'utf8'));

// 1. 例句合并
const EX = loadConst('examples_data.js');
let exAdded = 0;
for (const word in prog.done) {
  const ex = prog.done[word].ex;
  if (ex && ex.length && !(EX.obj[word] && EX.obj[word].length)) {
    EX.obj[word] = ex;
    exAdded++;
  }
}
fs.writeFileSync(path.join(ROOT, 'examples_data.js'), `const ${EX.name} = ` + JSON.stringify(EX.obj) + ';\n');
console.log(`例句新增 ${exAdded} 个词，EXAMPLES_DATA 总数 ${Object.keys(EX.obj).length}`);

// 2. 有道配图合并
const PIC = loadConst('pics_data.js');
let picAdded = 0;
for (const word in prog.done) {
  const pic = prog.done[word].pic;
  if (pic && !PIC.obj[word]) {
    PIC.obj[word] = pic;
    picAdded++;
  }
}
fs.writeFileSync(path.join(ROOT, 'pics_data.js'), `const ${PIC.name} = ` + JSON.stringify(PIC.obj) + ';\n');
console.log(`配图新增 ${picAdded} 个词，PICS_DATA 总数 ${Object.keys(PIC.obj).length}`);
