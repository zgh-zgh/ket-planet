// Vercel Serverless Function：整句 TTS 朗读中转
// 使用微软 Edge 神经网络 TTS（免费、无 key、音质自然），
// 解决浏览器原生 speechSynthesis 无声音 / 逐词朗读的问题。
import { EdgeTTS } from 'node-edge-tts';

// 音色映射：英文用自然美音，中文用晓晓女声
function pickVoice(lang) {
  if (lang && lang.toLowerCase().startsWith('zh')) return 'zh-CN-XiaoxiaoNeural';
  return 'en-US-AriaNeural';
}

export default async function handler(req, res) {
  // 支持 GET query 与 POST body 两种传参
  const text = (req.query && req.query.text) || (req.body && req.body.text);
  const lang = (req.query && req.query.lang) || (req.body && req.body.lang) || 'en-US';

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '缺少文本参数 text' });
  }
  // 限制长度，避免滥用
  if (text.length > 600) {
    return res.status(400).json({ error: '文本过长' });
  }

  const voice = pickVoice(lang);
  try {
    const tts = new EdgeTTS({ voice, lang: voice.split('-').slice(0, 2).join('-') });
    const chunks = [];
    for await (const chunk of tts.streamAudio(text)) {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('生成音频为空');

    res.setHeader('Content-Type', 'audio/mpeg');
    // 例句固定，可长期缓存，减少重复生成
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'TTS 生成失败', detail: String(e) });
  }
}
