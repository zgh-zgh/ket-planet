// Vercel Serverless Function：学习进度云同步
//
// 存储：Vercel 里新建的 Redis（环境变量 REDIS_URL，连接串形如 redis://default:密码@主机:端口）
// 认证：邮箱验证码验证通过时由 /api/auth 下发的 syncToken（HMAC，服务端可重算，不落库）
// 设计：每个邮箱一条 JSON（key = sha256(邮箱)），客户端拉取后自己合并再推回，
//       冲突按「学习阶段更大/时间更新」取胜，因此两台设备谁先谁后都不会丢进度。
import crypto from 'crypto';
import Redis from 'ioredis';

const KEY_PREFIX = 'ket:sync:';
const MAX_BYTES = 900 * 1024;

function syncKeyOf(email) {
  const key = process.env.SYNC_SECRET || process.env.CODE_SECRET || process.env.QQ_MAIL_PASS || '';
  return crypto.createHmac('sha256', key || 'ket-sync').update('sync:' + String(email).toLowerCase()).digest('hex');
}
function redisUrl() {
  return process.env.REDIS_URL || process.env.KV_URL || process.env.STORAGE_URL || '';
}

// 同一个函数实例里复用连接，减少握手；没配置就当没开启
let client = null;
function getClient() {
  const url = redisUrl();
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 6000,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: () => 800
    });
    client.on('error', () => {});
  }
  return client;
}
async function ready(c) {
  if (c.status === 'wait') await c.connect();
  if (c.status !== 'ready') throw new Error('redis ' + c.status);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && req.query && req.query.probe === '1') {
    const c = getClient();
    if (!c) return res.status(200).json({ configured: false, note: '未配置 REDIS_URL' });
    try {
      await ready(c);
      const pong = await c.ping();
      return res.status(200).json({ configured: true, ok: pong === 'PONG' });
    } catch (e) {
      return res.status(200).json({ configured: true, ok: false, error: String((e && e.message) || e) });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  const token = String(body.token || '');
  if (!token || token !== syncKeyOf(email)) {
    return res.status(401).json({ error: '同步凭据无效，请重新验证邮箱', code: 'BAD_TOKEN' });
  }

  const c = getClient();
  if (!c) return res.status(501).json({ error: '云同步还没开通', code: 'NO_STORE' });

  const key = KEY_PREFIX + crypto.createHash('sha256').update(email).digest('hex').slice(0, 40);

  try {
    await ready(c);

    if (body.action === 'pull') {
      const raw = await c.get(key);
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
      return res.status(200).json({ ok: true, data });
    }

    if (body.action === 'push') {
      const data = body.data;
      if (!data || typeof data !== 'object') return res.status(400).json({ error: '缺少 data' });
      const payload = Object.assign({}, data, { v: 1, ts: Date.now() });
      const str = JSON.stringify(payload);
      if (str.length > MAX_BYTES) return res.status(413).json({ error: '进度数据太大，暂时无法同步' });
      await c.set(key, str);
      return res.status(200).json({ ok: true, ts: payload.ts, bytes: str.length });
    }

    return res.status(400).json({ error: '未知操作' });
  } catch (e) {
    return res.status(502).json({ error: '同步服务异常', detail: String((e && e.message) || e) });
  }
}
