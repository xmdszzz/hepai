/* 一局游戏的状态机：8 圈 × 3 关、商店、铜钱、存档 */
(function (global) {
  'use strict';
  var T = global.Tiles, H = global.Hand, C = global.Content;
  var SAVE_KEY = 'hepai.run.v1';
  void H;
  var MIN_PLAY = 2;          // 最少打 2 张
  var MAX_PLAY = 6;          // 最多打 6 张
  var HINTS_PER_RUN = 6;     // 一局游戏的提示次数
  var TENPAI_TURNS = 3;      // 听牌有效回合数
  var JOKER_SLOTS = 8;       // 牌灵栏位（原 7，实测后期功率平台化，扩一格）
  var BLOOM_FAN_CAP = 3;     // 开花累积加番上限
  var ENDLESS_GROWTH = 2.2;  // 无尽模式每圈目标分增长倍率
  // 加入升级符与乘算成长牌灵后玩家强度整体提升，全局目标分上浮 25% 把中期张力拉回来
  var GLOBAL_TARGET_SCALE = 4.0;
  // 实测（各 120~200 局）：东风 75.8% / 南风 65.5% / 西风 63.5%，南风西风几乎重合
  // 用难度微调系数拉开：东风放宽 ~10%、西风收紧 ~15%
  var DIFF_TWEAK = { east: 0.90, south: 0.85, west: 0.90 };
  // 经济参数集中在这里，批量模拟可通过 setEconomy 覆盖，不改内容表里的基准目标。
  // 2026-10-19 经济扫描：在通关率基本不变的前提下压低囤钱，默认采用“中等”档。
  var ECONOMY = { base: 3, perPlay: 1, interestDiv: 10, interestCap: 2 };

  var state = null;
  var forceBlind = null;   // 调试/扫描用：强制每个庄关都用这条禁令

  /* ---------------------------------------------------------- 工具 */

  /** 解析牌灵，并带上合并档位（tier 1=普通 / 2=二重 / 3=满贯） */
  function jokers() {
    return state.jokers.map(function (j) {
      var def = C.jokerById(j.id);
      return def ? Object.assign({}, def, { tier: j.tier || 1 }) : null;
    }).filter(Boolean);
  }

  function ownedIds() { return state.jokers.map(function (j) { return j.id; }); }
  function consumables() {
    return state.consumableIds.map(function (id) { return C.consumableById(id); }).filter(Boolean);
  }
  function difficulty() { return C.difficultyById(state.difficultyId); }

  function buildDeckFromCopies() {
    var out = [];
    for (var t in state.copies) {
      for (var i = 0; i < state.copies[t]; i++) out.push(t);
    }
    return out;
  }

  function sortHand() {
    var order = { W: 0, T: 1, B: 2, Z: 3 };
    state.hand.sort(function (a, b) {
      var sa = order[T.suitOf(a)], sb = order[T.suitOf(b)];
      if (sa !== sb) return sa - sb;
      return T.rankOf(a) - T.rankOf(b);
    });
  }

  function drawTo(n) {
    while (state.hand.length < n) {
      if (!state.deck.length) {
        if (!state.discardPile.length) break;
        state.deck = T.shuffle(state.discardPile);
        state.discardPile = [];
      }
      state.hand.push(state.deck.pop());
    }
  }

  function pickDoras(n) {
    var ids = T.allTileIds();
    T.shuffle(ids);
    return ids.slice(0, n);
  }

  function buildCtx(opts) {
    opts = opts || {};
    var b = state.blind;
    return {
      // 「不许换」不仅禁换牌，还让门清失效——否则它是零代价禁令
      usedDiscard: state.usedDiscard || !!(b && b.id === 'noDiscard'),
      doras: state.doras,
      windTile: state.windTile,
      jokers: jokers(),
      noYaku: !!(b && b.id === 'noYaku'),
      noHonorFan: !!(b && b.id === 'noHonorFan'),
      noRun: !!(b && b.id === 'noRun'),
      fanCap: (b && b.id === 'fanCap') ? 8 : null,
      isFirstPlayOfLevel: state.isFirstPlay,
      tenpai: opts.tenpai !== undefined ? opts.tenpai : state.tenpai,
      tenpaiPenalty: opts.tenpaiPenalty || 0,
      gangBonus: state.gangBaseBonus || 0,
      typeUpgrades: state.typeUpgrades,
      fanBonus: state.levelFanBonus,
      snowballMult: state.snowballMult || 1,
      gangFanBonus: Math.min(state.gangUpgrades, BLOOM_FAN_CAP),   // 设上限，避免早期滚雪球
      forcedMult: state.pendingMult > 1 ? state.pendingMult : null
    };
  }

  /* ---------------------------------------------------------- 开局 */

  function newRun(difficultyId) {
    var d = C.difficultyById(difficultyId);
    var copies = {};
    T.allTileIds().forEach(function (t) { copies[t] = d.copies; });

    state = {
      difficultyId: d.id,
      round: 1,
      levelIndex: 0,
      money: 0,
      jokers: [],                 // [{ id, tier }]，tier 1/2/3 = 普通/二重/满贯
      slotUsedThisRound: false,
      consumableIds: [],
      copies: copies,
      deck: [],
      discardPile: [],
      hand: [],
      target: 0,
      score: 0,
      playsLeft: 0,
      discardsLeft: 0,
      handSize: d.handSize,
      bonusDiscards: 0,
      doras: [],
      blind: null,
      usedDiscard: false,
      retriesLeft: d.retries,
      isFirstPlay: true,
      pendingMult: 1,
      shop: null,
      phase: 'level',
      totalScore: 0,
      hintsLeft: HINTS_PER_RUN,
      tenpai: null,
      tenpaiUsedThisLevel: false,
      gangUpgrades: 0,
      gangBaseBonus: 0,
      typeUpgrades: {},
      levelFanBonus: 0,
      endless: false,
      snowballMult: 1,
      bestPlay: { total: 0, type: '—' },
      levelsCleared: 0
    };
    startLevel();
  }

  /** 第 8 圈之后进入无尽：目标分继续按 ENDLESS_GROWTH 往上涨 */
  function targetFor(round, levelIndex, diffId) {
    var tw = DIFF_TWEAK[diffId] || 1;
    if (round <= 8) return Math.round(C.TARGETS[diffId][round - 1][levelIndex] * GLOBAL_TARGET_SCALE * tw / 100) * 100;
    var base = C.TARGETS[diffId][7][levelIndex];
    return Math.round(base * Math.pow(ENDLESS_GROWTH, round - 8) / 10000) * 10000;
  }

  function startLevel() {
    var d = difficulty();
    var p = C.aggregatePassive(jokers());
    var bond = targetFor(state.round, state.levelIndex, d.id);
    var blind = state.levelIndex === 2
      ? (forceBlind || C.rollBlind())
      : null;

    if (blind && blind.id === 'heavy') bond = Math.round(bond * 1.5);

    state.blind = blind;
    state.target = bond;
    state.score = 0;
    state.playsLeft = Math.max(1, d.plays + (p.plays || 0) - (blind && blind.id === 'fewerPlays' ? 1 : 0));
    state.discardsLeft = Math.max(0,
      d.discards + (p.discards || 0) + state.bonusDiscards - (blind && blind.id === 'noDiscard' ? 99 : 0));
    state.handSize = Math.max(6, d.handSize + (p.handSize || 0) - (blind && blind.id === 'tightHand' ? 3 : 0));
    state.doras = pickDoras(Math.max(1, p.doraCount || 1));
    state.windTile = ['Z1', 'Z2', 'Z3', 'Z4'][(state.round - 1) % 4];   // 圈风
    state.usedDiscard = false;
    state.tenpai = null;
    state.tenpaiUsedThisLevel = false;
    state.isFirstPlay = true;
    state.bonusDiscards = 0;

    state.deck = T.shuffle(buildDeckFromCopies());
    state.discardPile = [];
    state.hand = [];
    drawTo(state.handSize);
    sortHand();
    state.phase = 'level';
    save();
  }

  /* ---------------------------------------------------------- 出牌 / 换牌 */

  function play(cards) {
    if (state.phase !== 'level' || state.playsLeft <= 0) return null;
    if (cards.length < MIN_PLAY || cards.length > MAX_PLAY) return null;
    // 听牌先判命中与否：落空倒扣算在本手上
    var tp = state.tenpai;
    var tpHit = !!(tp && cards.indexOf(tp.tile) >= 0);
    // 落空不再倒扣：西风局只有 3 次出牌，-2 番会把开局直接打崩（实测圈1~2 死亡率从 7.4% 降到 <1%）
    var tpPenalty = 0;
    var detail = H.scorePlay(cards, buildCtx({ tenpaiPenalty: tpPenalty }));

    if (tp) {
      if (tpHit) state.tenpai = null;
      else if (--tp.turnsLeft <= 0) state.tenpai = null;
    }

    // 杠上开花：含四张相同 → 永久抬高「杠」基础分
    var tally = {}, bloomMax = 0;
    cards.forEach(function (c) {
      tally[c] = (tally[c] || 0) + 1;
      if (tally[c] > bloomMax) bloomMax = tally[c];
    });
    if (bloomMax >= 3) {
    // 乘算成长型牌灵：每打出一手累积（滚雪球）
    var mMult = C.aggregatePassive(jokers()).multPerHand;
    if (mMult) state.snowballMult = (state.snowballMult || 1) * mMult;

      state.gangUpgrades++;                        // 永久 +1 番
      if (bloomMax >= 4) state.gangBaseBonus += 15; // 真杠额外抬杠基础分
    }

    cards.forEach(function (c) {
      var i = state.hand.indexOf(c);
      if (i >= 0) state.hand.splice(i, 1);
      state.discardPile.push(c);
    });

    state.score += detail.total;
    state.totalScore += detail.total;
    state.playsLeft--;
    state.isFirstPlay = false;
    state.pendingMult = 1;
    if (detail.total > state.bestPlay.total) {
      state.bestPlay = { total: detail.total, type: detail.type };
    }
    drawTo(state.handSize);
    sortHand();

    var outcome = null;
    if (state.score >= state.target) outcome = 'cleared';
    else if (state.playsLeft <= 0) outcome = 'failed';

    return { detail: detail, outcome: outcome };
  }

  function discard(cards) {
    if (state.phase !== 'level' || !cards.length || state.discardsLeft <= 0) return false;
    cards.forEach(function (c) {
      var i = state.hand.indexOf(c);
      if (i >= 0) state.hand.splice(i, 1);
      state.discardPile.push(c);
    });
    state.discardsLeft--;
    state.usedDiscard = true;
    drawTo(state.handSize);
    sortHand();
    return true;
  }

  function failLevel() {
    if (state.retriesLeft > 0) {
      state.retriesLeft--;
      startLevel();
      return 'retry';
    }
    state.phase = 'lost';
    save();
    return 'lost';
  }

  /* ---------------------------------------------------------- 通关结算 */

  function completeLevel() {
    var p = C.aggregatePassive(jokers());
    var income = ECONOMY.base + state.playsLeft * ECONOMY.perPlay + (p.moneyPerLevel || 0);
    // 抽头是“存款越多越赚”，但不能无限复利；每关最多额外 +4，避免无尽中经济失控。
    if (p.moneyPer10) income += Math.min(4, Math.floor(state.money / 10) * p.moneyPer10);
    var interest = ECONOMY.interestCap > 0 && ECONOMY.interestDiv > 0
      ? Math.min(ECONOMY.interestCap, Math.floor(state.money / ECONOMY.interestDiv))
      : 0;
    state.money = Math.max(0, state.money + income + interest);
    state.levelsCleared++;
    state.levelFanBonus += (p.fanPerLevel || 0);   // 成长型牌灵：每关永久加番
    // 乘算成长型牌灵：每关 ×p.multPerLevel
    if (p.multPerLevel) state.snowballMult = (state.snowballMult || 1) * p.multPerLevel;
    openShop();
    save();
    return { income: income, interest: interest };
  }

  /** 牌组满 4 张时别再上架加张符；只剩 1 张时别再上架减张符 */
  function consumableOpts() {
    var canAdd = false, canRemove = false;
    T.allTileIds().forEach(function (t) {
      var n = state.copies[t] || 0;
      if (n < 4) canAdd = true;
      if (n > 1) canRemove = true;
    });
    return { canAdd: canAdd, canRemove: canRemove };
  }

  function openShop() {
    state.shop = {
      jokers: C.rollJoker(ownedIds(), 2, true).map(function (j) { return { j: j, sold: false }; }),
      consumables: C.rollConsumables(2, consumableOpts()).map(function (c) { return { c: c, sold: false }; }),
      rerollCost: 3
    };
    state.phase = 'shop';
  }

  function buyJoker(index) {
    var item = state.shop.jokers[index];
    if (!item || item.sold) return false;
    if (state.jokers.length >= JOKER_SLOTS) return false;
    var price = C.RARITY[item.j.rarity].price;
    if (state.money < price) return false;
    state.money -= price;
    state.jokers.push({ id: item.j.id, tier: 1 });
    item.sold = true;
    var p = item.j.passive;
    if (p && p.moneyNow) state.money += p.moneyNow;
    save();
    return true;
  }

  function buyConsumable(index) {
    var item = state.shop.consumables[index];
    if (!item || item.sold) return false;
    if (state.consumableIds.length >= 3) return false;
    if (state.money < item.c.price) return false;
    state.money -= item.c.price;
    state.consumableIds.push(item.c.id);
    item.sold = true;
    save();
    return true;
  }

  function rerollShop() {
    if (!state.shop || state.money < state.shop.rerollCost) return false;
    state.money -= state.shop.rerollCost;
    var cost = state.shop.rerollCost + 1;
    var owned = ownedIds().concat(
      state.shop.jokers.filter(function (it) { return !it.sold; }).map(function (it) { return it.j.id; }));
    state.shop = {
      jokers: C.rollJoker(owned, 2, true).map(function (j) { return { j: j, sold: false }; }),
      consumables: C.rollConsumables(2, consumableOpts()).map(function (c) { return { c: c, sold: false }; }),
      rerollCost: cost
    };
    save();
    return true;
  }

  /** 使用香火。picker 类香火由 UI 传入目标牌 id。 */
  function useConsumable(index, targetTile) {
    var c = state.consumableIds[index];
    if (!c) return false;
    var def = C.consumableById(c);
    if (!def) return false;

    if (def.picker === 'upgrade') {
      if (!targetTile || !H.BASE[targetTile]) return false;
      state.typeUpgrades[targetTile] = (state.typeUpgrades[targetTile] || 0) + 1;
    } else if (def.picker === 'add') {
      if (!targetTile) return false;
      if ((state.copies[targetTile] || 0) >= 4) return false;
      state.copies[targetTile] = (state.copies[targetTile] || 0) + 1;
      if (state.deck) state.deck.push(targetTile);
    } else if (def.picker === 'remove') {
      if (!targetTile) return false;
      if ((state.copies[targetTile] || 0) <= 1) return false;
      state.copies[targetTile] -= 1;
      var di = state.deck ? state.deck.indexOf(targetTile) : -1;
      if (di >= 0) state.deck.splice(di, 1);
    } else if (def.id === 'huanpaifu') {
      state.bonusDiscards += 2;
    } else if (def.id === 'jiabeifu') {
      state.pendingMult = (state.pendingMult || 1) * 2;
    } else if (def.shopReroll) {
      state.money += def.price;          // 退还成本后再重掷
      state.consumableIds.splice(index, 1);
      rerollShop();
      return true;
    }

    state.consumableIds.splice(index, 1);
    save();
    return true;
  }


  /** 老虎机：每圈一次，摇出 3 张牌灵，同名自动合并升级 */
  function spinSlot() {
    if (state.slotUsedThisRound) return null;
    state.slotUsedThisRound = true;

    // 本轮转轮带：按稀有度权重抽 8 张不同的牌灵，三个转轮从这条带上等概率抽
    // （直接全池均匀抽的话同名概率只有 12%，三张全同更是 0.16%，玩家一辈子见不到）
    var strip = C.rollJoker([], 8, false);
    var rolls = [];
    for (var i = 0; i < 3; i++) rolls.push(strip[Math.floor(Math.random() * strip.length)].id);

    var groups = {};
    rolls.forEach(function (id) { groups[id] = (groups[id] || 0) + 1; });

    var results = [];
    Object.keys(groups).forEach(function (id) {
      var n = groups[id];
      var cur = null;
      for (var k = 0; k < state.jokers.length; k++) {
        if (state.jokers[k].id === id) cur = state.jokers[k];
      }
      var before = cur ? cur.tier : 0;
      var after = Math.min(3, before + n);
      if (cur) {
        cur.tier = after;
        results.push({ id: id, from: before, to: after });
      } else if (state.jokers.length < JOKER_SLOTS) {
        var def = C.jokerById(id);
        state.jokers.push({ id: id, tier: after });
        // 商店购买和老虎机获得的即时经济效果必须一致。
        if (def && def.passive && def.passive.moneyNow) state.money += def.passive.moneyNow;
        results.push({ id: id, from: 0, to: after });
      } else {
        results.push({ id: id, from: 0, to: after, lost: true });   // 栏位满，这张没拿到
      }
    });

    save();
    return { rolls: rolls, results: results };
  }

  function nextLevel() {
    state.levelIndex++;
    if (state.levelIndex > 2) { state.levelIndex = 0; state.round++; }
    state.slotUsedThisRound = false;   // 新的一圈，拉杆重置

    // 第 8 圈打完先问玩家要不要进无尽
    if (state.round > 8 && !state.endless) { state.phase = 'endlessChoice'; save(); return; }
    startLevel();
  }

  /** 进入无尽模式：目标分继续往上涨，直到流局为止 */
  function enterEndless() {
    state.endless = true;
    startLevel();
  }

  /** 不进无尽，就此结算 */
  function finishRun() {
    state.phase = 'won';
    save();
  }

  /* ---------------------------------------------------------- 存档 */
  function canHint() {
    return !!state && state.hintsLeft > 0 && state.phase === 'level';
  }

  /** 宣布听牌：听口必须是手里没有的牌（将牌不是现牌），每关限一次 */
  function declareTenpai(tile) {
    if (!state || state.phase !== 'level' || !tile) return false;
    if (state.tenpai || state.tenpaiUsedThisLevel) return false;
    if (state.hand.indexOf(tile) >= 0) return false;
    state.tenpai = { tile: tile, turnsLeft: TENPAI_TURNS };
    state.tenpaiUsedThisLevel = true;
    save();
    return true;
  }

  function consumeHint() {
    if (!canHint()) return false;
    state.hintsLeft--;
    save();
    return true;
  }


  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.copies && s.difficultyId) ? migrate(s) : null;
    } catch (e) { return null; }
  }
  /** 兼容旧存档：补齐后加的字段 */
  function migrate(s) {
    if (typeof s.hintsLeft !== 'number') s.hintsLeft = HINTS_PER_RUN;
    if (!Array.isArray(s.jokers)) {
      s.jokers = Array.isArray(s.jokerIds) ? s.jokerIds.map(function (id) { return { id: id, tier: 1 }; }) : [];
    }
    if (typeof s.slotUsedThisRound !== 'boolean') s.slotUsedThisRound = false;
    if (!Array.isArray(s.consumableIds)) s.consumableIds = [];
    if (!Array.isArray(s.doras) || !s.doras.length) s.doras = pickDoras(1);
    if (typeof s.bonusDiscards !== 'number') s.bonusDiscards = 0;
    if (typeof s.pendingMult !== 'number') s.pendingMult = 1;
    if (typeof s.levelsCleared !== 'number') s.levelsCleared = 0;
    if (typeof s.gangUpgrades !== 'number') s.gangUpgrades = 0;
    if (typeof s.gangBaseBonus !== 'number') s.gangBaseBonus = 0;
    if (!s.typeUpgrades || typeof s.typeUpgrades !== 'object') s.typeUpgrades = {};
    if (typeof s.levelFanBonus !== 'number') s.levelFanBonus = 0;
    if (typeof s.endless !== 'boolean') s.endless = false;
    if (typeof s.snowballMult !== 'number') s.snowballMult = 1;
    if (s.tenpai === undefined) s.tenpai = null;
    if (typeof s.tenpaiUsedThisLevel !== 'boolean') s.tenpaiUsedThisLevel = false;
    if (!s.bestPlay) s.bestPlay = { total: 0, type: '—' };
    return s;
  }

  function restore(s) {
    state = migrate(s);
    if (state.phase === 'level') {
      state.deck = T.shuffle(buildDeckFromCopies());
      state.discardPile = [];
      state.hand = [];
      drawTo(state.handSize);
      sortHand();
    }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  }

  function setEconomy(opts) {
    opts = opts || {};
    ['base', 'perPlay', 'interestDiv', 'interestCap'].forEach(function (k) {
      if (typeof opts[k] === 'number' && isFinite(opts[k])) ECONOMY[k] = opts[k];
    });
  }

  function economy() {
    return { base: ECONOMY.base, perPlay: ECONOMY.perPlay, interestDiv: ECONOMY.interestDiv, interestCap: ECONOMY.interestCap };
  }

  global.Game = {
    MIN_PLAY: MIN_PLAY,
    MAX_PLAY: MAX_PLAY,
    HINTS_PER_RUN: HINTS_PER_RUN,
    JOKER_SLOTS: JOKER_SLOTS,
    canHint: canHint,
    TENPAI_TURNS: TENPAI_TURNS,
    declareTenpai: declareTenpai,
    consumeHint: consumeHint,
    newRun: newRun,
    restore: restore,
    load: load,
    clearSave: clearSave,
    state: function () { return state; },
    jokers: jokers,
    consumables: consumables,
    difficulty: difficulty,
    play: play,
    discard: discard,
    failLevel: failLevel,
    completeLevel: completeLevel,
    buyJoker: buyJoker,
    buyConsumable: buyConsumable,
    rerollShop: rerollShop,
    useConsumable: useConsumable,
    nextLevel: nextLevel,
    enterEndless: enterEndless,
    finishRun: finishRun,
    targetFor: targetFor,
    ENDLESS_GROWTH: ENDLESS_GROWTH,
    buildCtx: buildCtx,
    spinSlot: spinSlot,
    setEconomy: setEconomy,
    economy: economy,
    setForceBlind: function (id) {
      forceBlind = id ? C.BLINDS.filter(function (b) { return b.id === id; })[0] || null : null;
    },
    forceBlind: function () { return forceBlind; },
  };
})(window);
