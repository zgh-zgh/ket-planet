// 临时联调脚本：两个浏览器上下文打一局在线对战
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
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pk-modes', { timeout: 60000 });
    return page;
  };

  const A = await mk('A');
  const B = await mk('B');
  const enter = async p => { await p.locator('.pk-mode-card').nth(2).click(); await p.waitForSelector('.pk-online-box'); };

  await enter(A);
  await A.click('text=创建房间');
  await A.waitForSelector('.pk-room-code');
  const code = (await A.textContent('.pk-room-code')).trim();
  console.log('房间码:', code);
  await A.waitForFunction(() => document.querySelector('#pkLinkState')?.textContent.includes('已连接'), null, { timeout: 20000 });
  console.log('A 通道已连接');

  await enter(B);
  await B.fill('#pkJoinCode', code);
  await B.click('.pk-online-col:has(#pkJoinCode) button');
  await B.waitForSelector('.pk-room-code');

  await A.waitForFunction(() => {
    const b = document.querySelector('#pkStartBtn');
    return b && !b.disabled;
  }, null, { timeout: 25000 });
  console.log('A 已收到对手加入:', (await A.textContent('#pkRoomTip')).trim());

  await A.click('#pkStartBtn');

  await A.waitForSelector('.pk-question', { timeout: 25000 });
  await B.waitForSelector('.pk-question', { timeout: 25000 });
  console.log('双方进入答题页');

  for (let i = 1; i <= 10; i++) {
    const doneA = await A.$('.pk-result');
    if (doneA) break;
    await A.waitForSelector('.pk-option:not(.locked)', { timeout: 20000 });
    await B.waitForSelector('.pk-option:not(.locked)', { timeout: 20000 });
    // A 慢一点答，B 快一点，检验逐题同步
    await B.locator('.pk-option').first().click();
    await sleep(250);
    await A.locator('.pk-option').last().click();
    await sleep(900);
    const idxA = (await A.textContent('.pk-progress').catch(() => '')) || '';
    console.log(`第 ${i} 题已作答 · A: ${idxA.trim()}`);
  }

  await A.waitForSelector('.pk-result', { timeout: 30000 });
  await B.waitForSelector('.pk-result', { timeout: 30000 });
  const scoreA = (await A.textContent('.pk-result-score')).trim();
  const scoreB = (await B.textContent('.pk-result-score')).trim();
  const titleA = (await A.textContent('.pk-result-title')).trim();
  const titleB = (await B.textContent('.pk-result-title')).trim();
  console.log('结果 A:', scoreA, titleA);
  console.log('结果 B:', scoreB, titleB);
  console.log('JS 错误:', errors.length ? errors.slice(0, 8) : '无');

  await A.screenshot({ path: '.tmp_pk_a.png' });
  await B.screenshot({ path: '.tmp_pk_b.png' });
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
