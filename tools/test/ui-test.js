/**
 * 灰盒自动化走查：起静态服务 → 打开页面 → 实际打一局 → 多视口截图
 *
 * 用法（需把 playwright 所在目录加入 NODE_PATH）：
 *   node ui-test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const PORT = 8129;

async function modalKind(page) {
  if (!(await page.locator('#modalRoot').isVisible())) return null;
  if (await page.locator('#btnNext').count()) return 'shop';
  if (await page.locator('#btnStart').count()) return 'intro';
  if (await page.locator('#btnAgain').count()) return 'end';
  if (await page.locator('#btnGo').count()) return 'endless';
  if (await page.locator('#diffList').count()) return 'start';
  return 'unknown';
}

/** 在页面里暴力枚举最优 6 张（与游戏内提示同源） */
async function bestIndices(page) {
  return await page.evaluate(function () {
    var s = window.Game.state();
    if (!s) return null;
    var ctx = window.Game.buildCtx();
    var n = s.hand.length, minK = window.Game.MIN_PLAY, maxK = Math.min(window.Game.MAX_PLAY, n);
    if (n < minK) return null;
    var best = null, idx = [];
    for (var k = minK; k <= maxK; k++) {
      (function rec(start) {
        if (idx.length === k) {
          var cards = idx.map(function (i) { return s.hand[i]; });
          var r = window.Hand.scorePlay(cards, ctx);
          if (!best || r.total > best.total) best = { total: r.total, type: r.type, idx: idx.slice() };
          return;
        }
        for (var i = start; i < n; i++) { idx.push(i); rec(i + 1); idx.pop(); }
      })(0);
    }
    return best;
  });
}

/** 等计分动画播完 */
async function waitFx(page) {
  await page.waitForFunction(function () {
    var r = document.getElementById('fx');
    return !r || !r.classList.contains('on');
  }, null, { timeout: 20000 }).catch(function () {});
}

/** 最优选牌并和牌 */
async function playOneHand(page) {
  await waitFx(page);
  if (!(await page.locator('#modalRoot').isHidden())) return null;
  const b = await bestIndices(page);
  if (!b) return null;
  for (const i of b.idx) {
    if (!(await page.locator('#modalRoot').isHidden())) return null;
    await page.locator('#hand .tile[data-index="' + i + '"]').click({ timeout: 4000 });
  }
  if (await page.locator('#btnPlay').isDisabled()) return null;
  await page.click('#btnPlay');
  await page.waitForTimeout(120);
  // 点一下特效层触发加速，不然整个 8 圈要跑很久
  await page.evaluate(function () {
    var r = document.getElementById('fx');
    if (r && r.onclick) r.onclick();
  });
  await waitFx(page);
  await page.waitForTimeout(160);
  return b;
}

