/**
 * 重建 syllables_data.js —— 生成「字母级」精确音节边界
 *
 * 原理：
 *   1. 从 cmudict（CMU 发音词典，134k 词，权威）取每个词的 ARPABET 音素序列；
 *   2. 音素里的元音音素（带重音数字 0/1/2）即音节核心，据此可 100% 确定
 *      音节数与主重音位置；
 *   3. 用「字形→音素」对齐（G2P alignment）把音素映射回字母，得到字母边界；
 *   4. 用「最大音节首（maximal onset）」原则把辅音归到各音节；
 *   5. 再做字母级修正（双写辅音在边界处拆分、词尾不发音 e、-le 结尾等）。
 *
 * 输出 syllables_data.js：每个词 { n:音节数, s:重音下标, l:[分段...] }
 *
 * 依赖：npm i cmu-pronouncing-dictionary
 */

const fs = require('fs');
const path = require('path');

// ---------- 1. 加载 cmudict ----------
let DICT = null;
function loadCmu() {
  if (DICT) return DICT;
  const m = require('cmu-pronouncing-dictionary');
  const d = m.dictionary || (m.default && m.default.dictionary) || m;
  DICT = {};
  for (const k of Object.keys(d)) {
    // 去掉注释（值里 "# place, danish" 之类）
    const val = String(d[k]).split('#')[0].trim();
    if (!val) continue;
    DICT[k] = val;
  }
  return DICT;
}

// ---------- 2. 音素工具 ----------
const VOWEL_SET = new Set('AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW'.split(' '));
const isVowel = p => VOWEL_SET.has(p.replace(/[0-2]$/, ''));

// 把 "JH IY0 AA1 G R AH0 F IY0" -> [{p:"JH"}, {p:"IY",stress:0}, ...]
function parsePhonemes(s) {
  return s.trim().split(/\s+/).map(tok => {
    const m = tok.match(/^([A-Z]+)([0-2]?)$/);
    return { p: m[1], stress: m[2] === '' ? null : parseInt(m[2], 10) };
  });
}

// ---------- 3. 字形→音素 映射表 ----------
// 音素 -> 可能的字母串（长串在前，鼓励二合字母/多字母图形优先匹配）
const P2G = {
  AA: ['a', 'o', 'ah', 'al', 'au', 'oa', 'ou', 'o'],
  AE: ['a', 'ai', 'au'],
  AH: ['a', 'e', 'i', 'o', 'u', 'ou', 'y', 'eo', 'ai', 'ia', 'ough', 'io', 'oo', 'ui'],
  AO: ['o', 'a', 'aw', 'au', 'al', 'ough', 'augh', 'oa', 'or', 'oo', 'our', 'au'],
  AW: ['ou', 'ow', 'au'],
  AY: ['i', 'y', 'igh', 'ie', 'ai', 'uy', 'ei', 'ye'],
  EH: ['e', 'ea', 'ai', 'a', 'ie', 'u', 'ei', 'eo', 'ue'],
  ER: ['er', 'ir', 'ur', 'ear', 'or', 'our', 'ar', 'yr', 'ere', 'oor', 'eur', 'r'],
  EY: ['a', 'ay', 'ai', 'ei', 'ey', 'ea', 'eigh', 'et', 'e'],
  IH: ['i', 'y', 'e', 'u', 'ui', 'ie', 'o', 'ee', 'ae', 'ea'],
  IY: ['e', 'ee', 'ea', 'ie', 'ei', 'ey', 'i', 'y', 'ae', 'oe', 'ay', 'eo'],
  OW: ['o', 'ow', 'oa', 'oe', 'ou', 'ough', 'eau'],
  OY: ['oi', 'oy'],
  UH: ['oo', 'u', 'ou', 'o', 'oul'],
  UW: ['oo', 'u', 'ew', 'ue', 'ou', 'o', 'ui', 'oe', 'ough', 'eu'],
  // 辅音
  B: ['b', 'bb'],
  CH: ['ch', 'tch', 't', 'tu', 'ti', 'c'],
  D: ['d', 'dd', 'ed'],
  DH: ['th'],
  F: ['f', 'ff', 'ph', 'gh', 'lf'],
  G: ['g', 'gg', 'gh', 'gu', 'gue'],
  HH: ['h', 'wh'],
  JH: ['j', 'g', 'ge', 'dge', 'd', 'dg', 'gg', 'di'],
  K: ['k', 'c', 'ck', 'ch', 'q', 'que', 'cc', 'kh'],
  L: ['l', 'll', 'le', 'lh'],
  M: ['m', 'mm', 'mb', 'mn', 'lm'],
  N: ['n', 'nn', 'kn', 'gn', 'pn'],
  NG: ['ng', 'n', 'ngue'],
  P: ['p', 'pp', 'pe'],
  R: ['r', 'rr', 'wr', 'rh'],
  S: ['s', 'ss', 'c', 'sc', 'ce', 'se', 'ps'],
  SH: ['sh', 'ti', 'ci', 'si', 'ch', 'ss', 'sci', 'ce', 's'],
  T: ['t', 'tt', 'te', 'ed', 'bt', 'pt', 'ct', 'th'],
  TH: ['th'],
  V: ['v', 've', 'f', 'ph'],
  W: ['w', 'wh', 'u', 'ou'],
  Y: ['y', 'i', 'j'],
  Z: ['z', 's', 'zz', 'se', 'ze', 'x', 'sc'],
  ZH: ['s', 'si', 'z', 'g', 'ge', 'j', 'zh'],
};

