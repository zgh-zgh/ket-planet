// Vercel Serverless Function：单词音标查询中转（解决有道接口 CORS 限制）
export default async function handler(req, res) {
  const q = (req.query && req.query.q) || (req.body && req.body.word);
  if (!q) {
    return res.status(400).json({ error: '缺少单词参数' });
  }

  try {
    const upstream = await fetch(
      `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}&doctype=json`
    );
    const data = await upstream.json();
    const sw = data.simple && data.simple.word && data.simple.word[0];
    const uk = sw && sw.ukphone ? sw.ukphone : '';
    const us = sw && sw.usphone ? sw.usphone : '';
    return res.status(200).json({ uk, us });
  } catch (e) {
    return res.status(502).json({ error: '音标查询异常', detail: String(e) });
  }
}
