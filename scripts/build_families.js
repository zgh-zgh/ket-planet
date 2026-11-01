// 词族构建 v3
// 数据来源（本地已有，缺失的常用派生词按需向有道补抓并缓存）：
//   1) words-data.js      词表与中文释义（7549 词）
//   2) ecdict_data.js     ECDICT 音标/词频/柯林斯星级（MIT）
//   3) wordnet-db         Princeton WordNet 3.1 派生关系（'+' 指针）
//   4) 内置词根/前缀/后缀表
// 输出：families_data.js
// 用法：node scripts/build_families.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.family_cache.json');
const t0 = Date.now();
const log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's]', ...a);

function loadConst(file, name) {
  const c = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = c.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\{[\\s\\S]*\\})'));
  return eval('(' + m[1] + ')');
}

/* ================== 1. 词根库 ================== */
const ROOTS = {
  view: '看', vis: '看', vid: '看', spect: '看', spec: '看', opt: '看',
  dict: '说', loqu: '说', log: '说、学科', logue: '说', lingu: '语言', liter: '文字',
  scrib: '写', script: '写', graph: '写、画', gram: '写、记录',
  aud: '听', son: '声音', phon: '声音',
  man: '手', manu: '手', ped: '脚', pod: '脚', corp: '身体', cardi: '心', neur: '神经',
  port: '携带、运', duc: '引导', duct: '引导', tract: '拉', mit: '送', miss: '送', ject: '投掷',
  fer: '带来', gest: '携带',
  cap: '拿、取', capt: '拿、取', cept: '拿、取', cip: '拿、取', tain: '握持', ten: '握持', pos: '放置',
  fac: '做', fact: '做', fect: '做', fic: '做', struct: '建造',
  bio: '生命', viv: '活', vit: '生命', nat: '出生', gen: '产生、种族', mort: '死', anim: '生命、精神',
  geo: '地', terr: '土地', aqua: '水', hydr: '水', mar: '海', sol: '太阳', luna: '月亮',
  astro: '星', aster: '星', photo: '光', lum: '光', therm: '热',
  chron: '时间', tempor: '时间', ann: '年',
  psych: '心理', cord: '心', sens: '感觉', sent: '感觉', path: '感情、疾病',
  cred: '相信', fid: '信任', sper: '希望', phob: '恐惧', phil: '爱', soph: '智慧',
  sci: '知道', cogn: '知道', memor: '记忆', nom: '名字、法则', onym: '名字',
  grad: '走、步', gress: '走', ced: '走、让', cess: '走、让', ven: '来', vent: '来', migr: '迁移',
  curr: '跑', curs: '跑',
  vert: '转', vers: '转', volv: '卷、转', rot: '转', cycl: '圆、环', circ: '圆',
  form: '形状', morph: '形状', magn: '大', maj: '大', micro: '小', min: '小',
  mult: '多', plur: '多', equ: '相等', simil: '相似', par: '相等',
  vac: '空', plen: '满', plet: '满', brev: '短', long: '长',
  cis: '切', cid: '切、杀', sect: '切', tom: '切', fract: '打破', frag: '破碎', rupt: '断裂',
  press: '压', strain: '拉紧', strict: '拉紧', tend: '伸展', tens: '伸展', pand: '展开',
  clud: '关闭', clus: '关闭', aper: '打开', junct: '连接',
  part: '部分、分开', divid: '分开', separ: '分开',
  soci: '同伴、社会', popul: '人民', civ: '公民', urb: '城市', rur: '乡村', dom: '家、统治',
  reg: '统治', jud: '判断', jur: '法律', leg: '法、读', legi: '法律', just: '公正', ver: '真实',
  dem: '人民', crat: '统治', arch: '首领、统治', polit: '政治', econom: '经济',
  serv: '服务、保存', us: '使用', labor: '劳动', oper: '工作',
  medi: '中间', centr: '中心', fin: '结束、界限', termin: '界限', limit: '界限',
  prim: '第一', ultim: '最后', nov: '新', sen: '老', juven: '年轻',
  mater: '母', patr: '父', fratr: '兄弟', nutri: '营养', vor: '吃', flor: '花', arbor: '树',
  the: '神', sacr: '神圣', spir: '呼吸'
};
const PREFIXES = {
  a: '加强语气', ab: '离开', abs: '离开', ad: '朝向', af: '朝向', ag: '朝向', al: '朝向', ap: '朝向', ar: '朝向', as: '朝向', at: '朝向',
  ante: '在前', anti: '反对', arch: '首要', auto: '自己', bene: '善、好', bi: '二', circum: '环绕',
  co: '共同', col: '共同', com: '共同', con: '共同、加强', contra: '相反', counter: '反对', cor: '共同',
  de: '向下、去除', di: '分开', dia: '穿过', dis: '否定、分离', e: '向外', ef: '向外', em: '使…进入', en: '使…',
  ex: '向外、前任', extra: '超出', fore: '在前', hyper: '过度', hypo: '在下', il: '不', im: '不、向内', in: '不、向内',
  inter: '在…之间、相互', intra: '在内', intro: '向内', ir: '不', macro: '大', mal: '坏', mid: '中间',
  mis: '错误', mono: '单一', multi: '多', neo: '新', non: '非', ob: '反对、朝向', oc: '朝向', of: '朝向', op: '朝向',
  out: '向外、超过', over: '过度、在上', pan: '全部', para: '旁边、辅助', per: '贯穿', peri: '周围',
  poly: '多', post: '在后', pre: '在前、预先', pro: '向前、支持', re: '再次、回', retro: '向后',
  semi: '半', sub: '在下', suc: '在下', suf: '在下', sug: '在下', sup: '在下', sur: '在上、超过',
  super: '超过', sus: '在下', syn: '共同', sym: '共同', tele: '远', trans: '跨越', tri: '三',
  ultra: '超过', un: '不、相反', under: '在下、不足', uni: '单一', up: '向上', vice: '副'
};
const SUFFIXES = {
  s: '复数/第三人称', es: '复数', ed: '过去/过去分词', d: '过去式', ing: '进行/动名词', er: '…的人/物', ers: '…的人/物',
  est: '最…', ly: '副词', ness: '名词（性质）', ment: '名词（结果）', ments: '名词（结果）',
  tion: '名词（行为）', tions: '名词（行为）', sion: '名词（行为）', ion: '名词（行为）', ions: '名词（行为）', ation: '名词（行为）',
  able: '能…的', ible: '能…的', ility: '名词（能力）', ful: '充满…的', less: '无…的', ive: '形容词（…的）',
  ous: '形容词（多…的）', ious: '形容词（多…的）', al: '形容词/名词', ial: '形容词', ic: '形容词', ical: '形容词',
  ity: '名词（性质）', ities: '名词（性质）', ist: '…的人', ists: '…的人', ism: '主义、学说', ship: '名词（身份）',
  hood: '名词（状态）', y: '形容词/名词', ize: '动词（使…）', ise: '动词（使…）', ized: '动词（使…）',
  en: '动词/形容词', fy: '动词（使…）', ify: '动词（使…）', ative: '形容词', ator: '…的人/物', ory: '形容词/名词',
  ant: '…的/人', ent: '…的/人', ance: '名词（状态）', ence: '名词（状态）', ancy: '名词（状态）', ency: '名词（状态）',
  ure: '名词（结果）', age: '名词（行为）', ery: '名词（场所/行为）', eer: '…的人', ier: '…的人/更…', iest: '最…',
  e: '', ary: '形容词/名词', some: '有…性质的', ward: '向…', wise: '在…方面', ish: '略…的'
};
const FREE = {
  point: '点', board: '板', book: '书', room: '房间', house: '房子', land: '陆地', light: '光', time: '时间',
  work: '工作', way: '路、方式', side: '边', line: '线', man: '人', day: '天', night: '夜', school: '学校',
  ground: '地面', stone: '石头', paper: '纸', card: '卡片', ball: '球', boat: '船', box: '盒', camp: '营地',
  door: '门', dream: '梦', earth: '地球', farm: '农场', fire: '火', fish: '鱼', flower: '花', foot: '脚',
  friend: '朋友', garden: '花园', glass: '玻璃', gold: '金', hand: '手', head: '头', home: '家', horse: '马',
  key: '钥匙', lake: '湖', lamp: '灯', letter: '信、字母', life: '生命', mark: '标记', market: '市场',
  moon: '月亮', name: '名字', news: '新闻', note: '笔记', office: '办公室', oil: '油', park: '公园',
  path: '小路', phone: '电话', picture: '图片', place: '地方', plane: '飞机', plant: '植物', pool: '池',
  post: '邮政', power: '力量', rail: '铁轨', rain: '雨', river: '河', road: '路', rock: '岩石', roof: '屋顶',
  root: '根', sail: '帆', sand: '沙', sea: '海', seat: '座位', shop: '商店', sign: '标记', sky: '天空',
  snow: '雪', song: '歌', sound: '声音', space: '空间', sport: '运动', star: '星', station: '站', step: '步',
  street: '街道', sun: '太阳', tail: '尾巴', talk: '谈话', tax: '税', team: '队', town: '城镇', toy: '玩具',
  train: '火车', tree: '树', trip: '旅行', wall: '墙', war: '战争', watch: '表、观看', wave: '波', web: '网',
  week: '周', wheel: '轮', wind: '风', window: '窗', wing: '翅膀', wonder: '奇迹', word: '词', world: '世界'
};

