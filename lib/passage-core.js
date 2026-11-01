// 篇章研读：短文生成核心逻辑（供 Vercel 函数与本地 server.js 共用）
// 说明：调用 Agnes 平台的 OpenAI 兼容接口，用本批词汇生成 200~350 词的完整短文，
//      服务端做字数与词汇覆盖率校验，不达标自动重试一次。

const ENDPOINT = 'https://apihub.agnes-ai.com/v1/chat/completions';
const MODEL = process.env.PASSAGE_MODEL || 'agnes-3.0-flash';

function countWords(text) {
  return String(text || '').replace(/[^A-Za-z'’\- ]/g, ' ').split(/\s+/).filter(Boolean).length;
}
function esc(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// 目标词在文中是否出现（覆盖常见屈折变化：s/es/ed/ing/er/est、e 脱落、y→i、双写辅音）
function wordVariants(word) {
  const w = String(word);
  const set = new Set([w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'er', w + 'est', w + 'ly', w + 'd']);
  if (/e$/i.test(w)) {
    const b = w.slice(0, -1);
    ['ing', 'ed', 'es', 'er', 'est'].forEach(s => set.add(b + s));
  }
  if (/y$/i.test(w)) {
    const b = w.slice(0, -1);
    ['ies', 'ied', 'ier', 'iest'].forEach(s => set.add(b + s));
  }
  if (/[^aeiou][aeiou][bdgklmnprt]$/i.test(w)) {
    const b = w + w.slice(-1);
    ['ed', 'ing', 'er', 'est'].forEach(s => set.add(b + s));
  }
  return [...set].sort((a, b) => b.length - a.length);
}
function hitWord(word, text) {
  const t = String(text || '');
  return wordVariants(word).some(v => new RegExp('\\b' + esc(v) + '\\b', 'i').test(t));
}

function buildPrompt(words, level, strict) {
  const list = words.map(w => `${w.w}${w.cn ? '（' + String(w.cn).slice(0, 20) + '）' : ''}`).join('；');
  return `你是资深英语教研编辑。请用下面这批词汇，为中国${level || '初中'}学生写一篇【200–350 词的完整英文短文】，用于"篇章研读"。

硬性要求：
1. 必须是一整篇连贯文章：优先写成有开头—发展—结尾的小故事（人物、场景、起因、转折、结局齐全）；若词汇不适合叙事，可写成科普说明文。分 3–5 个自然段。严禁把句子逐条罗列、严禁用 First/Second/Finally 之类生硬堆砌。
1.1 句子要有变化：平均句长 12–20 词，避免连续三句以上用同一主语或同一句式开头（如 He... He... He...）；段落之间用 however / as a result / in the end 等衔接。
2. 必须用上至少 ${Math.ceil(words.length * 0.75)} 个目标词（尽量全部），允许词形变化（复数、过去式、-ing、派生词）${strict ? '；上一版覆盖率不达标，这一版必须用上更多目标词，且不许改变原意硬塞' : ''}。
3. 语言难度匹配${level || '初中'}：以常用词为主，句子不要过长；不出现中文，不出现生僻词。
4. 全文英文单词数必须在 210–340 之间（建议 250–300），字数不足要补充细节而不是硬凑；标题不超过 8 个词且语法正确（如 The Thief's Trick，不要出现 The Thieves Trick 这类错误）。
5. 正文不要加粗、不要加括号注释、不要任何标记。
目标词汇（${words.length} 个）：${list}

只输出 JSON，不要代码块、不要任何解释文字：
{"title":"英文标题","paragraphs":["第一段","第二段","第三段"],"used":["用到的目标词"],"missed":["没用到的目标词"]}`;
}

async function callModel(apiKey, prompt, temperature, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: '你只输出严格合法的 JSON，不添加代码块或解释。' },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: 1500,
      }),
      signal: ctrl.signal,
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data && data.error && (data.error.message || data.error.code)) || ('http ' + r.status));
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    return (msg && msg.content) || '';
  } finally {
    clearTimeout(timer);
  }
}

