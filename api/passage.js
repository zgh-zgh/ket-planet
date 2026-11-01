// Vercel Serverless Function：按本批词汇生成「完整短文」（篇章研读）
// 环境变量：AGNES_API_KEY（与配图复用同一个 key）
// 入参：{ words: [{w, cn}], level: '初中'|'高中' }
// 出参：{ title, text, translation, used:[], missed:[], wordCount, coverage }
import core from '../lib/passage-core.js';
const { generatePassage, translateText } = core;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '服务端未配置 API key' });

  const { words, level, text } = req.body || {};

  try {
    res.setHeader('Cache-Control', 'no-store');
    // 模式二：只翻译（前端点「中英对照」时触发）
    if (text && !words) {
      const translation = await translateText({ apiKey, text });
      return res.status(200).json({ translation });
    }
    if (!Array.isArray(words) || !words.length) return res.status(400).json({ error: '缺少词汇列表 words' });
    if (words.length > 30) return res.status(400).json({ error: '一次最多 30 个词' });
    const out = await generatePassage({ apiKey, words, level });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: '短文生成失败', detail: String(e && e.message ? e.message : e) });
  }
}
