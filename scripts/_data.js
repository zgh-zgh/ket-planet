// 数据加载器：把 data/*.js 里的 `const X = {...}` 读进 Node 环境
// 这些文件是为浏览器 <script> 写的，不是 CommonJS 模块，所以用 vm 求值。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const FILES = {
  WORD_DB: 'words-data.js',
  EXAMPLES_DATA: 'examples_data.js',
  EXTRAS_DATA: 'extras_data.js',
  FAMILY_DATA: 'families_data.js',
  SYNONYM_GROUPS: 'synonyms_data.js',
  MORPH_DATA: 'morph_data.js',
  PICS_DATA: 'pics_data.js',
  SYLLABLES_DATA: 'syllables_data.js',
  ATLAS_PICS: 'atlas_pics.js',
  ECDICT_DATA: 'ecdict_data.js',
  WORDNET_DATA: 'wordnet_data.js',
  WIKTIONARY_DATA: 'wiktionary_data.js',
};

const cache = new Map();

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = FILES[name];
  if (!file) throw new Error('未知数据: ' + name);
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) throw new Error('文件不存在: ' + p);
  const code = fs.readFileSync(p, 'utf8');
  const sandbox = {};
  // 在沙箱里执行，再把变量取出来；避免 const 不挂到 global 的问题
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;__RESULT__ = ' + name + ';', sandbox, { timeout: 60000, filename: file });
  cache.set(name, sandbox.__RESULT__);
  return sandbox.__RESULT__;
}

// 内置词表：初中/高中/四级/六级
function getLevelWords(level) {
  const db = load('WORD_DB');
  return (db[level] || []).map(([w, cn]) => ({ w, cn }));
}

// 词形变体（与前端 wordVariantsClient 同源，构建期版本）
function wordVariants(word) {
  const w = String(word || '').toLowerCase();
  const out = new Set([w]);
  const add = (x) => { if (x && x.length > 1) out.add(x); };
  if (/[^aeiou]y$/.test(w)) add(w.slice(0, -1) + 'ies');
  if (/(s|x|z|ch|sh)$/.test(w)) add(w + 'es');
  add(w + 's');
  if (/e$/.test(w)) { add(w.slice(0, -1) + 'ing'); add(w.slice(0, -1) + 'ed'); }
  add(w + 'ing'); add(w + 'ed');
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) { const c = w[w.length - 1]; add(w + c + 'ing'); add(w + c + 'ed'); }
  if (/e$/.test(w)) add(w.slice(0, -1) + 'er');
  add(w + 'er'); add(w + 'est');
  return out;
}

module.exports = { ROOT, load, getLevelWords, wordVariants };
