// 兜底：有道也查不到例句的少量短语/单词，用大模型（agnes-3.0-flash）补 2 条课堂例句
// 生成结果合并进 phrase_examples.js，结构与有道抓取的一致：{ en, cn }
//
// 用法：node scripts/build_ai_examples.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'phrase_examples.js');
const API = 'https://apihub.agnes-ai.com/v1/chat/completions';
// 密钥只从环境变量读，不要写进仓库（server.js 已被 .gitignore 排除，脚本会被提交）
// 运行前：export AGNES_API_KEY=sk-...   （Windows: set AGNES_API_KEY=sk-...）
const KEY = process.env.AGNES_API_KEY || '';

function load() {
  const ctx = { console };
  vm.createContext(ctx);
  for (const f of ['words-data.js', 'textbooks_data.js', 'examples_data.js', 'phrase_examples.js']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  vm.runInContext('globalThis.__DATA={WORD_DB,TEXTBOOK_DB,EXAMPLES_DATA,PHRASE_EXAMPLES};', ctx);
  return ctx.__DATA;
}
const D = load();

function collect() {
  const map = new Map();
  const add = (w, cn) => {
    const k = String(w || '').toLowerCase().trim();
    if (!k || map.has(k)) return;
    map.set(k, String(cn || '').trim());
  };
  Object.values(D.WORD_DB || {}).forEach(l => (l || []).forEach(p => add(p[0], p[1])));
  Object.values(D.TEXTBOOK_DB || {}).forEach(tb => (tb.words || []).forEach(p => add(p[0], p[1])));
  return map;
}
const ALL = collect();
const MISS = [...ALL.entries()].filter(([w]) =>
  !(D.EXAMPLES_DATA[w] && D.EXAMPLES_DATA[w].length) &&
  !(D.PHRASE_EXAMPLES[w] && D.PHRASE_EXAMPLES[w].length)
);
console.log('缺例句：', MISS.length);

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

async function genBatch(batch) {
  const lines = batch.map(([w, cn], i) => `${i + 1}. ${w}${cn ? '（' + cn + '）' : ''}`).join('\n');
  const prompt = `你是给中国初中生写英语例句的老师。为下面每个词/短语各写 2 条例句：
- 英文自然、语法正确，长度 8–16 个词，难度适合初中生；
- 句子里必须真的出现该词/短语（短语允许人称、时态的小变化；somebody/something 要换成具体的人或物）；
- 每句配简体中文翻译；
- 不要写"This word means..."这类元例句。
只输出严格 JSON：{"items":[{"word":"原词或短语","examples":[{"en":"...","cn":"..."}]}]}

词表：
${lines}`;
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-3.0-flash',
      temperature: 0.5,
      messages: [
        { role: 'system', content: 'You are a meticulous English teacher. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const d = await r.json();
  let txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
  txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const obj = JSON.parse(txt);
  return obj.items || [];
}

(async () => {
  const out = Object.assign({}, D.PHRASE_EXAMPLES);
  let ok = 0;
  for (let i = 0; i < MISS.length; i += 10) {
    const batch = MISS.slice(i, i + 10);
    try {
      const items = await genBatch(batch);
      for (const it of items) {
        const key = String(it.word || '').toLowerCase().trim();
        if (!ALL.has(key)) continue;
        const ex = (it.examples || [])
          .map(e => ({ en: String(e.en || '').trim(), cn: String(e.cn || '').trim() }))
          .filter(e => e.en && e.cn);
        if (!ex.length) continue;
        // 粗校验：句子至少包含短语里的一个实词，避免模型答非所问
        const stem = key.split(/\s+/).filter(w => w.length > 3 && !/^(somebody|something|oneself|one's)$/.test(w));
        const probe = stem[0] || key.split(/\s+/)[0];
        const good = ex.filter(e => stripTags(e.en).toLowerCase().includes(probe.slice(0, 4)));
        if (good.length) { out[key] = good.slice(0, 3); ok++; }
      }
      console.log('  批次', Math.floor(i / 10) + 1, '完成，累计', ok);
    } catch (e) {
      console.log('  批次失败', e.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const sorted = {};
  Object.keys(out).sort().forEach(k => { sorted[k] = out[k]; });
  const body = '// 短语/缺例句单词的真实双语例句（有道词典 jsonapi + 少量大模型补写）\n' +
    '// 由 scripts/build_phrase_pack.js、scripts/build_ai_examples.js 生成\n' +
    'const PHRASE_EXAMPLES = ' + JSON.stringify(sorted) + ';\n';
  fs.writeFileSync(FILE, body, 'utf8');
  console.log('完成：新补', ok, '总条目', Object.keys(sorted).length);
})();