// 词形相同但语义无关的已知误判（避免"强行拼凑"）
const ROOT_BLACKLIST = new Set(['former', 'formerly', 'formidable', 'importance', 'important', 'importantly', 'informal', 'formality']);
const ROOT_KEYS = Object.keys(ROOTS).sort((a, b) => b.length - a.length);

function decompose(word) {
  const w = word.toLowerCase();
  if (!/^[a-z]{3,20}$/.test(w)) return null;
  for (const root of ROOT_KEYS) {
    let from = 0;
    while (true) {
      const i = w.indexOf(root, from);
      if (i < 0) break;
      from = i + 1;
      const pre = w.slice(0, i), suf = w.slice(i + root.length);
      if (pre && !PREFIXES[pre]) continue;
      if (suf && !SUFFIXES[suf] && !FREE[suf]) continue;
      return { pre, root, suf };
    }
  }
  return null;
}

/* ================== 2. 本地词表数据 ================== */
const WD = loadConst('words-data.js', 'WORD_DB');
const EC = loadConst('ecdict_data.js', 'ECDICT_DATA');
const vocab = new Map();
for (const lv of Object.keys(WD)) for (const [w, cn] of WD[lv]) vocab.set(w.toLowerCase(), { w, cn, lv });
log('词表:', vocab.size, '| ECDICT 条目:', Object.keys(EC).length);

