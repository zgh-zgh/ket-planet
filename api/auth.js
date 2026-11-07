// Vercel Serverless Function：邮箱验证码（QQ 邮箱 SMTP 发信 + 无状态校验）
//
// 需要配置的环境变量（Vercel → Settings → Environment Variables）：
//   QQ_MAIL       发信的 QQ 邮箱完整地址，例如 123456@qq.com
//   QQ_MAIL_PASS  QQ 邮箱「设置 → 账户 → POP3/SMTP 服务」里生成的授权码（不是登录密码）
//   CODE_SECRET   可选，验证码签名密钥；不填则用授权码派生
//
// 设计说明：不落库。验证码本身不回传给前端，只回一个 HMAC 签名令牌，
// 令牌里存的是「邮箱 + 验证码哈希 + 过期时间」，服务端解签后比对，
// 因此无需数据库/Redis 也能防篡改，且验证码不会出现在浏览器里。
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import tls from 'tls';

const TTL_SEC = 600;             // 验证码 10 分钟有效
const COOLDOWN_MS = 60 * 1000;   // 同一邮箱 60 秒内只发一封
const MAX_PER_HOUR = 8;          // 同一邮箱每小时最多 8 封

// 单实例内的简易限流：Serverless 多实例时只能挡住一部分，但足以防连点
const bucket = new Map();