// 特殊多音素字形：一个字母串对应多个音素（x、qu 等）
// 键=字母串，值=音素序列（去重音）
const MULTI_G = {
  'x': [['K', 'S'], ['G', 'Z'], ['K', 'SH']],
  'qu': [['K', 'W']],
  'u': [['Y', 'UW'], ['Y', 'UH']],
  'eau': [['Y', 'UW'], ['OW']],
  'ture': [['CH', 'ER']],
  'sion': [['ZH', 'AH', 'N'], ['SH', 'AH', 'N']],
  'tion': [['SH', 'AH', 'N']],
  'cious': [['SH', 'AH', 'S']],
  'tious': [['SH', 'AH', 'S']],
  'cial': [['SH', 'AH', 'L']],
};

// 静音字形（本身不发音）：词尾不发音 e（magic-e / -le）是最常见的一类，务必包含
const SILENT_G = { 'e': 1, 'i': 1, 'a': 1, 'gh': 1, 'h': 1, 'b': 1, 'g': 1, 'w': 1, 'k': 1, 't': 1, 'l': 1, 'n': 1, 'p': 1, 'd': 1, 's': 1, 'r': 1, 'c': 1, 'o': 1, 'u': 1 };

// 人工校订的例外词（cmudict 音素与拼写对齐困难，仅这几个；只覆盖 l，n/s 仍取自 cmudict）
const EXCEPTIONS = {
  'restaurant': ['res', 'tau', 'rant'],
};

// 管理页写入的人工音节（bank/src/manual_syllables.json）
// 格式：{ "chocolate": { "l": ["choc","o","late"], "s": 0 } }
// 用途：cmudict 记的是「实际发音」，chocolate / vegetable 这类「拼写比发音多一个音节」
// 的词它天生给不出词典写法，只能人工指定。这里优先级最高，覆盖后不再看音素。
const OVR_FILE = path.join(__dirname, '..', 'bank', 'src', 'manual_syllables.json');
function loadOverrides() {
  const out = {};
  if (!fs.existsSync(OVR_FILE)) return out;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(OVR_FILE, 'utf8')); }
  catch (e) { console.warn('⚠️ manual_syllables.json 解析失败，已忽略：' + e.message); return out; }
  let ok = 0, bad = 0;
  for (const k of Object.keys(raw || {})) {
    const key = String(k).toLowerCase().trim();
    const v = raw[k];
    const segs = Array.isArray(v) ? v.map(String) : (v && Array.isArray(v.l) ? v.l.map(String) : null);
    if (!key || !segs || !segs.length) { bad++; continue; }
    // 不变式：分段拼回去必须等于原词、不许有空段
    if (segs.join('') !== key || segs.some(s => !s.length)) {
      console.warn(`⚠️ 跳过「${key}」：分段拼回是「${segs.join('')}」，与原词不一致`);
      bad++; continue;
    }
    const sIdx = v && !Array.isArray(v) && Number.isInteger(v.s) ? v.s : 0;
    out[key] = { l: segs, s: sIdx >= 0 && sIdx < segs.length ? sIdx : segs.length - 1 };
    ok++;
  }
  if (ok || bad) console.log(`人工音节覆盖：生效 ${ok} 词${bad ? `，忽略 ${bad} 词` : ''}`);
  return out;
}

