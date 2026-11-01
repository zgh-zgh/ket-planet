// 对战房间的轻量存储层
// - 配置了 Upstash / Vercel KV 时走 REST，可跨实例共享
// - 未配置时使用进程内存（仅本地开发或单实例可用）
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const IS_VERCEL = !!process.env.VERCEL;

const mem = new Map();          // code -> room
const TTL = 10 * 60 * 1000;     // 房间 10 分钟过期

function kvReady() { return !!(KV_URL && KV_TOKEN); }

async function kvCmd(cmd, ...args) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!r.ok) throw new Error('kv http ' + r.status);
  const j = await r.json();
  return j.result;
}

async function readRoom(code) {
  if (kvReady()) {
    const raw = await kvCmd('GET', 'pk:' + code);
    return raw ? JSON.parse(raw) : null;
  }
  const room = mem.get(code);
  if (!room) return null;
  if (Date.now() - room.createdAt > TTL) { mem.delete(code); return null; }
  return room;
}

async function writeRoom(room) {
  room.updatedAt = Date.now();
  if (kvReady()) {
    await kvCmd('SET', 'pk:' + room.code, JSON.stringify(room), 'EX', 600);
    return;
  }
  mem.set(room.code, room);
}

// 是否可用（线上未配置 KV 时不可用，避免多实例内存不共享造成"配对成功但收不到消息"）
function storeReady() {
  if (kvReady()) return true;
  if (IS_VERCEL) return false;
  return true;   // 本地 node server.js：单实例内存可用
}

module.exports = { readRoom, writeRoom, storeReady, kvReady, TTL };
