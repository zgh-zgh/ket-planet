// 从 en.wiktionary.org 抓取 IPA 国际音标（串行+间隔，遵守限流），生成 wiktionary_data.js
// 来源：Wiktionary（维基词典，CC BY-SA 4.0，需署名），经 MediaWiki API 获取
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..');

function loadConst(file){ const m = fs.readFileSync(path.join(ROOT,file),'utf8').match(/const\s+(\w+)\s*=\s*(\{[\s\S]*\})/); return eval('('+m[2]+')'); }
const W = loadConst('words-data.js');
const EC = loadConst('ecdict_data.js');

// 目标词：ECDICT 词频排序前 N 的常用词（frq 越小越常用，frq>0）
const allWords = [];
for(const lv of Object.keys(W)) for(const [w] of W[lv]) allWords.push(w);
const ranked = allWords
  .map(w => ({ w, frq: (EC[w] && EC[w].frq) ? parseInt(EC[w].frq,10) : 999999 }))
  .sort((a,b) => a.frq - b.frq);
const TOP_N = parseInt(process.env.WIKI_TOP || '2000', 10);
const words = ranked.slice(0, TOP_N).map(x => x.w);

const PROG = path.join(ROOT, '.wiktionary_progress.json');
let prog = Object.create(null);
if(fs.existsSync(PROG)){ try{ prog = JSON.parse(fs.readFileSync(PROG,'utf8')); }catch(e){} }

function curlWord(word){
  return new Promise((resolve)=>{
    const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&formatversion=2`;
    execFile('curl', ['-s','--max-time','30','-x','http://127.0.0.1:7897','-A','LexiWords/1.0 (contact: user@example.com)', url], {maxBuffer: 8*1024*1024}, (err, stdout)=>{
      if(err || !stdout){ resolve(null); return; }
      try{ resolve(JSON.parse(stdout)); }catch(e){ resolve(null); }
    });
  });
}
function extractIPA(json){
  try{
    const wt = json && json.parse && json.parse.wikitext;
    if(!wt) return '';
    const m = wt.match(/\{\{IPA\|en\|[^}]*?(\/(?:[^/\\]|\\.)*\/)/);
    return m ? m[1] : '';
  }catch(e){ return ''; }
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function run(){
  const todo = words.filter(w => !(w in prog));
  console.log(`[start] 目标常用词=${words.length} 已抓=${Object.keys(prog).length} 待抓=${todo.length}（串行 ~1s/词）`);
  let ok = 0;
  for(let i=0;i<todo.length;i++){
    const w = todo[i];
    let ipa = '';
    const j = await curlWord(w);
    ipa = extractIPA(j);
    if(ipa) ok++;
    prog[w] = ipa;
    if((i+1) % 100 === 0){
      fs.writeFileSync(PROG, JSON.stringify(prog));
      console.log(`[progress] ${i+1}/${todo.length}，IPA命中 ${ok}`);
    }
    await sleep(900);
  }
  fs.writeFileSync(PROG, JSON.stringify(prog));

  const final = Object.create(null);
  let cnt = 0;
  for(const w of words){ if(prog[w]){ final[w] = prog[w]; cnt++; } }
  const header = '// IPA 国际音标数据（来源：Wiktionary 维基词典，CC BY-SA 4.0，需署名）\n// 数据经 MediaWiki API 获取，覆盖常用词；音标为国际音标 IPA 格式\n';
  fs.writeFileSync(path.join(ROOT,'wiktionary_data.js'), header + 'const WIKTIONARY_DATA = ' + JSON.stringify(final) + ';\n');
  console.log(`[done] 命中 IPA: ${cnt}/${words.length} (${(cnt/words.length*100).toFixed(1)}%)，已生成 wiktionary_data.js`);
}
run();