// ---------- 4. G2P 对齐（DP）----------
// 返回：长度为 phonemes.length 的数组，每项 {start,end}（字母下标区间，end 开区间）
// 未被任何音素覆盖的字母（静音）另行记录
function alignG2P(word, phonemes) {
  const S = word; // 小写
  const n = S.length, m = phonemes.length;
  const INF = 1e9;
  // dp[i][j] = 前 i 个音素消耗前 j 个字母的最小代价；from[i][j] 记录来路
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(INF));
  const from = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(null));
  dp[0][0] = 0;

  const canMatch = (phon, sub) => {
    const list = P2G[phon] || [];
    return list.indexOf(sub) >= 0;
  };
  const multiMatch = (sub, startIdx) => {
    const alts = MULTI_G[sub];
    if (!alts) return null;
    for (const alt of alts) {
      if (startIdx + alt.length > phonemes.length) continue;
      let ok = true;
      for (let k = 0; k < alt.length; k++) {
        if (phonemes[startIdx + k].p !== alt[k]) { ok = false; break; }
      }
      if (ok) return alt;
    }
    return null;
  };

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (dp[i][j] >= INF) continue;
      // 1) 用下一个音素匹配一个字母串（1~4 字母）
      if (i < m) {
        const p = phonemes[i].p;
        for (let L = 4; L >= 1; L--) {
          if (j + L > n) continue;
          const sub = S.slice(j, j + L);
          if (canMatch(p, sub)) {
            const cost = dp[i][j] - L * 0.01; // 略微鼓励更长的图形（二合字母）
            if (cost < dp[i + 1][j + L]) {
              dp[i + 1][j + L] = cost;
              from[i + 1][j + L] = { pi: i, pj: j, len: L, kind: 'm' };
            }
          }
        }
        // 1b) 多音素字形（x/qu/eau/tion 等）
        for (const sub of Object.keys(MULTI_G)) {
          const L = sub.length;
          if (j + L > n) continue;
          if (S.slice(j, j + L) !== sub) continue;
          const seq = multiMatch(sub, i);
          if (seq) {
            const k = seq.length;
            const cost = dp[i][j] - L * 0.02 - k * 0.01;
            if (cost < dp[i + k][j + L]) {
              dp[i + k][j + L] = cost;
              from[i + k][j + L] = { pi: i, pj: j, len: L, kind: 'multi', k };
            }
          }
        }
        // 1c) 空音素（音素无对应字母，极少）
        const cost0 = dp[i][j] + 1.5;
        if (cost0 < dp[i + 1][j]) {
          dp[i + 1][j] = cost0;
          from[i + 1][j] = { pi: i, pj: j, len: 0, kind: 'm' };
        }
        // 1d) 通配兜底：任意单个字母可匹配当前音素（仅当无更好字形时触发，防止对齐失败）
        if (j < n) {
          const costW = dp[i][j] + 0.8;
          if (costW < dp[i + 1][j + 1]) {
            dp[i + 1][j + 1] = costW;
            from[i + 1][j + 1] = { pi: i, pj: j, len: 1, kind: 'm' };
          }
        }
      }
      // 2) 静音字母：跳过单个静音字母
      if (j < n) {
        const ch = S[j];
        if (SILENT_G[ch]) {
          const cost = dp[i][j] + 0.4;
          if (cost < dp[i][j + 1]) {
            dp[i][j + 1] = cost;
            from[i][j + 1] = { pi: i, pj: j, len: 0, kind: 'silent' };
          }
        }
      }
    }
  }

  if (dp[m][n] >= INF) return null; // 对齐失败

  // 回溯
  const ranges = new Array(m).fill(null);
  let i = m, j = n;
  const silentIdx = [];
  while (i > 0 || j > 0) {
    const f = from[i][j];
    if (!f) break;
    if (f.kind === 'silent') {
      silentIdx.push(j - 1);
      j = f.pj;
    } else if (f.kind === 'multi') {
      for (let k = 0; k < f.k; k++) ranges[f.pi + k] = { start: f.pj, end: f.pj + f.len };
      i = f.pi; j = f.pj;
    } else { // 'm'
      if (f.len > 0) ranges[f.pi] = { start: f.pj, end: f.pj + f.len };
      i = f.pi; j = f.pj;
    }
  }
  return { ranges, silentIdx };
}

