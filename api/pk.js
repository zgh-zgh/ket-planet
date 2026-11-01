// 对战房间接口：创建 / 加入 / 推送消息 / 轮询
// 说明：站点为纯静态部署，实时对战采用「轮询房间信箱」方案；
//      需配置 KV（Vercel KV 或 Upstash Redis REST），否则线上返回 501。
import room from '../lib/pk-room.js';
const { handlePk } = room;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const out = await handlePk(req.body || {});
    return res.status(out.status).json(out.body);
  } catch (e) {
    return res.status(502).json({ error: '房间服务异常', detail: String(e && e.message ? e.message : e) });
  }
}
