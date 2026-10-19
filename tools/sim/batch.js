/**
 * 无头批量模拟器
 *
 * 直接复用游戏本体的 tiles.js / hand.js / content.js / game.js，
 * 不开浏览器，用「最优选牌 + 会听牌 + 会买牌灵」的机器人跑成千上万局，
 * 输出可作调参依据的统计量。
 *
 * 用法：
 *   node batch.js                  # 三档难度各跑 300 局
 *   node batch.js 1000             # 各跑 1000 局
 *   node batch.js 300 east         # 只跑东风局
 */

const path = require('path');

global.window = global;
global.localStorage = {
  getItem: function () { return null; },
  setItem: function () {},
  removeItem: function () {}
};
const SRC = path.join(__dirname, '..', '..', 'src');
require(path.join(SRC, 'tiles.js'));
require(path.join(SRC, 'hand.js'));
require(path.join(SRC, 'content.js'));
require(path.join(SRC, 'game.js'));

const T = global.Tiles, H = global.Hand, C = global.Content, G = global.Game;

/* ---------------------------------------------------------- 机器人 */
var onlyCons = null;   // 扫描用：只买/只用指定的香火
var MAX_ROUND = 25;    // 模拟上限：越过就计为「无限」并中断，避免单局跑断
var seed = null;       // 可选固定随机种子，便于复现实验

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}


/** 枚举 C(13,6) 找最高分的一手。打满 6 张永远不劣于少打，所以不用枚举小组合。 */
function pickBest(cards, ctx) {
  const n = cards.length;
  if (n < G.MAX_PLAY) return null;
  let best = null;
  for (let a = 0; a < n - 5; a++)
    for (let b = a + 1; b < n - 4; b++)
      for (let c = b + 1; c < n - 3; c++)
        for (let d = c + 1; d < n - 2; d++)
          for (let e = d + 1; e < n - 1; e++)
            for (let f = e + 1; f < n; f++) {
              const hand = [cards[a], cards[b], cards[c], cards[d], cards[e], cards[f]];
              const r = H.scorePlay(hand, ctx, true);
              if (!best || r.total > best.total) best = { total: r.total, hand, type: r.type };
            }
  return best;
}

/** 听口选「手牌里没有、且自己牌组里副本最多」的牌 —— 命中率最高 */
function pickTenpaiTile(state) {
  let best = null, bestCopies = -1;
  T.allTileIds().forEach(function (t) {
    if (state.hand.indexOf(t) >= 0) return;       // 将牌不是现牌
    const copies = state.copies[t] || 0;
    if (copies > bestCopies) { bestCopies = copies; best = t; }
  });
  return best;
}

/** 买牌灵：优先乘番型，其次便宜的 */
function doShopping(state, stats) {

  for (let slot = 0; slot < 2; slot++) {
    if (!state.shop) return;
    let pick = -1, bestScore = -1;
    state.shop.jokers.forEach(function (item, i) {
      if (item.sold) return;
      if (state.jokers.length >= G.JOKER_SLOTS) return;
      const price = C.RARITY[item.j.rarity].price;
      if (state.money < price) return;
      // 乘番型优先，同档选便宜的
      let score = (item.j.mult ? 100 : 0) - price;
      if (score > bestScore) { bestScore = score; pick = i; }
    });
    if (pick < 0) break;
    G.buyJoker(pick);
  }

  if (onlyCons === 'none') return;

  // 再买香火：默认买满当前货架上有用的升级/加张/加倍，避免机器人囤钱失真。
  const wish = onlyCons
    ? [onlyCons, onlyCons, onlyCons]
    : ['shengjifu', 'jiazhangfu', 'jiabeifu'];
  for (let w = 0; w < wish.length && state.consumableIds.length < 3; w++) {
    for (let i = 0; i < state.shop.consumables.length && state.consumableIds.length < 3; i++) {
      const it = state.shop.consumables[i];
      if (it.sold || it.c.id !== wish[w] || state.money < it.c.price) continue;
      if (G.buyConsumable(i)) stats.consBought++;
    }
  }
}

