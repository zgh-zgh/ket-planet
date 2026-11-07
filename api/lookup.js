// Vercel Serverless Function：单词释义查询中转（有道词典）
// 用途：学习页例句里点任意一个词，弹卡片显示中文释义 + 音标
// 本地词库（WORD_DB）命中时前端直接用本地数据，只有生词才走这里，省请求
export default async function handler(req, res) {
  const q = (req.query && req.query.q) || (req.body && req.body.q) || '';
  const word = String(q).trim();
  if (!word) return res.status(400).json({ error: '缺少单词参数' });

  try {
    const upstream = await fetch(
      `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&doctype=json`
    );
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    const data = await upstream.json();

    const ec = data.ec && data.ec.word && data.ec.word[0];
    const sw = data.simple && data.simple.word && data.simple.word[0];

    // 中文释义：只取前 2 个义项，卡片上够看就行，堆多了反而看不清
    let cn = '';
    if (ec && Array.isArray(ec.trs)) {
      const parts = [];
      for (const item of ec.trs) {
        for (const tr of (item.tr || [])) {
          const txt = tr && tr.l && tr.l.i && tr.l.i[0];
          if (txt) parts.push(String(txt).trim());
        }
      }
      cn = parts.filter(Boolean).slice(0, 2).join('；');
    }
    if (cn.length > 58) cn = cn.slice(0, 58) + '…';

    let ph = '';
    if (sw && sw.ukphone) ph = '/' + String(sw.ukphone).trim() + '/';
    else if (sw && sw.usphone) ph = '/' + String(sw.usphone).trim() + '/';

    return res.status(200).json({ cn, ph });
  } catch (e) {
    return res.status(502).json({ error: '释义查询异常', detail: String(e) });
  }
}
