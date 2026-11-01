// 从 wordnet-db 解析 WordNet 3.1 数据，生成 wordnet_data.js
// 来源：Princeton WordNet（免费开源，WordNet License，见 LICENSE 头）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DICT = path.join(ROOT, 'node_modules', 'wordnet-db', 'dict');

function loadConst(file){ const m = fs.readFileSync(path.join(ROOT,file),'utf8').match(/const\s+(\w+)\s*=\s*(\{[\s\S]*\})/); return eval('('+m[2]+')'); }
const W = loadConst('words-data.js');
const targets = new Set();
for(const lv of Object.keys(W)) for(const [w] of W[lv]) targets.add(w);

const POS = { n:'noun', v:'verb', a:'adj', r:'adv' };

// 解析 data.*：offset -> {words:[], gloss:''}
function parseData(pos){
  const map = Object.create(null);
  const lines = fs.readFileSync(path.join(DICT, 'data.'+POS[pos]), 'utf8').split('\n');
  for(const line of lines){
    if(!line || line[0]===' ' || line[0]<'0' || line[0]>'9') continue; // 跳过 license 注释头
    const bar = line.indexOf('|');
    if(bar < 0) continue;
    const head = line.slice(0, bar).trim().split(/\s+/);
    const gloss = line.slice(bar+1).trim();
    const offset = head[0];
    const wcnt = parseInt(head[3], 10);
    const words = [];
    for(let i=0;i<wcnt;i++){ words.push(head[4 + i*2]); }
    if(!map[offset]) map[offset] = { words, gloss };
  }
  return map;
}

// 解析 index.*：word -> [offset...]
function parseIndex(pos){
  const map = Object.create(null);
  const lines = fs.readFileSync(path.join(DICT, 'index.'+POS[pos]), 'utf8').split('\n');
  for(const line of lines){
    if(!line || line[0]===' ') continue; // 跳过注释头
    const t = line.trim().split(/\s+/);
    if(t.length < 4) continue;
    const word = t[0].replace(/_/g, ' '); // WordNet 用下划线表示空格
    const cnt = parseInt(t[2], 10);
    const offsets = t.slice(-cnt).map(x=>x.trim());
    if(!map[word]) map[word] = [];
    map[word].push(...offsets);
  }
  return map;
}

// 从 gloss 提取释义（去掉例句引号部分）
function definitionFrom(gloss){
  if(!gloss) return '';
  // 去掉 "..." 例句部分
  let d = gloss.replace(/"[^"]*"/g, ' ').replace(/\([^)]*\)/g,' ');
  // 取第一个分号前（WordNet 惯例 definition; "example"）
  const semi = d.indexOf(';');
  if(semi > 0) d = d.slice(0, semi);
  d = d.replace(/\s+/g,' ').trim();
  return d;
}

const data = {}, index = {};
for(const p in POS){ data[p] = parseData(p); index[p] = parseIndex(p); }
console.log('WordNet 数据规模:');
for(const p in POS) console.log(`  ${POS[p]}: ${Object.keys(index[p]).length} 词, ${Object.keys(data[p]).length} synsets`);

const OUT = Object.create(null);
let defCnt=0, synCnt=0, miss=[];
for(const w of targets){
  const entry = { def:'', pos:'', syn:[] };
  for(const p in POS){ // 按 n, v, a, r 顺序找第一个有释义的
    const offs = index[p][w];
    if(!offs || !offs.length) continue;
    const off = offs[0];
    const d = data[p][off];
    if(!d) continue;
    const def = definitionFrom(d.gloss);
    if(!def) continue;
    entry.def = def;
    entry.pos = POS[p];
    // 同义词：同 synset 里其他词（单字词，去掉下划线词）
    const syns = d.words.filter(x => x !== w && !x.includes('_'));
    if(syns.length){ entry.syn = syns.slice(0, 8); }
    break;
  }
  if(entry.def){ defCnt++; if(entry.syn.length) synCnt++; }
  else miss.push(w);
  OUT[w] = entry;
}
console.log(`\n覆盖: ${defCnt}/${targets.size} 词有英文释义 (${(defCnt/targets.size*100).toFixed(1)}%)`);
console.log(`同义词: ${synCnt} 词有同义词`);
console.log(`无释义: ${miss.length} 词，示例: ${miss.slice(0,20).join(', ')}`);

// 只保留有释义的词，减小体积
const final = Object.create(null);
for(const w of targets) if(OUT[w].def) final[w] = { d: OUT[w].def, p: OUT[w].pos, s: OUT[w].syn };

const header = '// 英文释义 + 同义词数据（来源：Princeton WordNet 3.1，免费开源，WordNet License）\n// WordNet 释义为英文，可辅助理解词义与辨析易混词；协议见 wordnet.princeton.edu/license\n';
fs.writeFileSync(path.join(ROOT, 'wordnet_data.js'), header + 'const WORDNET_DATA = ' + JSON.stringify(final) + ';\n');
console.log('\n已生成 wordnet_data.js，含', Object.keys(final).length, '词，大小', (fs.statSync(path.join(ROOT,'wordnet_data.js')).size/1024).toFixed(0), 'KB');