/** 用掉加张符：集中堆一张牌，听牌时专听它 */
function useConsumables(state, typeCount, onlyId) {
  if (onlyId === 'none') return;
  for (let i = state.consumableIds.length - 1; i >= 0; i--) {
    const def = C.consumableById(state.consumableIds[i]);
    if (!def) continue;
    if (onlyId && def.id !== onlyId) continue;

    if (def.picker === 'remove') {
      let worst = null, lowN = 99;
      T.allTileIds().forEach(function (t) {
        const n = state.copies[t] || 0;
        if (n > 1 && n < lowN) { lowN = n; worst = t; }
      });
      if (worst) G.useConsumable(i, worst);
      continue;
    }
    if (!def.picker) { G.useConsumable(i); continue; }   // 换牌符/加倍符/洗牌符

    if (def.picker === 'upgrade') {
      // 升级全堆在用得最多的牌型上
      var bestType = null, topN = -1;
      for (var tp in typeCount) {
        if (typeCount[tp] > topN) { topN = typeCount[tp]; bestType = tp; }
      }
      if (bestType) G.useConsumable(i, bestType);
      continue;
    }
    if (def.picker !== 'add') continue;
    let best = null, bestN = -1;
    T.allTileIds().forEach(function (t) {
      const n = state.copies[t] || 0;
      if (n < 4 && n > bestN) { bestN = n; best = t; }
    });
    if (best) G.useConsumable(i, best);
  }
}

/** 跑完一整局，返回统计数据 */
function playRun(difficultyId) {
  G.newRun(difficultyId);
  const stats = {
    difficulty: difficultyId,
    won: false,
    levelsCleared: 0,
    hands: 0,
    tenpaiHit: 0,
    typeCount: {},
    tenpaiMiss: 0,
    gangPlays: 0,
    shopVisits: 0,
    jokersBought: 0,
    failRound: null,
    failLevel: null,
    totalScore: 0,
    jokers: [],
    target: 0,
    achieved: 0,
    terminalMoney: 0,
    moneyEarned: 0,
    consBought: 0
  };

  for (let guard = 0; guard < 3000; guard++) {
    const s = G.state();

    // 进入无尽后不会再回到 endlessChoice，因此上限必须在主循环里检查。
    if (s.round > MAX_ROUND) {
      stats.capped = true;
      stats.reachedEndless = true;
      stats.endRound = MAX_ROUND;
      break;
    }

    if (s.phase === 'won') { stats.won = true; break; }
    if (s.phase === 'endlessChoice') {
      stats.reachedEndless = true;
      stats.moneyAtEndless = s.money;
      G.enterEndless();     // 机器人总是选继续 —— 这正是要测的
      continue;
    }

    if (s.phase === 'lost') {
      stats.failRound = s.round;
      stats.failLevel = s.levelIndex;
      stats.target = s.target;
      stats.achieved = s.score;
      break;
    }

    if (s.phase === 'shop') {
      stats.shopVisits++;
      const before = s.jokers.length;
      doShopping(s, stats);
      stats.jokersBought += s.jokers.length - before;
      if (!s.slotUsedThisRound) { stats.slotSpins = (stats.slotSpins || 0) + 1; G.spinSlot(); }
      useConsumables(s, stats.typeCount, onlyCons);
      G.nextLevel();
      if (G.state().phase === 'won') { stats.won = true; break; }
      continue;
    }

    // phase === 'level'
    if (!s.tenpai && !s.tenpaiUsedThisLevel) {
      const tile = pickTenpaiTile(s);
      if (tile) G.declareTenpai(tile);
    }

    const before = { gang: s.gangUpgrades, tenpai: s.tenpai };
    const best = pickBest(s.hand, G.buildCtx());
    if (!best) break;

    const res = G.play(best.hand);
    stats.hands++;
    stats.typeCount[res.detail.type] = (stats.typeCount[res.detail.type] || 0) + 1;

    if (res.detail.fanItems.some(function (i) { return i.name === '刻上开花'; })) stats.gangPlays++;
    if (before.tenpai) {
      if (before.tenpai.tile && best.hand.indexOf(before.tenpai.tile) >= 0) stats.tenpaiHit++;
      else if (!G.state().tenpai) stats.tenpaiMiss++;
    }

    if (res.outcome === 'cleared') {
      const info = G.completeLevel();
      stats.moneyEarned += info.income + info.interest;
      continue;
    }
    if (res.outcome === 'failed') {
      const r = G.failLevel();
      if (r === 'retry') continue;
      stats.failRound = s.round;
      stats.failLevel = s.levelIndex;
      stats.target = s.target;
      stats.achieved = s.score;
      break;
    }
  }

  const end = G.state();
  stats.levelsCleared = end.levelsCleared;
  stats.totalScore = end.totalScore;
  stats.jokers = end.jokers.map(function (j) { return C.jokerById(j.id).name; });
  stats.gangUpgrades = end.gangUpgrades;
  if (!stats.capped) stats.endRound = end.round;
  stats.endless = end.endless;
  stats.terminalMoney = end.money;
  stats.growthMult = end.snowballMult || 1;
  stats.tierTotal = end.jokers.reduce(function (a, j) { return a + (j.tier || 1); }, 0);
  stats.typeUpgradeTotal = Object.keys(end.typeUpgrades || {}).reduce(function (a, k) { return a + end.typeUpgrades[k]; }, 0);
  stats.levelFanBonus = end.levelFanBonus;
  stats.deckUpgrades = T.allTileIds().reduce(function (a, t) {
    return a + Math.max(0, (end.copies[t] || 0) - C.difficultyById(difficultyId).copies);
  }, 0);
  return stats;
}