function entry(w) {
  const v = vocab.get(w);
  const e = EC[w] || {};
  return {
    w: v ? v.w : w,
    cn: v ? v.cn : '',
    ph: e.ph || '',
    frq: e.frq ? parseInt(e.frq, 10) : 999999,
    collins: e.collins ? parseInt(e.collins, 10) : 0,
    oxford: !!e.oxford
  };
}

/* ================== 3. WordNet 派生关系 ================== */
const WN_DICT = path.join(ROOT, 'node_modules', 'wordnet-db', 'dict');
let find = null, allNodes = [];
if (fs.existsSync(WN_DICT)) {
  const POSNAME = { n: 'noun', v: 'verb', a: 'adj', r: 'adv', s: 'adj' };
  const POS = ['noun', 'verb', 'adj', 'adv'];
  const db = {};
  for (const pos of POS) {
    const map = new Map();
    for (const line of fs.readFileSync(path.join(WN_DICT, 'data.' + pos), 'utf8').split('\n')) {
      if (!/^\d/.test(line)) continue;
      const bar = line.indexOf('|');
      if (bar < 0) continue;
      const h = line.slice(0, bar).trim().split(/\s+/);
      const wc = parseInt(h[3], 10);
      const lem = [];
      for (let i = 0; i < wc; i++) lem.push(h[4 + i * 2].toLowerCase());
      const pi = 4 + wc * 2, pc = parseInt(h[pi], 10) || 0;
      const dv = [];
      for (let i = 0; i < pc; i++) if (h[pi + 1 + i * 4] === '+') dv.push({ o: h[pi + 2 + i * 4], p: h[pi + 3 + i * 4] });
      map.set(h[0], { lem, dv });
    }
    db[pos] = map;
  }
  const parent = new Map();
  find = x => {
    if (!parent.has(x)) { parent.set(x, x); return x; }
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (x !== r) { const n = parent.get(x); parent.set(x, r); x = n; }
    return r;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const sameStem = (a, b) => {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i >= Math.min(6, Math.max(3, n - 2));
  };
  for (const pos of POS) for (const syn of db[pos].values()) for (const d of syn.dv) {
    const pn = POSNAME[d.p];
    const t = pn && db[pn] && db[pn].get(d.o);
    if (!t) continue;
    for (const a of syn.lem) for (const b of t.lem) if (a !== b && sameStem(a, b)) union(a, b);
  }
  allNodes = [...parent.keys()];
  log('WordNet 节点:', allNodes.length);
} else {
  log('未找到 wordnet-db，仅用词根来源');
}

/* ================== 4. 词根族（词表内） ================== */
const rootFamilies = new Map();
for (const w of vocab.keys()) {
  const d = decompose(w);
  if (!d) continue;
  const arr = rootFamilies.get(d.root) || [];
  arr.push({ ...entry(w), pre: d.pre, suf: d.suf, raw: w });
  rootFamilies.set(d.root, arr);
}
log('词根族:', rootFamilies.size, '| 分解成功:', [...rootFamilies.values()].reduce((a, b) => a + b.length, 0));

/* ================== 5. WordNet 族 ================== */
const wnFamilyOf = new Map();
const wnGroups = [];
if (find) {
  const buckets = new Map();
  for (const w of vocab.keys()) {
    const r = find(w);
    (buckets.get(r) || buckets.set(r, []).get(r)).push(w);
  }
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;
    wnGroups.push(arr);
    for (const w of arr) wnFamilyOf.set(w, arr);
  }
  log('WordNet 族:', wnGroups.length);
}