// ---------- 5. 音素级音节切分（最大音节首）----------
// 返回音节数组：每项 = 该音节包含的音素下标数组
function phonemeSyllables(phonemes, webster) {
  const nuclei = [];
  phonemes.forEach((ph, idx) => { if (isVowel(ph.p)) nuclei.push(idx); });
  if (nuclei.length === 0) return [];
  const syls = [];
  // 第一个音节起始 = 0
  let prevStart = 0;
  for (let s = 0; s < nuclei.length; s++) {
    const v = nuclei[s];
    const nextV = s + 1 < nuclei.length ? nuclei[s + 1] : phonemes.length;
    if (s + 1 < nuclei.length) {
      // v 到 nextV 之间的辅音
      const cons = [];
      for (let k = v + 1; k < nextV; k++) cons.push(phonemes[k].p);
      // 最大音节首：尽量把末尾辅音给下一音节做 onset
      let split = cons.length; // 全部留作前一音节 coda
      for (let t = cons.length; t >= 1; t--) {
        if (isLegalOnset(cons.slice(cons.length - t))) { split = cons.length - t; break; }
      }
      // 韦氏（词典）式修正：重读的「短元音」后面要留一个辅音收尾，构成闭音节。
      // 纯「最大音节首」会把这些辅音全推给下一音节，切出 ge-o-gra-phy / fa-mi-ly 这种开音节；
      // 词典写法是 ge-og-ra-phy / fam-i-ly（o、a 是短元音且重读）。
      if (webster && cons.length >= 1 && split === 0 && isStressedLax(phonemes[v])) split = 1;
      // 前一音节 = prevStart .. v+split+1
      syls.push(range(prevStart, v + split + 1));
      prevStart = v + split + 1;
    } else {
      syls.push(range(prevStart, phonemes.length));
    }
  }
  return syls;
}
function range(a, b) { const r = []; for (let i = a; i < b; i++) r.push(i); return r; }

// 短（松）元音：只有这些元音在重读时需要闭音节收尾
const LAX_VOWELS = new Set(['AE', 'EH', 'IH', 'AA', 'UH', 'AH']);
function isStressedLax(ph) {
  return !!ph && (ph.stress === 1 || ph.stress === 2) && LAX_VOWELS.has(ph.p);
}

// 合法英语音节首（辅音音素串）—— 遵循韦氏「最大音节首」原则
function isLegalOnset(cs) {
  if (cs.length === 0) return true;
  if (cs.length === 1) return true;
  if (cs.length === 2) {
    const [a, b] = cs;
    // 塞音/擦音 + l/r/w/y（bl,br,cl,cr,dr,fl,fr,gl,gr,pl,pr,tr,thr 等）
    if ('BDFGKPTVTHDH'.includes(a) && 'LRWY'.includes(b)) return true;
    // s + 清塞音/鼻音/流音（sp,st,sk,sm,sn,sw,sl,sf,sv），注意 s+ch/sh 不算
    if (a === 'S' && 'PTKMNWLFV'.includes(b)) return true;
    return false;
  }
  if (cs.length === 3) {
    const [a, b, c] = cs;
    if (a === 'S' && 'PTK'.includes(b) && 'LRWY'.includes(c)) return true;
    return false;
  }
  return false;
}