function conf() {
  return {
    mail: (process.env.QQ_MAIL || '').trim(),
    pass: (process.env.QQ_MAIL_PASS || '').trim(),
    secret: (process.env.CODE_SECRET || '').trim()
  };
}
function signKey(c) {
  return c.secret || (c.pass ? 'lexi::' + c.pass : '');
}
function sign(body, key) {
  return crypto.createHmac('sha256', key).update(body).digest('base64url');
}
function codeHash(email, code) {
  return crypto.createHash('sha256').update(email + '|' + code).digest('hex').slice(0, 32);
}
function makeToken(email, code, key) {
  const payload = { e: email, h: codeHash(email, code), x: Date.now() + TTL_SEC * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + sign(body, key);
}
function readToken(token, key) {
  const seg = String(token || '').split('.');
  if (seg.length !== 2) return null;
  if (sign(seg[0], key) !== seg[1]) return null;
  try {
    const p = JSON.parse(Buffer.from(seg[0], 'base64url').toString('utf8'));
    if (!p || !p.x || Date.now() > p.x) return null;
    return p;
  } catch (e) {
    return null;
  }
}
function checkLimit(email) {
  const now = Date.now();
  let r = bucket.get(email);
  if (!r) {
    r = { last: 0, hourStart: now, count: 0 };
    bucket.set(email, r);
  }
  if (now - r.last < COOLDOWN_MS) {
    return Math.max(1, Math.ceil((COOLDOWN_MS - (now - r.last)) / 1000));
  }
  if (now - r.hourStart > 3600000) {
    r.hourStart = now;
    r.count = 0;
  }
  if (r.count >= MAX_PER_HOUR) return 1800;
  return 0;
}
function touch(email) {
  const r = bucket.get(email);
  const now = Date.now();
  if (r) {
    r.last = now;
    r.count += 1;
  } else {
    bucket.set(email, { last: now, hourStart: now, count: 1 });
  }
}
function emailHtml(code) {
  return `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;background:#f7f8fc;border-radius:16px">
  <div style="font-size:13px;color:#4f6ef7;font-weight:800;letter-spacing:1px">墨词 · Lexi</div>
  <div style="font-size:20px;font-weight:800;color:#1f2436;margin:10px 0 6px">注册验证码</div>
  <div style="font-size:13.5px;color:#5c6478;line-height:1.7">你正在用这个邮箱注册「墨词 · Lexi」账号，请输入下面的验证码完成验证：</div>
  <div style="margin:18px 0;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#4f6ef7;background:#fff;border-radius:12px;padding:14px 0;border:1px solid #e3e8ff">${code}</div>
  <div style="font-size:12.5px;color:#8a90a6;line-height:1.7">验证码 10 分钟内有效，仅可使用一次。<br>如果这不是你本人的操作，请直接忽略这封邮件。</div>
</div>`;
}
function explain(e) {
  const s = String((e && e.code) || e || '');
  if (s.indexOf('EAUTH') >= 0 || s.indexOf('535') >= 0) return '发信邮箱或授权码不对，请检查 QQ_MAIL / QQ_MAIL_PASS';
  if (s.indexOf('ETIMEDOUT') >= 0 || s.indexOf('ESOCKET') >= 0 || s.indexOf('ECONNECTION') >= 0) return '连接 QQ 邮箱服务器超时，请稍后重试';
  if (s.indexOf('EDNS') >= 0) return '解析 smtp.qq.com 失败，请稍后重试';
  return '发信失败，请稍后重试';
}
async function sendMail(c, to, code) {
  const transport = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user: c.mail, pass: c.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  try {
    await transport.sendMail({
      from: `"墨词 Lexi" <${c.mail}>`,
      to,
      subject: `【墨词 Lexi】注册验证码 ${code}`,
      text: `你的注册验证码是 ${code}，10 分钟内有效。如非本人操作请忽略本邮件。`,
      html: emailHtml(code)
    });
  } finally {
    try { transport.close(); } catch (e) {}
  }
}

// 连通性自检：GET /api/auth?probe=1
// 只探测 smtp.qq.com:465 能不能连上，不涉及任何账号信息，方便排查「部署后发不出信」
function probeSmtp() {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let done = false;
    let sock;
    const finish = (obj) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch (e) {}
      resolve(Object.assign({ ms: Date.now() - t0 }, obj));
    };
    sock = tls.connect({ host: 'smtp.qq.com', port: 465, servername: 'smtp.qq.com', timeout: 8000 }, () => {
      finish({ ok: true, tls: sock.getProtocol(), note: 'Vercel 可以连 QQ 邮箱 465 端口' });
    });
    sock.on('data', (d) => finish({ ok: true, banner: String(d).slice(0, 60).trim() }));
    sock.on('error', (e) => finish({ ok: false, error: (e && e.code) || String(e) }));
    sock.on('timeout', () => finish({ ok: false, error: 'ETIMEDOUT' }));
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query && req.query.probe === '1') {
    const c = conf();
    const r = await probeSmtp();
    return res.status(200).json(Object.assign({ configured: !!(c.mail && c.pass) }, r));
  }
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const action = body.action === 'verify' ? 'verify' : 'send';
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  const c = conf();
  if (!c.mail || !c.pass) {
    return res.status(500).json({
      error: '服务器还没配置发信邮箱，请先在 Vercel 设置 QQ_MAIL 与 QQ_MAIL_PASS',
      code: 'NO_MAIL_CONFIG'
    });
  }
  const key = signKey(c);
  if (!key) return res.status(500).json({ error: '服务器缺少签名密钥', code: 'NO_SECRET' });

  if (action === 'send') {
    const wait = checkLimit(email);
    if (wait) {
      return res.status(429).json({ error: `发得太快了，请 ${wait} 秒后再试`, code: 'TOO_FAST' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    try {
      await sendMail(c, email, code);
    } catch (e) {
      return res.status(502).json({ error: explain(e), detail: String(e).slice(0, 200) });
    }
    touch(email);
    return res.status(200).json({ ok: true, token: makeToken(email, code, key), ttl: TTL_SEC });
  }

  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) return res.status(400).json({ error: '请输入 6 位数字验证码' });
  const p = readToken(body.token, key);
  if (!p) return res.status(400).json({ error: '验证码已过期，请重新获取', code: 'EXPIRED' });
  if (p.e !== email) return res.status(400).json({ error: '邮箱与验证码不匹配' });
  if (p.h !== codeHash(email, code)) return res.status(400).json({ error: '验证码不正确' });
  return res.status(200).json({ ok: true, email });
}

// 供本地脚本自检用（Vercel 只取 default 导出作为 handler，这些命名导出不影响部署）
export { makeToken, readToken, codeHash, signKey, conf };
