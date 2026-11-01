// 对战房间业务逻辑（CJS，供 api/pk.js 与本地 server.js 共用）
const store = require('./pk-store.js');
const { readRoom, writeRoom, storeReady, TTL } = store;

function randomCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

async function handlePk({ op, code, role, msg, since }) {
  if (!storeReady()) return { status: 501, body: { error: '在线对战未启用：未配置云端存储（KV）' } };

  if (op === 'create') {
    let c = randomCode();
    for (let i = 0; i < 5; i++) { if (!await readRoom(c)) break; c = randomCode(); }
    const room = { code: c, createdAt: Date.now(), seq: 0, host: { seen: Date.now() }, guest: { seen: 0 }, msgs: [] };
    await writeRoom(room);
    return { status: 200, body: { code: c, TTL } };
  }
  if (!/^\d{4}$/.test(String(code || ''))) return { status: 400, body: { error: '房间码格式错误' } };

  const room = await readRoom(code);
  if (!room) return { status: 404, body: { error: '房间不存在或已过期' } };

  if (op === 'join') {
    room.guest = { seen: Date.now() };
    await writeRoom(room);
    return { status: 200, body: { ok: true, host: room.host } };
  }
  if (op === 'push') {
    if (!msg || typeof msg !== 'object') return { status: 400, body: { error: '消息为空' } };
    if (room.msgs.length > 300) room.msgs.splice(0, room.msgs.length - 300);
    room.seq += 1;
    room.msgs.push({ s: room.seq, from: role === 'guest' ? 'guest' : 'host', t: msg.t, data: msg.data || null, at: Date.now() });
    if (role === 'guest') room.guest.seen = Date.now(); else room.host.seen = Date.now();
    await writeRoom(room);
    return { status: 200, body: { ok: true, seq: room.seq } };
  }
  if (op === 'poll') {
    if (role === 'guest') room.guest.seen = Date.now(); else room.host.seen = Date.now();
    await writeRoom(room);
    const sinceSeq = Number(since) || 0;
    return { status: 200, body: {
      seq: room.seq,
      msgs: room.msgs.filter(m => m.s > sinceSeq),
      host: room.host ? room.host.seen : 0,
      guest: room.guest ? room.guest.seen : 0,
      now: Date.now(),
    } };
  }
  return { status: 400, body: { error: '未知操作' } };
}

module.exports = { handlePk, storeReady };