// ---------- 6. 主重音下标 ----------
// cmudict 中部分复合词会有多个 "1"（双主重音），约定取「最后一个 1」作为主重音，
// 与旧数据保持一致，避免重音高亮位置发生回退。
function stressIndex(phonemes) {
  const vowels = phonemes.map((ph, i) => ({ ph, i })).filter(x => isVowel(x.ph.p));
  let idx = -1;
  for (let i = 0; i < vowels.length; i++) if (vowels[i].ph.stress === 1) idx = i; // 最后一个主重音
  if (idx === -1) for (let i = 0; i < vowels.length; i++) if (vowels[i].ph.stress === 2) idx = i; // 最后次级
  return idx; // 相对音节
}

// ---------- 7. 组装：单词 -> { n, s, l } ----------
function syllabify(word, phStr, webster) {
  const phonemes = parsePhonemes(phStr);
  const S = word.toLowerCase();
  const aligned = alignG2P(S, phonemes);
  if (!aligned) return null;
  const { ranges } = aligned;
  const syls = phonemeSyllables(phonemes, webster);

  // n = 元音音素数（权威，与 cmudict 一致），s = 主重音相对音节下标
  const n = syls.length;
  const s = stressIndex(phonemes);
  // 无元音音素的缩写（如 mm）：整体作为单段，n=0 时前端会按原词显示
  if (n === 0) return { n: 0, s: -1, l: [word] };

  // 每个音节在字母上的自然区间 [lo, hi)（取该音节所含音素区间的最小起点到最大终点）
  const lo = [], hi = [];
  for (const syl of syls) {
    let a = Infinity, b = -Infinity;
    for (const pi of syl) {
      const r = ranges[pi];
      if (r) { if (r.start < a) a = r.start; if (r.end > b) b = r.end; }
    }
    lo.push(a === Infinity ? -1 : a);
    hi.push(b);
  }

  // 切点法：把 n 个音节映射为 [0, word.length] 上的 n 个连续不重叠区间。
  // cut[i] = max(hi[i-1], lo[i]) 同时消解「多音素字形跨音节重叠」(如 x→ks) 与「词中不发音字母的间隙」。
  const cut = new Array(n + 1).fill(0);
  cut[0] = 0;
  cut[n] = word.length;
  for (let i = 1; i < n; i++) {
    cut[i] = Math.max(hi[i - 1], lo[i]);
  }
  // 保证单调不减、且落在有效范围
  for (let i = 1; i < n; i++) {
    if (cut[i] < cut[i - 1]) cut[i] = cut[i - 1];
  }
  for (let i = n - 1; i >= 1; i--) {
    if (cut[i] > cut[i + 1]) cut[i] = cut[i + 1];
  }

  // 生成分段
  let out = [];
  for (let i = 0; i < n; i++) {
    let a = cut[i], b = cut[i + 1];
    if (b <= a) b = a + 1; // 兜底：空音节至少占 1 个字母
    out.push(word.slice(a, b));
  }

  // 字母级修正：双写辅音在边界处拆分（hap|ppi|ness -> hap|pi|ness）
  refineDoubleConsonants(out);

  // 弱读前缀 + 单辅音：词典仍写开音节（decide 是 de·cide，不是 dec·ide）。
  // cmudict 把 decide 的首音节标成次重音 IH2，闭音节规则会误伤，这里改回开音节。
  const firstVowel = phonemes.find(p => isVowel(p.p));
  if (webster && out.length === 2 && firstVowel && firstVowel.stress === 2) {
    const m = out[0].toLowerCase().match(/^(de|re|pre|be|pro)([bcdfgklmnprstvz])$/);
    if (m && /^[aeiouy]/i.test(out[1])) { out[0] = m[1]; out[1] = m[2] + out[1]; }
  }

  // 不变式：分段拼起来必须等于原词，且不能有空段。
  // 音素边界偶尔落在多字母字形（如 -sion）中间，字母级切分会切出空段；
  // 这类词直接退回「最大音节首」的老算法，宁可不完美也不能显示错。
  if (webster && (out.some(x => !x) || out.join('') !== word)) return syllabify(word, phStr, false);

  return { n, s: s === -1 ? -1 : s, l: out };
}

