/* 内容表：难度 / 目标分 / 牌灵 / 香火 / 禁令 */
(function (global) {
  'use strict';
  var T = global.Tiles;

  var RARITY = {
    '白': { weight: 60, price: 3, cls: 'r-white' },
    '青': { weight: 25, price: 5, cls: 'r-blue' },
    '金': { weight: 12, price: 8, cls: 'r-gold' },
    '赤': { weight: 3, price: 12, cls: 'r-red' }
  };

  /* ---------------------------------------------------------- 牌灵 */

  // 热路径：不用 filter（每次分配一个数组），改成计数循环
  function countOf(cards, fn) {
    var n = 0;
    for (var i = 0; i < cards.length; i++) if (fn(cards[i])) n++;
    return n;
  }
  var _ds = [];   // 复用数组：返回的数组只用完即弃，调用方不得持有
  function distinctSuits(cards) {
    var w = 0, t = 0, b = 0, z = 0;
    for (var i = 0; i < cards.length; i++) {
      var s = T.suitOf(cards[i]);
      if (s === 'W') w = 1; else if (s === 'T') t = 1; else if (s === 'B') b = 1; else z = 1;
    }
    _ds.length = 0;
    if (w) _ds.push('W'); if (t) _ds.push('T'); if (b) _ds.push('B'); if (z) _ds.push('Z');
    return _ds;
  }
  function maxGroup(cards) {
    var cnt = {}; cards.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; });
    var m = 0; for (var k in cnt) if (cnt[k] > m) m = cnt[k];
    return m;
  }

  var JOKERS = [
    /* --- 加点数分 --- */
    { id: 'laoqian', name: '老千', rarity: '白', desc: '每次和牌 +20 点数分',
      fx: function () { return { points: 20 }; } },
    { id: 'cuomashou', name: '搓麻手', rarity: '白', desc: '打出的每张字牌 +5 点数分',
      fx: function (c) { var n = countOf(c.cards, function (x) { return T.suitOf(x) === 'Z'; }); return n ? { points: n * 5 } : null; } },
    { id: 'gangjing', name: '杠精', rarity: '青', desc: '和牌时每含一副杠 +50 点数分',
      fx: function (c) { return maxGroup(c.cards) >= 4 ? { points: 50 } : null; } },
    { id: 'manhan', name: '满汉全席', rarity: '金', desc: '每多一种花色 +35 点数分',
      fx: function (c) { var n = distinctSuits(c.cards).length; return n > 1 ? { points: (n - 1) * 35 } : null; } },

    /* --- 加番 --- */
    { id: 'lizhi', name: '立直', rarity: '青', desc: '本关未换牌时 +6 番',
      fx: function (c) { return c.usedDiscard ? null : { fan: 6 }; } },
    { id: 'sanyuanchi', name: '三元痴', rarity: '青', desc: '打出中/发/白每张 +4 番',
      fx: function (c) { var n = countOf(c.cards, function (x) { return T.YAKUHAI[x]; }); return n ? { fan: n * 4 } : null; } },
    { id: 'menqingzushi', name: '门清祖师', rarity: '金', desc: '门清加成从 +3 提升到 +10 番' },
    { id: 'duanyaojiu', name: '断幺九', rarity: '青', desc: '断幺加成从 +1 提升到 +5 番',
      fx: function (c) {
        var hasHonor = c.cards.some(function (x) { return T.suitOf(x) === 'Z'; });
        var has19 = c.cards.some(function (x) { var r = T.rankOf(x); return r === 1 || r === 9; });
        return (!hasHonor && !has19) ? { fan: 4 } : null;
      } },

    /* --- 乘番 --- */
    { id: 'qingyise', name: '清一色', rarity: '白', mult: true, desc: '打出 6 张同花色时番数 ×2.5',
      fx: function (c) { var s = distinctSuits(c.cards); return (s.length === 1 && s[0] !== 'Z') ? { mult: 2.5 } : null; } },
    { id: 'jingoudiao', name: '金钩钓', rarity: '白', mult: true, desc: '每次和牌番数 ×2',
      fx: function () { return { mult: 2 }; } },
    { id: 'dahongzhong', name: '大红中', rarity: '青', mult: true, desc: '每张红中让番数 ×1.5',
      fx: function (c) { var n = countOf(c.cards, function (x) { return x === 'Z5'; }); return n ? { mult: Math.pow(1.5, n) } : null; } },
    { id: 'dasixi', name: '大四喜', rarity: '青', mult: true, desc: '打出 4 张以上字牌时番数 ×2.5',
      fx: function (c) { return countOf(c.cards, function (x) { return T.suitOf(x) === 'Z'; }) >= 4 ? { mult: 2.5 } : null; } },
    { id: 'gangshangkaihua', name: '杠上开花', rarity: '青', mult: true, desc: '打出 4 张以上时番数 ×2.5',
      fx: function (c) { return c.cards.length >= 4 ? { mult: 2.5 } : null; } },
    { id: 'pengpenghu', name: '碰碰胡', rarity: '青', mult: true, desc: '牌型为刻子类时番数 ×2.5',
      fx: function (c) {
        var ok = ['刻子', '碰将', '杠', '杠带将', '连刻', '三碰'];
        return ok.indexOf(c.type) >= 0 ? { mult: 2.5 } : null;
      } },
    { id: 'duDiao', name: '独钓寒江', rarity: '青', mult: true, desc: '散牌番数 ×8，且额外 +180 点数分',
      fx: function (c) { return c.type === '散牌' ? { mult: 8, points: 180 } : null; } },
    { id: 'haidilaoyue', name: '海底捞月', rarity: '金', mult: true, desc: '一次打满 6 张时番数 ×3',
      fx: function (c) { return c.cards.length === 6 ? { mult: 3 } : null; } },
    { id: 'tianhe', name: '天和', rarity: '赤', mult: true, desc: '每关第一次和牌番数 ×4',
      fx: function (c) { return c.isFirstPlayOfLevel ? { mult: 4 } : null; } },
    { id: 'xuezhandaodi', name: '血战到底', rarity: '赤', mult: true, desc: '出牌次数 −1，但每次和牌番数 ×3',
      passive: { plays: -1 }, fx: function () { return { mult: 3 }; } },
    { id: 'jiulian', name: '九莲宝灯', rarity: '赤', mult: true, desc: '番数 ×3，但换牌次数归零',
      passive: { discards: -99 }, fx: function () { return { mult: 3 }; } },

    /* --- 经济 --- */
    { id: 'jinsuanpan', name: '金算盘', rarity: '白', desc: '每关结算 +2 铜钱',
      passive: { moneyPerLevel: 2 } },
    { id: 'lianzhuang', name: '连庄', rarity: '金', mult: true, desc: '每通过一关，番数倍率永久 ×1.10（无尽引擎）',
      passive: { multPerLevel: 1.10 } },
    { id: 'gunxueqiu', name: '滚雪球', rarity: '赤', mult: true, desc: '每打出一手，番数倍率永久 ×1.07（无尽引擎）',
      passive: { multPerHand: 1.07 } },
    { id: 'choutou', name: '抽头', rarity: '青', desc: '每关结算 +1 铜钱，每 10 铜钱再 +1',
      passive: { moneyPerLevel: 1, moneyPer10: 1 } },
    { id: 'gaolidai', name: '高利贷', rarity: '金', desc: '立即 +20 铜钱，之后每关 −3',
      passive: { moneyNow: 20, moneyPerLevel: -3 } },

    /* --- 规则改写 --- */
    { id: 'tiandiren', name: '天地人', rarity: '金', desc: '手牌上限 +3', passive: { handSize: 3 } },
    { id: 'xipaishi', name: '洗牌师', rarity: '青', desc: '每关换牌次数 +2', passive: { discards: 2 } },
    { id: 'baoxiang', name: '宝箱', rarity: '青', desc: '每关出现 2 张宝牌', passive: { doraCount: 2 } }
  ];

  /* ---------------------------------------------------------- 香火 */

  var CONSUMABLES = [
    { id: 'huanpaifu', name: '换牌符', price: 3, desc: '本关换牌次数 +2',
      apply: function (g) { g.discardsLeft += 2; } },
    { id: 'jiabeifu', name: '加倍符', price: 4, desc: '下一次和牌番数 ×2',
      apply: function (g) { g.pendingMult = (g.pendingMult || 1) * 2; } },
    { id: 'jiazhangfu', name: '加张符', price: 5, desc: '指定一种牌永久 +1 副本（上限 4）', picker: 'add' },
    { id: 'shengjifu', name: '升级符', price: 5, desc: '指定一个牌型，永久 +1 番、+40 基础分（可叠加）', picker: 'upgrade' },
    { id: 'jianzhangfu', name: '减张符', price: 3, desc: '从牌组永久移除一种牌的 1 张副本', picker: 'remove' },
    { id: 'xipaifu', name: '洗牌符', price: 2, desc: '立即重掷商店内容', shopReroll: true }
  ];

  /* ---------------------------------------------------------- 庄关禁令 */

  // weight 越大越常出现。按“对策略的破坏程度”分级，而不是按单次实测——
  // 因为 n=40 的扫描置信区间 ±12，根本区分不出相邻两档。
  var BLINDS = [
    { id: 'noHonorFan', name: '字牌无番', desc: '字牌不产生任何番数', weight: 12 },
    { id: 'noRun', name: '顺子无效', desc: '顺子类牌型一律按散牌计算', weight: 12 },
    { id: 'tightHand', name: '手牌拘束', desc: '手牌上限 −3', weight: 4 },
    { id: 'heavy', name: '重压', desc: '目标分 ×1.5', weight: 5 },
    { id: 'fewerPlays', name: '少打一圈', desc: '出牌次数 −1', weight: 8 },
    { id: 'fanCap', name: '封顶', desc: '单次和牌番数上限 8 番', weight: 4 },
    { id: 'noDiscard', name: '不许换', desc: '换牌次数归零，且门清失效', weight: 8 },
    { id: 'noYaku', name: '无役', desc: '役牌不再提供番数', weight: 10 }
  ];

  /** 按权重抽一条庄关禁令 */
  function rollBlind() {
    var total = 0;
    for (var i = 0; i < BLINDS.length; i++) total += BLINDS[i].weight || 1;
    var roll = Math.random() * total;
    for (var j = 0; j < BLINDS.length; j++) {
      roll -= BLINDS[j].weight || 1;
      if (roll <= 0) return BLINDS[j];
    }
    return BLINDS[BLINDS.length - 1];
  }

  /* ---------------------------------------------------------- 难度与目标分 */

  var DIFFICULTIES = [
    { id: 'east', name: '东风局', tag: '休闲', copies: 4, plays: 5, discards: 4, handSize: 13, retries: 3,
      desc: '每种 4 张，一副完整麻将，最宽松' },
    { id: 'south', name: '南风局', tag: '标准', copies: 3, plays: 4, discards: 3, handSize: 13, retries: 0,
      desc: '每种 3 张，标准体验' },
    { id: 'west', name: '西风局', tag: '硬核', copies: 2, plays: 3, discards: 2, handSize: 13, retries: 0,
      desc: '每种 2 张，刻子流关闭' }
  ];

  // 目标分 = 白板上限 × 倍率，起步 0.35；第 1~5 圈 ×2.5，第 6~8 圈 ×2.2（实测后期偏陡）
  // 白板上限：东风 4,592 / 南风 3,437 / 西风 2,240
  var TARGETS = {
    east: [
      [1600, 2200, 3000], [4000, 5500, 7400], [10000, 13500, 18500], [25000, 34000, 46500],
      [63000, 85000, 115000], [155000, 205000, 265000], [345000, 450000, 585000],
      [760000, 990000, 1300000]
    ],
    south: [
      [850, 1200, 1600], [2400, 3300, 4400], [6400, 8500, 12000], [16000, 21500, 29500],
      [40000, 54500, 73500], [99500, 130000, 170000], [220000, 285000, 370000],
      // 前两圈额外放低：实测开局死亡（圈1）主要出在出牌次数只有 3~4 次的难度上
      [485000, 630000, 820000]
    ],
    west: [
      // 3 次出牌方差大，圈 1 再压低一档，避免最优机器人也有三成概率开局翻车
      [350, 550, 750], [1700, 2300, 3000], [5400, 7400, 9900], [13000, 18000, 25000],
      [33500, 45500, 62000], [84000, 110000, 145000], [185000, 240000, 315000],
      // 前两圈不上调系数，否则开局就翻车
      [410000, 530000, 690000]
    ]
  };

  var LEVEL_NAMES = ['小关', '中关', '庄关'];

  function jokerById(id) {
    for (var i = 0; i < JOKERS.length; i++) if (JOKERS[i].id === id) return JOKERS[i];
    return null;
  }
  function consumableById(id) {
    for (var i = 0; i < CONSUMABLES.length; i++) if (CONSUMABLES[i].id === id) return CONSUMABLES[i];
    return null;
  }
  function difficultyById(id) {
    for (var i = 0; i < DIFFICULTIES.length; i++) if (DIFFICULTIES[i].id === id) return DIFFICULTIES[i];
    return DIFFICULTIES[0];
  }

  /** 汇总所有牌灵的被动效果 */
  function aggregatePassive(jokers) {
    var p = { plays: 0, discards: 0, handSize: 0, doraCount: 1, moneyPerLevel: 0, moneyPer10: 0, moneyNow: 0 };
    jokers.forEach(function (j) {
      if (!j.passive) return;
      var tier = j.tier || 1;
      var scale = tier === 1 ? 1 : (tier === 2 ? 2 : 4);
      for (var k in j.passive) {
        var v = j.passive[k];
        // 负数（惩罚项）不放大；乘算成长型（滚雪球/连庄）也不吃档位加成——
        // 它们本来就是每手/每关累积的，再取次方会直接指数爆炸（实测能跑到 500 圈以上）
        var noScale = (k === 'multPerHand' || k === 'multPerLevel');
        p[k] = (p[k] || 0) + (v > 0 && !noScale ? v * scale : v);
      }
    });
    return p;
  }

  /** 按稀有度权重随机抽一个未持有的牌灵 */
  function weightedPick(pool) {
    var total = 0;
    pool.forEach(function (j) { total += RARITY[j.rarity].weight; });
    var roll = Math.random() * total, acc = 0;
    for (var i = 0; i < pool.length; i++) {
      acc += RARITY[pool[i].rarity].weight;
      if (roll <= acc) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /**
   * 抽牌灵。ensureMult=true 时保证至少上架一个乘番型——
   * 中后期必须靠乘番链才能过，随机不出乘番会直接导致玩家卡死。
   */
  function rollJoker(owned, count, ensureMult) {
    var have = owned.slice();
    var out = [];
    if (ensureMult) {
      var mults = JOKERS.filter(function (j) { return j.mult && have.indexOf(j.id) < 0; });
      if (mults.length) {
        var m = weightedPick(mults);
        out.push(m);
        have.push(m.id);
      }
    }
    var pool = JOKERS.filter(function (j) { return have.indexOf(j.id) < 0; });
    while (out.length < count && pool.length) {
      var pick = weightedPick(pool);
      out.push(pick);
      pool.splice(pool.indexOf(pick), 1);
      have.push(pick.id);
    }
    return out;
  }

  /**
   * 抽香火。opts.canAdd / opts.canRemove 为 false 时，把对应的香火从池子里剔除——
   * 否则东风局（每种已经 4 张）会一直上架用不了的加张符，看起来很儍。
   */
  function rollConsumables(count, opts) {
    opts = opts || {};
    var pool = CONSUMABLES.filter(function (c) {
      if (c.picker === 'add' && opts.canAdd === false) return false;
      if (c.picker === 'remove' && opts.canRemove === false) return false;
      return true;
    });
    T.shuffle(pool);
    return pool.slice(0, count);
  }

  global.Content = {
    RARITY: RARITY,
    JOKERS: JOKERS,
    CONSUMABLES: CONSUMABLES,
    BLINDS: BLINDS,
    DIFFICULTIES: DIFFICULTIES,
    TARGETS: TARGETS,
    LEVEL_NAMES: LEVEL_NAMES,
    jokerById: jokerById,
    consumableById: consumableById,
    difficultyById: difficultyById,
    aggregatePassive: aggregatePassive,
    rollJoker: rollJoker,
    rollConsumables: rollConsumables,
    rollBlind: rollBlind
    ,rollBlind: rollBlind
  };
})(window);
