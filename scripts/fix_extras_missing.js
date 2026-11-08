// 一次性修补：把 extras 里仍缺译文的句子交给 AI 处理
// 非英语句子（威尔士语/西班牙语等语料噪音）直接从词库剔除；英语句子补 AI 译文
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'extras_data.js');
// 密钥只从环境变量读，不要写进仓库（仓库公开时等于把额度送人）
// 运行前：export AGNES_API_KEY=sk-...
const KEY = process.env.AGNES_API_KEY || '';

const EXTRAS = new Function(fs.readFileSync(DATA, 'utf8') + '\nreturn EXTRAS_DATA;')();
const miss = [];
for(const w of Object.keys(EXTRAS)){
  (EXTRAS[w] || []).forEach((e, i) => {
    if(!String(e.cn || '').trim()) miss.push({ w, i, en: String(e.en).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
  });
}
console.log('缺译文', miss.length, '条');

(async () => {
  const list = miss.map((m, k) => `${k + 1}. ${m.en}`).join('\n');
  const prompt = `下面是一批英文例句。请完成两件事：
1. 判断哪些句子其实不是英语（例如威尔士语、西班牙语等），把这些句子的序号列出来；
2. 把其余英语句子翻译成准确自然的简体中文。
只输出 JSON，格式：{"notEnglish":[序号...],"cn":{"1":"译文","2":"译文"}}，不要任何解释。`;

  const r = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-3.0-flash', temperature: 0.1,
      messages: [{ role: 'system', content: '你只输出合法 JSON。' }, { role: 'user', content: prompt + '\n\n' + list }]
    })
  });
  const d = await r.json();
  let txt = d.choices[0].message.content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  const out = JSON.parse(txt.slice(s, e + 1));
  const notEn = new Set((out.notEnglish || []).map(Number));
  console.log('判定非英语', notEn.size, '条；给出译文', Object.keys(out.cn || {}).length, '条');

  // 先删非英语句（按 word 倒序删除，避免索引错位）
  const drop = miss.map((m, k) => ({ ...m, no: k + 1 })).filter(m => notEn.has(m.no));
  const byWord = {};
  drop.forEach(m => (byWord[m.w] = byWord[m.w] || []).push(m.i));
  let removed = 0;
  for(const w of Object.keys(byWord)){
    const idx = byWord[w].sort((a, b) => b - a);
    idx.forEach(i => { EXTRAS[w].splice(i, 1); removed++; });
    if(!EXTRAS[w].length) delete EXTRAS[w];
  }
  // 再补译文（非英语的跳过）
  let filled = 0;
  miss.forEach((m, k) => {
    if(notEn.has(k + 1)) return;
    const cn = out.cn && out.cn[String(k + 1)];
    if(!cn) return;
    const arr = EXTRAS[m.w] || [];
    // 删除后索引可能变化，按英文原文定位
    const en = String(arr.find(x => !x.cn && String(x.en).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() === m.en) ? m.en : '');
    if(!en) return;
    const hit = arr.find(x => String(x.en).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() === m.en);
    if(hit){ hit.cn = String(cn).trim(); filled++; }
  });
  fs.writeFileSync(DATA, 'const EXTRAS_DATA = ' + JSON.stringify(EXTRAS) + ';\n');
  console.log('删除非英语句', removed, '条；补译文', filled, '条');
  let t = 0, c = 0;
  for(const w in EXTRAS) (EXTRAS[w] || []).forEach(x => { t++; if(String(x.cn || '').trim()) c++; });
  console.log('现有', t, '条，有译文', c, (c / t * 100).toFixed(2) + '%');
})();
