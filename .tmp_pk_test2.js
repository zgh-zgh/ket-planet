// 边界场景：房主码不匹配、对局中对手离开、大厅 UI 截图
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:3000/#/battle';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/hp/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '127.0.0.1,localhost' },
  });
  const errors = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`[${name}] ${m.text()}`); });
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.pk-modes', { timeout: 60000 });
    return p;
  };
  const enter = async p => { await p.locator('.pk-mode-card').nth(2).click(); await p.waitForSelector('.pk-online-box'); };

  // 1) 错误的房间码
  const X = await mk('X');
  await enter(X);
  await X.fill('#pkJoinCode', 'ZZZZZZ');
  await X.click('.pk-online-col:has(#pkJoinCode) button');
  await sleep(10500);
  console.log('错码提示:', (await X.textContent('#pkRoomTip')).trim());
  await X.click('text=离开');
  await X.waitForSelector('.pk-modes', { timeout: 8000 });
  console.log('错码页可正常退出');

  // 2) 大厅 UI + 对局中对手离开
  const A = await mk('A');
  const B = await mk('B');
  await enter(A);
  await A.click('text=创建房间');
  await A.waitForSelector('.pk-room-code');
  const code = (await A.textContent('.pk-room-code')).trim();
  console.log('房间码:', code, '长度:', code.length);
  await A.waitForFunction(() => document.querySelector('#pkLinkState')?.textContent.includes('已连接'), null, { timeout: 20000 });
  const box = await A.$('.pk-room');
  await box.screenshot({ path: '.tmp_pk_lobby.png' });

  await enter(B);
  await B.fill('#pkJoinCode', code.toLowerCase());     // 小写也应能进
  await B.click('.pk-online-col:has(#pkJoinCode) button');
  await B.waitForSelector('.pk-room-code');
  console.log('B 用小写码进入:', (await B.textContent('.pk-room-code')).trim());

  await A.waitForFunction(() => { const b = document.querySelector('#pkStartBtn'); return b && !b.disabled; }, null, { timeout: 25000 });
  await A.click('#pkStartBtn');
  await A.waitForSelector('.pk-question', { timeout: 25000 });
  await B.waitForSelector('.pk-question', { timeout: 25000 });

  // 对手中途离开：模拟关标签页（触发 pagehide → sendBeacon 告别）
  await B.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await B.close();
  await A.waitForSelector('.pk-result', { timeout: 25000 });
  const note = await A.textContent('.pk-result');
  console.log('对手离开后 A 看到:', note.includes('对手已离线') ? '含「对手已离线」提示' : '缺少离线提示');
  console.log('JS 错误:', errors.length ? errors.slice(0, 6) : '无');
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
