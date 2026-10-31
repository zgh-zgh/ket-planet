// Vercel Serverless Function：单词配图生成中转（API key 藏在服务端环境变量）
// 环境变量名：AGNES_API_KEY
export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { word, cn } = req.body || {};
  if (!word) {
    return res.status(400).json({ error: '缺少单词参数 word' });
  }

  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 API key' });
  }

  // 构造图片提示词：卡通插画风格，契合背单词场景
  const prompt = `A clean, cute cartoon illustration for the English word "${word}"${cn ? ` (meaning: ${cn})` : ''}, simple flat design, soft colors, clear and recognizable subject, vocabulary learning style, no text, no watermark`;

  try {
    const upstream = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'agnes-image-2.5-flash',
        prompt,
        size: '1K',
        ratio: '1:1',
        extra_body: { response_format: 'url' },
      }),
    });

    const data = await upstream.json();
    const url = data && data.data && data.data[0] && data.data[0].url;
    if (!url) {
      return res.status(502).json({ error: '图片生成失败', detail: data });
    }
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(502).json({ error: '图片生成异常', detail: String(e) });
  }
}