/* ---------------------------------------------------------- 统计 */

function pct(n, d) { return d ? (n / d * 100).toFixed(1) + '%' : '—'; }
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

function summarize(runs, difficultyName) {
  const n = runs.length;
  // 「通关」现在指通过第 8 圈（进入无尽）；最终结局总是流局
  const won = runs.filter(function (r) { return r.won || r.reachedEndless; }).length;
  const scores = runs.map(function (r) { return r.totalScore; }).sort(function (a, b) { return a - b; });
  const rounds = runs.map(function (r) { return (r.won || r.reachedEndless) ? 8 : r.failRound; });

  console.log('\n' + '='.repeat(74));
  console.log(`【${difficultyName}】样本 ${n} 局`);
  console.log('='.repeat(74));
  // 通关率的 95% 置信区间（正态近似）
  const p = won / n, se = Math.sqrt(p * (1 - p) / n);
  const ci = 1.96 * se * 100;
  console.log(`  通过第 8 圈        ${pct(won, n)}  （95% CI ±${ci.toFixed(1)}%，样本 ${n}）`);
  console.log(`  区间              ${((p - 1.96 * se) * 100).toFixed(1)}% ~ ${((p + 1.96 * se) * 100).toFixed(1)}%`);
  console.log(`  失败点（圈）中位数 ${quantile(rounds.slice().sort(function (a, b) { return a - b; }), 0.5)}`);

  // 失败点分布直方图
  const hist = {};
  runs.forEach(function (r) {
    const k = (r.won || r.reachedEndless) ? 8 : r.failRound;
    hist[k] = (hist[k] || 0) + 1;
  });
  console.log('\n  失败圈分布（含通关记为第 8 圈）:');
  for (let i = 1; i <= 8; i++) {
    const c = hist[i] || 0;
    const bar = '#'.repeat(Math.round(c / n * 50));
    console.log(`    第 ${i} 圈  ${String(c).padStart(5)}  (${pct(c, n).padStart(6)})  ${bar}`);
  }

  console.log('\n  总分分布:');
  const depths = runs.map(function (r) { return r.endRound || 0; }).sort(function (a, b) { return a - b; });
  console.log('\n  无尽深度（最终到达圈数）:');
  console.log(`    中位数  第 ${quantile(depths, 0.5).toFixed(1)} 圈`);
  console.log(`    75%     第 ${quantile(depths, 0.75).toFixed(1)} 圈`);
  console.log(`    90%     第 ${quantile(depths, 0.90).toFixed(1)} 圈`);
  console.log(`    最深    第 ${depths[depths.length - 1]} 圈`);
  const capped = runs.filter(function (r) { return r.capped; }).length;
  console.log(`    撞上限(第 ${MAX_ROUND} 圈)  ${pct(capped, n)}`);

  console.log(`    中位数  ${fmt(quantile(scores, 0.5))}`);
  console.log(`    25%     ${fmt(quantile(scores, 0.25))}`);
  console.log(`    75%     ${fmt(quantile(scores, 0.75))}`);
  console.log(`    10%     ${fmt(quantile(scores, 0.10))}`);
  console.log(`    90%     ${fmt(quantile(scores, 0.90))}`);

  const money = runs.map(function (r) { return r.terminalMoney || 0; })
    .sort(function (a, b) { return a - b; });
  console.log('\n  终局铜钱:');
  console.log(`    中位数  ${fmt(quantile(money, 0.5))}`);
  console.log(`    25%     ${fmt(quantile(money, 0.25))}`);
  console.log(`    75%     ${fmt(quantile(money, 0.75))}`);
  const openingMoney = runs.filter(function (r) { return typeof r.moneyAtEndless === 'number'; })
    .map(function (r) { return r.moneyAtEndless; })
    .sort(function (a, b) { return a - b; });
  if (openingMoney.length) {
    console.log('\n  通过第 8 圈时铜钱（n=' + openingMoney.length + '）:');
    console.log(`    中位数  ${fmt(quantile(openingMoney, 0.5))}`);
    console.log(`    25%     ${fmt(quantile(openingMoney, 0.25))}`);
    console.log(`    75%     ${fmt(quantile(openingMoney, 0.75))}`);
  }

  const avg = function (f) { return runs.reduce(function (a, r) { return a + f(r); }, 0) / n; };
  // 失败时「实得 / 目标」的比值：越接近 1 说明卡得越紧，越好调
  const short = runs.filter(function (r) { return r.target > 0; })
    .map(function (r) { return r.achieved / r.target; })
    .sort(function (a, b) { return a - b; });
  console.log('\n  失败时差距（实得 ÷ 目标）:');
  console.log(`    中位数  ${(quantile(short, 0.5) * 100).toFixed(0)}%`);
  console.log(`    25%     ${(quantile(short, 0.25) * 100).toFixed(0)}%`);
  console.log(`    75%     ${(quantile(short, 0.75) * 100).toFixed(0)}%`);
  console.log('\n  平均值:');
  console.log(`    通过关卡     ${avg(function (r) { return r.levelsCleared; }).toFixed(1)} / 24`);
  console.log(`    出牌手数     ${avg(function (r) { return r.hands; }).toFixed(1)}`);
  console.log(`    听牌命中     ${avg(function (r) { return r.tenpaiHit; }).toFixed(2)} 次`);
  console.log(`    听牌落空     ${avg(function (r) { return r.tenpaiMiss; }).toFixed(2)} 次`);
  console.log(`    刻上开花     ${avg(function (r) { return r.gangPlays; }).toFixed(2)} 次`);
  console.log(`    开花累积番   ${avg(function (r) { return r.gangUpgrades; }).toFixed(2)} 番`);
  console.log(`    加张符用掉   ${avg(function (r) { return r.deckUpgrades; }).toFixed(2)} 张`);
  console.log(`    升级符用掉   ${avg(function (r) { return r.typeUpgradeTotal; }).toFixed(2)} 张`);
  console.log(`    老虎机次数   ${avg(function (r) { return r.slotSpins || 0; }).toFixed(2)} 次`);
  console.log(`    牌灵总档位   ${avg(function (r) { return r.tierTotal || 0; }).toFixed(2)}（普通合计 8 个栏位）`);
  console.log(`    永久加番     ${avg(function (r) { return r.levelFanBonus || 0; }).toFixed(1)} 番`);
  console.log(`    成长倍率     ${avg(function (r) { return r.growthMult || 1; }).toFixed(2)} 倍`);
  console.log(`    最终到达圈   ${avg(function (r) { return r.endRound; }).toFixed(2)}`);
  console.log(`    买牌灵       ${avg(function (r) { return r.jokersBought; }).toFixed(1)} 个`);
  console.log(`    买香火       ${avg(function (r) { return r.consBought; }).toFixed(1)} 个`);
  console.log(`    本局收入     ${avg(function (r) { return r.moneyEarned; }).toFixed(1)} 铜钱`);
  console.log(`    终局乘番型   ${avg(function (r) {
    return r.jokers.filter(function (nm) {
      const j = C.JOKERS.filter(function (x) { return x.name === nm; })[0];
      return j && j.mult;
    }).length;
  }).toFixed(2)} 个`);
}