// 双写辅音边界拆分：hap|ppi|ness -> hap|pi|ness；corr|ect -> cor|rect
function refineDoubleConsonants(segs) {
  for (let i = 0; i < segs.length - 1; i++) {
    // 情况1：后段以双写辅音开头（"a"+"pple" -> "ap"+"ple"）
    if (segs[i + 1].length >= 2) {
      const c = segs[i + 1][0].toLowerCase();
      if (segs[i + 1][1].toLowerCase() === c && !'aeiouy'.includes(c)) {
        segs[i] += c;
        segs[i + 1] = segs[i + 1].slice(1);
        continue;
      }
    }
    // 情况2：前段以双写辅音结尾（"corr"+"ect" -> "cor"+"rect"）
    if (segs[i].length >= 2) {
      const c = segs[i][segs[i].length - 1].toLowerCase();
      if (segs[i][segs[i].length - 2].toLowerCase() === c && !'aeiouy'.includes(c)) {
        segs[i] = segs[i].slice(0, -1);
        segs[i + 1] = c + segs[i + 1];
      }
    }
  }
}

// 合并「无元音字母」的成音节辅音段（如 -sm / -t-ler / 词尾 -r / u-s-ual）
// 规则：中间段并入后一段；末段并入前一段。-le 结尾（table 的 ble）不算异常，保留。
function mergeVowelLess(segs, stress) {
  const hasVowel = t => /[aeiouy]/i.test(t);
  // 缩写（cd/dvd/tv 等字母名称）：各段都无元音字母，但每个字母都是独立音节，不合并
  if (!segs.some(hasVowel)) return { segs: segs.slice(), stress };
  let out = segs.slice();
  let s = stress;
  let i = 0;
  while (i < out.length) {
    if (out.length <= 1) break;
    const seg = out[i];
    if (hasVowel(seg) || /le$/i.test(seg)) { i++; continue; }
    if (i < out.length - 1) {
      // 并入后一段（该段无元音，不可能是重音段）
      out[i + 1] = seg + out[i + 1];
      out.splice(i, 1);
      if (s > i) s = s - 1;
    } else {
      // 末段并入前一段
      out[i - 1] = out[i - 1] + seg;
      out.splice(i, 1);
      if (s >= i) s = i - 1;
    }
  }
  return { segs: out, stress: s };
}

// 含空格/连字符的复合词：按分隔符切分（分隔符并入后一段），与旧行为一致
function splitOnSeparators(word) {
  const segs = [];
  let buf = '';
  for (const ch of word) {
    if (ch === ' ' || ch === '-') {
      if (buf) { segs.push(buf); buf = ''; }
      buf = ch;
    } else {
      buf += ch;
    }
  }
  if (buf) segs.push(buf);
  return segs;
}


