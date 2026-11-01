// 从 ECDICT CSV 提取 7549 词的音标/词频/星级/考试标签，生成 ecdict_data.js
// 来源：skywind3000/ECDICT（MIT 协议，github.com/skywind3000/ECDICT）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function loadConst(file){ const m = fs.readFileSync(path.join(ROOT,file),'utf8').match(/const\s+(\w+)\s*=\s*(\{[\s\S]*\})/); return eval('('+m[2]+')'); }
const W = loadConst('words-data.js');
const targets = new Set();
for(const lv of Object.keys(W)) for(const [w] of W[lv]) targets.add(w);

// 健壮 CSV 解析器（处理引号内逗号/换行/双引号转义）
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQ = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQ){
      if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if(c === '"') inQ = true;
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if(c === '\r'){}
      else field += c;
    }
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  return rows;
}

console.log('读取 ECDICT CSV ...');
const text = fs.readFileSync(path.join(ROOT, '.ecdict.csv'), 'utf8');
console.log('解析 CSV ...');
const rows = parseCSV(text);
console.log('总词条数:', rows.length - 1);

const result = Object.create(null);
let found = 0;
for(let i=1;i<rows.length;i++){
  const r = rows[i];
  const word = (r[0]||'').trim();
  if(!targets.has(word)) continue;
  result[word] = {
    ph: (r[1]||'').trim(),          // 英式音标
    pos: (r[4]||'').trim(),         // 词性
    collins: (r[5]||'').trim(),     // 柯林斯星级 0-5
    oxford: (r[6]||'').trim(),      // 牛津3000核心词标记
    tag: (r[7]||'').trim(),         // 考试标签 zk/gk/cet4/cet6/ky/toefl/ielts/gre
    bnc: (r[8]||'').trim(),         // BNC词频顺序
    frq: (r[9]||'').trim()          // 当代语料库词频顺序
  };
  found++;
  if(found >= targets.size) break;
}
console.log(`匹配到 ${found}/${targets.size} 词`);

// 统计
let phCnt=0, collinsCnt=0, tagCnt=0;
for(const w in result){ if(result[w].ph) phCnt++; if(result[w].collins && result[w].collins!=='0') collinsCnt++; if(result[w].tag) tagCnt++; }
console.log(`有音标: ${phCnt}, 有柯林斯星级: ${collinsCnt}, 有考试标签: ${tagCnt}`);

const header = '// 音标/词频/星级/考试标签数据（来源：ECDICT，skywind3000/ECDICT，MIT 协议）\n// 字段: ph=英式音标, pos=词性, collins=柯林斯星级(1-5), oxford=牛津3000标记, tag=考试标签, bnc/frq=词频顺序(越小越常用)\n';
fs.writeFileSync(path.join(ROOT, 'ecdict_data.js'), header + 'const ECDICT_DATA = ' + JSON.stringify(result) + ';\n');
console.log('已生成 ecdict_data.js，含', Object.keys(result).length, '词，大小', (fs.statSync(path.join(ROOT,'ecdict_data.js')).size/1024).toFixed(0), 'KB');