/* ---------------------------------------------------------- 入口 */

function runBatch(diffId, count) {
  const runs = [];
  for (let i = 0; i < count; i++) runs.push(playRun(diffId));
  return runs;
}

function main() {
  const args = process.argv.slice(2);
  const n = parseInt(args[0], 10) || 300;
  let jobs = 1, worker = false;
  args.slice(1).forEach(function (a) {
    const kv = a.split('=');
    if (kv[0] === 'blind') G.setForceBlind(kv[1]);
    if (kv[0] === 'cons') onlyCons = kv[1];
    if (kv[0] === 'jobs') jobs = Math.max(1, parseInt(kv[1], 10) || 1);
    if (kv[0] === 'seed') seed = parseInt(kv[1], 10);
    if (kv[0] === 'econ') {
      const parts = kv[1].split(':').map(function (x) { return parseFloat(x); });
      if (parts.length === 4 && parts.every(function (x) { return isFinite(x); })) {
        G.setEconomy({ base: parts[0], perPlay: parts[1], interestDiv: parts[2], interestCap: parts[3] });
      }
    }
    if (kv[0] === 'worker') worker = true;
  });
  if (seed !== null && isFinite(seed)) Math.random = mulberry32(seed);
  const only = (args[1] && args[1].indexOf('=') < 0) ? args[1] : null;
  const diffs = only ? C.DIFFICULTIES.filter(function (d) { return d.id === only; }) : C.DIFFICULTIES;

  // 子进程模式：只跑数据，用 JSON 输出
  if (worker) { process.stdout.write(JSON.stringify(runBatch(diffs[0].id, n))); return; }

  const t0 = Date.now();

  // 多进程：各局完全独立，按难度拆成 jobs 份并行
  if (jobs > 1) {
    const cp = require('child_process');
    const buckets = {};
    diffs.forEach(function (d) { buckets[d.id] = []; });
    let pending = 0;
    const passthrough = args.slice(1).filter(function (a) {
      return a.indexOf('worker') !== 0 && a.indexOf('jobs') !== 0;
    });

    function finish() {
      diffs.forEach(function (d) { summarize(buckets[d.id], d.name); });
      console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒（${jobs} 进程并行）`);
    }

    diffs.forEach(function (d) {
      const per = Math.ceil(n / jobs);
      for (let j = 0; j < jobs; j++) {
        const cnt = Math.min(per, n - j * per);
        if (cnt <= 0) continue;
        pending++;
        const child = cp.fork(__filename, [String(cnt), d.id].concat(
          passthrough,
          seed !== null ? ['seed=' + (seed + j + 1)] : [],
          ['worker=1']
        ), { silent: true });
        let buf = '';
        child.stdout.on('data', function (c) { buf += c; });
        child.on('close', function () {
          try { buckets[d.id] = buckets[d.id].concat(JSON.parse(buf)); } catch (e) { console.error('worker 输出解析失败:', e.message); }
          if (--pending === 0) finish();
        });
      }
    });
    return;
  }

  diffs.forEach(function (d) {
    const runs = [];
    for (let i = 0; i < n; i++) {
      if (i % 50 === 0 && i > 0) process.stdout.write(`  ${d.name} ${i}/${n}\r`);
      runs.push(playRun(d.id));
    }
    summarize(runs, d.name);
  });

  console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

if (require.main === module) main();