function main() {
  const dict = loadCmu();
  const root = path.join(__dirname, '..');
  const OUT = process.env.SYL_OUT || 'syllables_data.js';
  const wordsData = fs.readFileSync(path.join(root, 'words-data.js'), 'utf8');

  // 提取所有单词（去重、保序）
  const wordSet = new Set();
  const re = /\[\s*"([^"]+)"\s*,/g;
  let mm;
  while ((mm = re.exec(wordsData)) !== null) {
    const w = mm[1];
    if (/^[A-Za-z][A-Za-z\s\-']*$/.test(w)) wordSet.add(w);
  }

  const out = {};
  const OVR = loadOverrides();
  let hit = 0, miss = 0, alignFail = 0, ovr = 0;
  for (const w of wordSet) {
    const key = w.toLowerCase();
    // 人工覆盖优先：cmudict 给不出「拼写音节」的少数词走这里
    if (OVR[key]) {
      out[key] = { n: OVR[key].l.length, s: OVR[key].s, l: OVR[key].l.slice() };
      hit++; ovr++;
      continue;
    }
    // 含空格/连字符的复合词：按分隔符切分，与旧显示行为一致
    if (/[\s\-]/.test(w)) {
      const segs = splitOnSeparators(w);
      if (segs.length > 1) {
        out[key] = { n: segs.length, s: 0, l: segs };
        hit++;
        continue;
      }
    }
    let ph = dict[key];
    if (!ph) {
      // 尝试去掉空格/连字符
      const key2 = key.replace(/[\s\-']/g, '');
      ph = dict[key2];
    }
    if (!ph) { miss++; continue; }
    // 多个发音取第一个
    const first = ph.split(/[;,]/)[0].trim();

    // 同一份音素跑两套边界：
    //   webster=true  → 词典写法（ge·og·ra·phy），用于屏幕显示；
    //   webster=false → 最大音节首的发音式（ge·o·gra·phy），用于逐段朗读：
    //                   词典写法里 "his·tor·y" 的 "y" 单独念会变成 /waɪ/，不能拿来读。
    const finish = (r) => {
      if (!r) return null;
      if (EXCEPTIONS[key]) { r.l = EXCEPTIONS[key].slice(); r.n = r.l.length; }
      // 合并无元音的成音节辅音段（-sm / 词尾 -r / u-s-ual 等），并同步重音下标与 n
      if (r.n > 1) {
        const cleaned = mergeVowelLess(r.l, r.s);
        r.l = cleaned.segs;
        r.s = cleaned.stress;
      }
      // 兜底：n 一律以分段数为准（"mm" 这类没有元音的词，音素法会算出 n=0）
      r.n = r.l.length;
      if (r.s >= r.n) r.s = r.n - 1;
      return r;
    };

    const rw = finish(syllabify(w, first, true));
    if (!rw) { alignFail++; miss++; continue; }
    const rec = { n: rw.n, s: rw.s, l: rw.l };
    // 朗读切点：只在两套分段音节数一致、拼写都能还原时才记录（否则运行期直接用显示分段）
    const rp = finish(syllabify(w, first, false));
    if (rp && rp.l.length === rw.l.length && rp.l.join('') === rw.l.join('')) {
      const cuts = (segs) => { let acc = 0; const c = []; for (let i = 0; i < segs.length - 1; i++) { acc += segs[i].length; c.push(acc); } return c; };
      const cp = cuts(rp.l), cl = cuts(rw.l);
      if (cp.join(',') !== cl.join(',')) rec.p = cp;
    }
    out[key] = rec;
    hit++;
  }

  const json = JSON.stringify(out);
  const header = '// 音节数据（cmudict 音素 + 韦氏词典式闭音节规则）\n' +
    '// 每词 { n:音节数, s:主重音下标(0起,-1无), l:[显示分段...], p:[朗读切点,可选] }\n' +
    '// l = 词典写法（ge·og·ra·phy）；p = 逐段朗读用的字母切点（发音式，segments 数量与 l 相同）\n';
  fs.writeFileSync(path.join(root, OUT), header + 'const SYLLABLES_DATA=' + json + ';\n');
  console.log('总词数:', wordSet.size, '命中:', hit, '未命中:', miss, '对齐失败:', alignFail);
  if (ovr) console.log('其中人工指定音节:', ovr, '词');
  console.log('带朗读切点:', Object.keys(out).filter(k => out[k].p).length);
  console.log('已写入', OUT, '大小:', (json.length / 1024).toFixed(1), 'KB');
}

// 允许作为模块被 require（测试用）
if (require.main === module) {
  main();
} else {
  module.exports = { syllabify, alignG2P, parsePhonemes, loadCmu };
}