// 模型若返回整段，按句号切分成 3~5 段，保证移动端可读性
function autoParagraph(text) {
  const sentences = String(text).match(/[^.!?]+[.!?]+["']?/g) || [String(text)];
  if (sentences.length < 6) return text;
  const size = Math.ceil(sentences.length / 4);
  const out = [];
  for (let i = 0; i < sentences.length; i += size) {
    out.push(sentences.slice(i, i + size).join(' ').trim());
  }
  return out.join('\n\n');
}
function parseJson(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

function normalizeText(obj) {
  const paras = Array.isArray(obj && obj.paragraphs) ? obj.paragraphs.map(x => String(x).trim()).filter(Boolean) : [];
  let text = paras.length ? paras.join('\n\n') : String((obj && obj.text) || '').trim();
  if (text && text.indexOf('\n') < 0) text = autoParagraph(text);
  return text;
}
function evaluate(obj, words) {
  const text = normalizeText(obj);
  const n = countWords(text);
  const used = [], missed = [];
  for (const w of words) (hitWord(w.w, text) ? used : missed).push(w.w);
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 1);
  const avgSent = sentences.length ? n / sentences.length : n;
  const paras = text.split(/\n{1,}/).map(s => s.trim()).filter(Boolean).length || 1;
  return {
    text, n, used, missed, avgSent, paras,
    coverage: words.length ? used.length / words.length : 0,
  };
}

async function generatePassage({ apiKey, words, level }) {
  if (!apiKey) throw new Error('缺少 API key');
  const clean = words
    .map(w => ({ w: String(w.w || '').trim(), cn: String(w.cn || '').trim() }))
    .filter(w => /^[A-Za-z][A-Za-z'’\- ]{0,24}$/.test(w.w));
  if (!clean.length) throw new Error('词汇列表为空');

  const t0 = Date.now();
  let best = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const left = 27000 - (Date.now() - t0);            // 给 Vercel 30s 上限留余量
    if (attempt > 0 && left < 9000) break;
    const raw = await callModel(apiKey, buildPrompt(clean, level, attempt > 0), attempt ? 0.35 : 0.7, Math.min(24000, Math.max(8000, left)));
    const obj = parseJson(raw);
    if (!obj || !normalizeText(obj)) continue;
    const ev = evaluate(obj, clean);
    const fluent = ev.avgSent >= 9;
    const lenOk = ev.n >= 200 && ev.n <= 360;
    const score = (lenOk ? 1000 : 0) + ev.coverage * 1000 + (fluent ? 300 : 0);
    if (!best || score > best.score) {
      best = {
        score,
        payload: {
          title: String(obj.title || '').trim().slice(0, 90),
          text: ev.text,
          translation: String(obj.translation || '').trim(),
          used: ev.used,
          missed: ev.missed,
          wordCount: ev.n,
          coverage: Math.round(ev.coverage * 1000) / 1000,
        },
      };
    }
    if (lenOk && ev.coverage >= 0.75 && fluent) break;   // 字数/覆盖/句长达标即止
  }

  if (!best) throw new Error('模型未返回可用短文');
  return best.payload;
}

// 单独翻译（按需触发，避免和生成挤在一次调用里超时）
async function translateText({ apiKey, text }) {
  const t = String(text || '').trim();
  if (!apiKey) throw new Error('缺少 API key');
  if (!t) throw new Error('缺少待翻译文本');
  const prompt = `请把下面这篇英文短文翻译成自然、通顺的简体中文，保留原有的段落划分（用空行分隔），不要添加任何解释或标题以外的内容。只输出 JSON：{"translation":"中文译文"}\n\n英文原文：\n${t}`;
  const raw = await callModel(apiKey, prompt, 0.3, 22000);
  const obj = parseJson(raw);
  const out = obj && (obj.translation || obj.text || obj.cn);
  if (!out) throw new Error('翻译失败');
  return String(out).trim();
}

module.exports = { generatePassage, translateText, countWords, hitWord };