// 外来候选（不在词表、但与词表词同族）
const extraCandidates = new Set();
if (find) {
  const vocabRoots = new Set([...vocab.keys()].map(w => find(w)));
  const byRoot = new Map();
  for (const w of allNodes) {
    const r = find(w);
    if (!vocabRoots.has(r)) continue;
    (byRoot.get(r) || byRoot.set(r, []).get(r)).push(w);
  }
  for (const arr of byRoot.values()) {
    if (arr.length < 2) continue;
    if (!arr.some(w => vocab.has(w))) continue;
    for (const w of arr) if (!vocab.has(w) && /^[a-z]{4,14}$/.test(w)) extraCandidates.add(w);
  }
}
log('待补抓外来词:', extraCandidates.size);

/* ================== 6. 有道补抓（同根词 + 音标 + 释义） ================== */
let cache = {};
if (fs.existsSync(CACHE)) { try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; } }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchWord(w) {
  const r = await fetch('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(w) + '&doctype=json', {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error('http ' + r.status);
  const d = await r.json();
  const ec = d.ec && d.ec.word && d.ec.word[0];
  const ph = (ec && (ec.usphone || ec.ukphone)) || '';
  let cn = '';
  if (ec && ec.trs) cn = ec.trs.map(t => (t.tr || []).map(x => x.l && x.l.i && x.l.i[0]).filter(Boolean).join('；')).filter(Boolean).join('；');
  // 同根词
  const rw = d.rel_word || {};
  const sibs = [];
  (rw.rels || []).forEach(g => ((g.rel && g.rel.words) || []).forEach(x => {
    const word = String(x.word || '').toLowerCase();
    if (/^[a-z]{3,18}$/.test(word)) sibs.push({ w: word, cn: String(x.tran || '').trim().slice(0, 30) });
  }));
  return { ph: ph ? (ph.startsWith('/') ? ph : '/' + ph + '/') : '', cn: String(cn).slice(0, 40), stem: (rw.stem || '').toLowerCase(), sibs };
}

async function fetchBatch(list, label) {
  const todo = list.filter(w => !cache[w] || cache[w].__fail || cache[w].stem === undefined);
  if (!todo.length) return;
  log(label, todo.length, '个词 …');
  let idx = 0, ok = 0;
  const worker = async () => {
    while (idx < todo.length) {
      const w = todo[idx++];
      try { cache[w] = await fetchWord(w); ok++; }
      catch (e) { cache[w] = { ph: '', cn: '', stem: '', sibs: [], __fail: true }; }
      if (ok && ok % 300 === 0) { fs.writeFileSync(CACHE, JSON.stringify(cache)); log('  ', ok + '/' + todo.length); }
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  log(label, '完成:', ok);
}

(async () => {
  // 第一轮：词表内全部词（拿同根词）
  await fetchBatch([...vocab.keys()], '抓同根词');

  // 汇总同根词关系
  const stemOf = new Map();          // word -> stem
  const stemGroup = new Map();       // stem -> Set(words)
  const sibCn = new Map();           // word -> 释义（来自他人同根词列表）
  for (const w of vocab.keys()) {
    const c = cache[w];
    if (!c) continue;
    const stem = c.stem || w;
    stemOf.set(w, stem);
    const set = stemGroup.get(stem) || new Set();
    set.add(w);
    (c.sibs || []).forEach(s => {
      set.add(s.w);
      if (s.cn && !sibCn.has(s.w)) sibCn.set(s.w, s.cn);
    });
    stemGroup.set(stem, set);
  }
  log('同根词组:', stemGroup.size);

  // 第二轮：补抓同根词里缺释义的词
  const needInfo = new Set();
  for (const set of stemGroup.values()) for (const w of set) if (!vocab.has(w) && !cache[w]) needInfo.add(w);
  for (const w of extraCandidates) if (!cache[w]) needInfo.add(w);
  await fetchBatch([...needInfo], '补抓派生词');

  /* ============ 7. 合并输出 ============ */
  const out = { roots: {}, fams: {}, w2f: {}, meta: { built: new Date().toISOString().slice(0, 10), pfx: PREFIXES, sfx: SUFFIXES, free: FREE } };

  function info(w) {
    const v = vocab.get(w);
    if (v) return { w: v.w, cn: v.cn, ph: (EC[w] || {}).ph || '', collins: parseInt((EC[w] || {}).collins || 0, 10), frq: parseInt((EC[w] || {}).frq || 0, 10) || 999999 };
    const c = cache[w] || {};
    return { w, cn: c.cn || sibCn.get(w) || '', ph: c.ph || '', collins: 0, frq: 60000 };
  }
  const rank = m => (m.collins ? (6 - m.collins) * 40 : 0) + Math.min(400, m.frq / 100);

  // 词根族：词表 + 同根词 + 外来词，按严格前缀/后缀校验
  const rootMembers = new Map();
  const addToRoot = (w, d) => {
    const arr = rootMembers.get(d.root) || new Map();
    arr.set(w, { ...info(w), pre: d.pre, suf: d.suf });
    rootMembers.set(d.root, arr);
  };
  for (const w of vocab.keys()) { if (ROOT_BLACKLIST.has(w)) continue; const d = decompose(w); if (d) addToRoot(w, d); }
  for (const set of stemGroup.values()) for (const w of set) { if (vocab.has(w)) continue; const d = decompose(w); if (d) addToRoot(w, d); }

  const pack = m => (vocab.has(m.w.toLowerCase())
    ? [m.w, '', '', m.pre || '', m.suf || '']          // 词表内：前端回填音标/释义
    : [m.w, m.ph, m.cn.slice(0, 24), m.pre || '', m.suf || '']);
  const outRootHas = new Set();
  for (const [root, map] of rootMembers) {
    for (const k of map.keys()) outRootHas.add(k.toLowerCase());
    const list = [...map.values()].filter(m => m.cn).sort((a, b) => rank(a) - rank(b)).slice(0, 14);
    if (list.length < 2) continue;
    out.roots[root] = { m: ROOTS[root], w: list.map(pack) };
  }

  // 同根词族：先用并查集把「同一族被有道拆成多个 stem」的情况合并
  const packed = (w, ph, cn) => (vocab.has(w.toLowerCase()) ? [w] : [w, ph || '', (cn || '').slice(0, 24)]);
  const uf = new Map();
  const ufFind = x => { if (!uf.has(x)) { uf.set(x, x); return x; } let r = x; while (uf.get(r) !== r) r = uf.get(r); while (x !== r) { const n = uf.get(x); uf.set(x, r); x = n; } return r; };
  const ufUnion = (a, b) => { const ra = ufFind(a), rb = ufFind(b); if (ra !== rb) uf.set(ra, rb); };
  for (const [stem, set] of stemGroup) {
    const arr = [...set];
    if (!arr.length) continue;
    ufUnion(arr[0], stem);
    for (let i = 1; i < arr.length; i++) ufUnion(arr[0], arr[i]);
  }
  const merged = new Map();     // 根 → 成员集合
  for (const [stem, set] of stemGroup) {
    const r = ufFind(stem);
    const m = merged.get(r) || new Set();
    m.add(stem);
    set.forEach(w => m.add(w));
    merged.set(r, m);
  }
  for (const set of merged.values()) {
    const list = [...set].map(info).filter(m => m.cn);
    if (list.length < 2) continue;
    list.sort((a, b) => rank(a) - rank(b));
    const top = list.slice(0, 10);
    const key = top[0].w.toLowerCase();
    if (out.fams[key]) continue;
    out.fams[key] = top.map(m => packed(m.w, m.ph, m.cn));
    for (const m of top) out.w2f[m.w.toLowerCase()] = key;
  }

  // WordNet 族补位（同根词缺失时）
  for (const arr of wnGroups) {
    const list = arr.map(w => info(w)).filter(m => m.cn);
    if (list.length < 2) continue;
    list.sort((a, b) => rank(a) - rank(b));
    const top = list.slice(0, 12);
    const key = top[0].w.toLowerCase();
    if (!out.fams[key]) { out.fams[key] = top.map(m => packed(m.w, m.ph, m.cn)); }
    for (const m of top) if (!out.w2f[m.w.toLowerCase()]) out.w2f[m.w.toLowerCase()] = key;
  }

  const headTxt = '// 词族数据：scripts/build_families.js 生成\n'
    + '// 来源：有道词典同根词 + WordNet 派生关系 + 内置词根表 + ECDICT(MIT) 音标词频\n'
    + '// roots[词根]={m:含义,w:[[词,音标,释义,前缀,后缀]...]}；fams[族头]=[[词,音标,释义]...]；w2f[词]=族头\n';
  fs.writeFileSync(path.join(ROOT, 'families_data.js'), headTxt + 'const FAMILY_DATA = ' + JSON.stringify(out) + ';\n');
  log('输出 families_data.js', (fs.statSync(path.join(ROOT, 'families_data.js')).size / 1024).toFixed(0) + 'KB');
  log('词根族:', Object.keys(out.roots).length, '| 词族:', Object.keys(out.fams).length, '| 反查词:', Object.keys(out.w2f).length);

  for (const k of ['view', 'spect', 'dict']) {
    const f = out.roots[k];
    if (f) console.log(`[根 ${k}=${f.m}] ` + f.w.map(x => x[0]).join(', '));
  }
  for (const k of ['review', 'accept', 'succeed', 'happy']) {
    const h = out.w2f[k];
    if (h) console.log(`[族 ${h}] ` + out.fams[h].map(x => x[0]).join(', '));
  }
})();