/** 商店里尽量买牌灵 */
async function buySomething(page) {
  const pick = await page.evaluate(function () {
    var s = window.Game.state();
    if (!s.shop) return -1;
    for (var i = 0; i < s.shop.jokers.length; i++) {
      var it = s.shop.jokers[i];
if (!it.sold && s.money >= window.Content.RARITY[it.j.rarity].price && s.jokers.length < 7) return i;
    }
    return -1;
  });
  if (pick < 0) return false;
  const btn = page.locator('#shopList .shop-item[data-kind="joker"][data-idx="' + pick + '"] button');
  if (!(await btn.count())) return false;
  await btn.click();
  await page.waitForTimeout(200);
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function serve() {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, function () { resolve(srv); });
  });
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error('未找到可用的 Chrome / Edge');
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: findBrowser(), args: ['--no-sandbox'] });
  const errors = [];
  const logs = [];
  const shot = function (p, name) { return p.screenshot({ path: path.join(SHOTS, name) }); };

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) {
    if (m.type() === 'error') errors.push('console: ' + m.text());
    else logs.push(m.text());
  });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '01-start-mobile.png') });

  /* 开局 */
  await page.locator('#diffList .shop-item', { hasText: '东风局' }).locator('button').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, '02-level-intro.png') });

  await page.click('#btnStart');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, '03-play.png') });

  /* 选 6 张 */
  /* 听牌：开局时按钮应可用，选一个手里没有的牌作听口 */
  await page.click('#btnTenpai');
  await page.waitForTimeout(200);
  const pickerCells = await page.locator('#picker .picker-cell').count();
  const blocked = await page.locator('#picker .picker-cell.full').count();
  await page.locator('#picker .picker-cell:not(.full)').first().click();
  await page.waitForTimeout(250);
  const tp = await page.evaluate(function () {
    var s = window.Game.state();
    return s.tenpai ? { tile: s.tenpai.tile, turns: s.tenpai.turnsLeft } : null;
  });
  const tpChip = await page.locator('.chip--tenpai').count();
  if (!tp) throw new Error('听牌未生效');
  await shot(page, '03b-tenpai.png');

  const tiles = page.locator('#hand .tile');
  const handCount = await tiles.count();
  if (handCount !== 13) throw new Error('手牌应为 13 张，实为 ' + handCount);
  for (let i = 0; i < 6; i++) await tiles.nth(i).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, '04-selected.png') });

  const preview = await page.textContent('#preview');
  const playDisabled = await page.locator('#btnPlay').isDisabled();
  if (playDisabled) throw new Error('选满 6 张后「和牌」仍不可用');

  /* 和牌 */
  await page.click('#btnPlay');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, '05-scoring.png') });
  await page.waitForTimeout(2600);

  const scoreText = await page.textContent('#scoreValue');
  if (scoreText === '0') throw new Error('和牌后得分仍为 0（预览：' + preview + '）');
  await page.screenshot({ path: path.join(SHOTS, '06-after-play.png') });

  /* 提示按钮：自动打出最高分组合，消耗一次提示机会 */
  const hintBefore = await page.evaluate(function () { return window.Game.state().hintsLeft; });
  const scoreBeforeHint = await page.evaluate(function () { return window.Game.state().score; });
  await page.click('#btnHint');
  await page.waitForTimeout(200);
  await page.evaluate(function () { var r = document.getElementById('fx'); if (r && r.onclick) r.onclick(); });
  await waitFx(page);
  await page.waitForTimeout(250);
  const hintAfter = await page.evaluate(function () { return window.Game.state().hintsLeft; });
  const scoreAfterHint = await page.evaluate(function () { return window.Game.state().score; });
  const doraInHand = await page.locator('#hand .tile.is-dora').count();
  const doraChip = await page.locator('.chip--dora .tile').count();
  await shot(page, '06b-hint-and-dora.png');


  /* 用最优选牌跑完整个 8 圈，直到通关或流局 */
  let reachedEnd = false, retries = 0, hands = 0, shopVisits = 0, purchases = 0;
  let shopShot = false, nextShot = false, lastRetries = 3, slotTested = false;
  let endlessShot = false;
  const playLog = [];
  const trace = [];

  for (let step = 0; step < 800; step++) {
    const kind = await modalKind(page);
    if (kind === 'end') {
      const fi = await page.evaluate(function () { var s = window.Game.state(); return { score: s.score, target: s.target }; });
      trace.push('    → 流局 ' + fi.score.toLocaleString('en-US') + ' / ' + fi.target.toLocaleString('en-US') + '　［本局结束］');
      await shot(page, '08-run-end.png'); reachedEnd = true; break;
    }
    if (kind === 'intro') {
    if (kind === 'endless') {
      if (!endlessShot) { await shot(page, '11-endless-choice.png'); endlessShot = true; }
      await page.click('#btnGo');   // 机器人总是选无尽
      await page.waitForTimeout(150);
      continue;
    }

      const ii = await page.evaluate(function () {
        var s = window.Game.state();
        return { r: s.round, l: s.levelIndex, target: s.target, plays: s.playsLeft, retries: s.retriesLeft, score: s.score };
      });
      trace.push('圈' + ii.r + '关' + (ii.l + 1) + '　目标 ' + ii.target.toLocaleString('en-US') +
        '（出牌 ' + ii.plays + '）' + (ii.score > 0 ? '　[流局，得分 ' + ii.score.toLocaleString('en-US') + '，余续命 ' + ii.retries + ']' : ''));
      await page.click('#btnStart'); await page.waitForTimeout(110); continue;
    }
    if (kind === 'shop') {
      shopVisits++;
      const si = await page.evaluate(function () {
        var s = window.Game.state();
        return { score: s.score, target: s.target, money: s.money, used: s.playsLeft };
      });
      trace.push('    → 过关 ' + si.score.toLocaleString('en-US') + ' / ' + si.target.toLocaleString('en-US') +
        '（剩出牌 ' + si.used + '，铜钱 ' + si.money + '）');
      if (!shopShot) { await shot(page, '07-shop.png'); shopShot = true; }
      if (await buySomething(page)) purchases++;
      if (!nextShot) { await shot(page, '09-shop-after-buy.png'); nextShot = true; }
      if (!slotTested) {
        await page.click('#btnSlotEntry');
        await page.waitForTimeout(150);
        const reelCount = await page.locator('.slot-reel').count();
        await page.click('#btnSpin');
        await page.waitForTimeout(1800);
        const slotState = await page.evaluate(function () {
          var s = window.Game.state();
          return {
            used: s.slotUsedThisRound,
            reels: Array.prototype.map.call(document.querySelectorAll('.slot-reel'), function (el) {
              return el.textContent;
            }),
            results: document.querySelectorAll('#slotResults .slot-result-item').length
          };
        });
        if (reelCount !== 3 || !slotState.used || slotState.results < 1) {
          throw new Error('符牌机未正确摇出结果：' + JSON.stringify(slotState));
        }
        await shot(page, '10-slot-machine.png');
        await page.click('#btnSlotBack');
        await page.waitForTimeout(150);
        slotTested = true;
      }
      await page.click('#btnNext');
      await page.waitForTimeout(160);
      continue;
    }
    if (kind === 'start') break;
    const b = await playOneHand(page);
    if (!b) break;
    hands++;
    if (playLog.length < 12) playLog.push(b.type + ' ' + b.total);
    const st = await page.evaluate(function () { var s = window.Game.state(); return { retriesLeft: s.retriesLeft }; });
    if (st.retriesLeft < lastRetries) { retries += lastRetries - st.retriesLeft; lastRetries = st.retriesLeft; }
  }

  const final = await page.evaluate(function () {
    var s = window.Game.state();
    return {
      round: s.round, level: s.levelIndex, phase: s.phase,
      score: s.score, target: s.target, total: s.totalScore,
      jokers: s.jokers.map(function (jt) { return window.Content.jokerById(jt.id).name; }),
      money: s.money, cleared: s.levelsCleared
    };
  });

  /* 桌面视口 */
  /* 旧存档兼容：把 hintsLeft 删掉模拟旧版本存档，重载后应补为 6 */
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await p3.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p3.locator('#diffList .shop-item', { hasText: '东风局' }).locator('button').click();
  await p3.waitForTimeout(200);
  await p3.click('#btnStart');
  await p3.waitForTimeout(200);
  await p3.evaluate(function () {
    var s = JSON.parse(localStorage.getItem('hepai.run.v1'));
    delete s.hintsLeft;
    localStorage.setItem('hepai.run.v1', JSON.stringify(s));
  });
  await p3.reload();
  await p3.waitForTimeout(400);
  const migratedHints = await p3.evaluate(function () {
    var s = window.Game.state(); return s ? s.hintsLeft : null;
  });
  const hintLabel = ((await p3.textContent('#btnHint')) || '').replace(/\s+/g, ' ').trim();
  const tierLabel = await p3.evaluate(function () {
    var s = window.Game.state();
    s.jokers = [{ id: 'laoqian', tier: 2 }];
    window.UI.render();
    return document.getElementById('jokerStrip').textContent;
  });

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', function (e) { errors.push('desktop pageerror: ' + e.message); });
  await page2.goto('http://127.0.0.1:' + PORT + '/index.html');
  await page2.waitForTimeout(300);
  await page2.locator('#diffList .shop-item', { hasText: '南风局' }).locator('button').click();
  await page2.waitForTimeout(250);
  await page2.click('#btnStart');
  await page2.waitForTimeout(300);
  await page2.screenshot({ path: path.join(SHOTS, '09-desktop.png') });

  /* 像素检查：截图非空白 */
  const sizes = fs.readdirSync(SHOTS).map(function (f) {
    return { f: f, kb: Math.round(fs.statSync(path.join(SHOTS, f)).size / 1024) };
  });

  console.log('\n=== 灰盒走查（东风局 · 最优选牌机器人） ===');
  console.log('手牌张数        :', handCount);
  console.log('6 张预览        :', preview.trim());
  console.log('首手得分        :', scoreText);
  console.log('提示次数      :', hintBefore + ' → ' + hintAfter + '（得分 ' + scoreBeforeHint + ' → ' + scoreAfterHint + '）');
  console.log('旧存档迁移    : hintsLeft 补为 ' + migratedHints + '，按钮显示「' + hintLabel + '」');
  console.log('牌灵合并反馈  : ' + (tierLabel.indexOf('二重') >= 0 ? '二重标记已显示' : '未显示二重标记'));
  console.log('宝牌高亮      : 手牌 ' + doraInHand + ' 张，顶部指示牌 ' + doraChip + ' 张');
  console.log('听牌          : 可选 ' + (pickerCells - blocked) + '/' + pickerCells +
    ' 张，听口 ' + (tp ? tp.tile + '（剩 ' + tp.turns + ' 回合）' : '未设置') + '，顶部提示 ' + tpChip + ' 个');
  console.log('总出牌手数      :', hands);
  console.log('流局续命次数    :', retries);
  console.log('进店次数        :', shopVisits);
  console.log('购买次数        :', purchases);
  console.log('符牌机          :', slotTested ? '三转轮、摇杆、合并结果已跑通' : '未测试');
  console.log('通过关卡数      :', final.cleared);
  console.log('结束位置        : 第 ' + final.round + ' 圈 · ' + final.level + ' 关（' + final.phase + '）');
  console.log('最终牌灵        :', final.jokers.length ? final.jokers.join('、') : '无');
  console.log('剩余铜钱        :', final.money);
  console.log('本局总分        :', final.total.toLocaleString('en-US'));
  console.log('前 12 手        :', playLog.join(' | '));
  console.log('\n逐关追踪：');
  trace.forEach(function (t) { console.log('  ' + t); });
  console.log('控制台错误      :', errors.length ? errors : '无');
  console.log('\n截图：');
  sizes.forEach(function (s) { console.log('  ' + s.f + '  ' + s.kb + ' KB'); });

  await browser.close();
  srv.close();

  if (errors.length) { console.log('\n存在控制台错误'); process.exit(1); }
  if (hintAfter !== hintBefore - 1) { console.log('\n提示按钮未正确扣除次数'); process.exit(1); }
  if (scoreAfterHint <= scoreBeforeHint) { console.log('\n提示未产生得分'); process.exit(1); }
  if (!doraChip) { console.log('\n顶部宝牌指示牌未渲染'); process.exit(1); }
  if (!tp) { console.log('\n听牌未生效'); process.exit(1); }
  if (!tpChip) { console.log('\n听牌提示条未渲染'); process.exit(1); }
  if (migratedHints !== 6) { console.log('\n旧存档未被正确迁移，hintsLeft=' + migratedHints); process.exit(1); }
  if (tierLabel.indexOf('二重') < 0) { console.log('\n主牌灵栏未显示合并档位'); process.exit(1); }
  if (!shopVisits) { console.log('\n未走到商店，流程未拉通'); process.exit(1); }
  if (!slotTested) { console.log('\n符牌机界面未跑通'); process.exit(1); }
  if (!reachedEnd) { console.log('\n本局未进入结算，流程未跑完'); process.exit(1); }
  console.log('\n流程已拉通：开局 → 出牌 → 过关 → 商店 → 结算');
}

run().catch(function (e) {
  console.error('走查失败：', e.message);
  process.exit(1);
});
