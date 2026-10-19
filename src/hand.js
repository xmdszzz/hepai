/* 牌型判定与计分 */
(function (global) {
  'use strict';
  var T = global.Tiles;

  // 档位顺序 = 由强到弱 = 由稀有到常见
  var TYPES = ['连刻', '杠带将', '杠', '一条龙', '双顺', '碰将', '连对',
    '刻子', '三碰', '顺将', '双碰', '顺子', '对子', '散牌'];

  var BASE = {
    '连刻': { pts: 240, fan: 21 },
    '杠带将': { pts: 220, fan: 19 },
    '杠': { pts: 195, fan: 17 },
    '一条龙': { pts: 175, fan: 15 },
    '双顺': { pts: 150, fan: 13 },
    '碰将': { pts: 130, fan: 11 },
    '连对': { pts: 115, fan: 10 },
    '刻子': { pts: 100, fan: 9 },
    '三碰': { pts: 80, fan: 7 },
    '顺将': { pts: 65, fan: 6 },
    '双碰': { pts: 50, fan: 5 },
    '顺子': { pts: 35, fan: 4 },
    '对子': { pts: 20, fan: 3 },
    '散牌': { pts: 0, fan: 1 }
  };

  function tag(c) { return T.suitOf(c) + T.rankOf(c); }

  /** 判定恰好 6 张牌的牌型 */
  // ---- 热路径用的无分配暂存区（每次调用后清空） ----
  var _cnt = new Int32Array(40);
  var _sc = new Int32Array(4);
  var _uniq = new Int32Array(8);
  var _pid = new Int32Array(8);
  var _tid = new Int32Array(8);
  var _qid = new Int32Array(8);
  var _rest = new Int32Array(10);

  // 牌面是字符串 id（如 'W5'），一次性映射成 0~39 的整数下标供热路径使用
  var _SUIT_I = { W: 0, T: 1, B: 2, Z: 3 };
  var _idx = {};
  T.allTileIds().forEach(function (t) { _idx[t] = _SUIT_I[T.suitOf(t)] * 10 + T.rankOf(t); });

  // 牌面点数 / 役牌标记预计算到 0~39 的下标上，避免热路径里重复 parseInt / 切片
  var _pts = new Int8Array(40);
  var _yak = new Int8Array(40);
  T.allTileIds().forEach(function (t) {
    var i = _idx[t];
    _pts[i] = T.points(t);
    _yak[i] = T.YAKUHAI[t] ? 1 : 0;
  });

  /** 无分配牌型判定：类型化数组暂存 */
  function classify(cards) {
    var n = cards.length, i, j, c, k, s, b, r, s1, s2;
    for (i = 0; i < n; i++) { c = _idx[cards[i]]; _cnt[c]++; _sc[c / 10 | 0]++; }

    var u = 0;
    for (i = 0; i < n; i++) {
      c = _idx[cards[i]];
      var dup = false;
      for (j = 0; j < u; j++) if (_uniq[j] === c) { dup = true; break; }
      if (!dup) _uniq[u++] = c;
    }

    var np = 0, nt = 0, nq = 0;
    for (i = 0; i < u; i++) {
      c = _uniq[i]; k = _cnt[c];
      if (k >= 2) _pid[np++] = c;
      if (k >= 3) _tid[nt++] = c;
      if (k >= 4) _qid[nq++] = c;
    }

    var res = '散牌';

    for (s = 0; s < 3; s++) {
      b = s * 10;
      for (r = 1; r <= 8; r++) if (_cnt[b + r] >= 3 && _cnt[b + r + 1] >= 3) { res = '连刻'; break; }
      if (res !== '散牌') break;
    }

    if (res === '散牌' && nq) {
      for (j = 0; j < np; j++) if (_pid[j] !== _qid[0]) { res = '杠带将'; break; }
      if (res === '散牌') res = '杠';
    }

    if (res === '散牌') {
      for (s = 0; s < 3; s++) {
        if (_sc[s] < 6) continue;
        b = s * 10;
        for (r = 1; r <= 4; r++) {
          if (_cnt[b+r] && _cnt[b+r+1] && _cnt[b+r+2] && _cnt[b+r+3] && _cnt[b+r+4] && _cnt[b+r+5]) { res = '一条龙'; break; }
        }
        if (res !== '散牌') break;
      }
    }

    if (res === '散牌') {
      for (s = 0; s < 3 && res === '散牌'; s++) {
        if (_sc[s] < 6) continue;
        b = s * 10;
        for (s1 = 1; s1 <= 7 && res === '散牌'; s1++) {
          if (!_cnt[b+s1] || !_cnt[b+s1+1] || !_cnt[b+s1+2]) continue;
          for (r = 0; r < 10; r++) _rest[r] = 0;
          for (r = 1; r <= 9; r++) _rest[r] = _cnt[b+r];
          _rest[s1]--; _rest[s1+1]--; _rest[s1+2]--;
          for (s2 = 1; s2 <= 7; s2++) {
            if (_rest[s2] > 0 && _rest[s2+1] > 0 && _rest[s2+2] > 0) { res = '双顺'; break; }
          }
        }
      }
    }

    if (res === '散牌' && nt) {
      for (j = 0; j < np; j++) if (_pid[j] !== _tid[0]) { res = '碰将'; break; }
    }

    if (res === '散牌') {
      for (s = 0; s < 3; s++) {
        b = s * 10;
        for (r = 1; r <= 8; r++) if (_cnt[b+r] >= 2 && _cnt[b+r+1] >= 2) { res = '连对'; break; }
        if (res !== '散牌') break;
      }
    }

    if (res === '散牌' && nt) res = '刻子';
    if (res === '散牌' && np >= 3) res = '三碰';

    if (res === '散牌' && np) {
      for (s = 0; s < 3 && res === '散牌'; s++) {
        b = s * 10;
        for (r = 1; r <= 7; r++) {
          if (!_cnt[b+r] || !_cnt[b+r+1] || !_cnt[b+r+2]) continue;
          for (j = 0; j < np; j++) {
            if (_pid[j] !== b+r && _pid[j] !== b+r+1 && _pid[j] !== b+r+2) { res = '顺将'; break; }
          }
          if (res !== '散牌') break;
        }
      }
    }

    if (res === '散牌' && np >= 2) res = '双碰';

    if (res === '散牌') {
      for (s = 0; s < 3 && res === '散牌'; s++) {
        b = s * 10;
        for (r = 1; r <= 7; r++) if (_cnt[b+r] && _cnt[b+r+1] && _cnt[b+r+2]) { res = '顺子'; break; }
      }
    }

    if (res === '散牌' && np) res = '对子';

    for (i = 0; i < n; i++) _cnt[_idx[cards[i]]] = 0;
    _sc[0] = _sc[1] = _sc[2] = _sc[3] = 0;
    return res;
  }

  /** 旧版（保留做对照，不参与运行） */
  function classifySlow(cards) {
    var cnt = {}, sr = {}, i, k, r;
    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      cnt[c] = (cnt[c] || 0) + 1;
      var s = T.suitOf(c);
      if (!sr[s]) sr[s] = {};
      var rk = T.rankOf(c);
      sr[s][rk] = (sr[s][rk] || 0) + 1;
    }

    var pairs = [], triples = [], quads = [];
    for (k in cnt) {
      if (cnt[k] >= 2) pairs.push(k);
      if (cnt[k] >= 3) triples.push(k);
      if (cnt[k] >= 4) quads.push(k);
    }
    var pairSet = {};
    for (i = 0; i < pairs.length; i++) pairSet[pairs[i]] = 1;

    function runAt(ranks, start) {
      return !!(ranks[start] && ranks[start + 1] && ranks[start + 2]);
    }
    function suitTotal(ranks) {
      var tot = 0;
      for (var kk in ranks) tot += ranks[kk];
      return tot;
    }

    // 字牌不能参与顺子 / 连刻 / 连对，只能组对子与刻子
    var suits = Object.keys(sr).filter(function (s) { return s !== 'Z'; });

    // 14 连刻：同花色连续两个刻子
    for (i = 0; i < suits.length; i++) {
      var rk1 = sr[suits[i]];
      for (r = 1; r <= 8; r++) {
        if ((rk1[r] || 0) >= 3 && (rk1[r + 1] || 0) >= 3) return '连刻';
      }
    }

    // 13 杠带将
    if (quads.length && pairs.some(function (p) { return p !== quads[0]; })) return '杠带将';

    // 12 杠
    if (quads.length) return '杠';

    // 11 一条龙：同花色 6 张连续
    for (i = 0; i < suits.length; i++) {
      var rk2 = sr[suits[i]];
      if (suitTotal(rk2) < 6) continue;
      for (r = 1; r <= 4; r++) {
        var okRun = true;
        for (var d = 0; d < 6; d++) if (!rk2[r + d]) { okRun = false; break; }
        if (okRun) return '一条龙';
      }
    }

    // 10 双顺：同花色 6 张可拆成两个顺子
    for (i = 0; i < suits.length; i++) {
      var rk3 = sr[suits[i]];
      if (suitTotal(rk3) < 6) continue;
      var flat = [];
      for (k in rk3) for (var n = 0; n < rk3[k]; n++) flat.push(parseInt(k, 10));
      for (var s1 = 1; s1 <= 7; s1++) {
        var rest = flat.slice(), ok1 = true;
        for (var d1 = 0; d1 < 3; d1++) {
          var ix = rest.indexOf(s1 + d1);
          if (ix >= 0) rest.splice(ix, 1); else { ok1 = false; break; }
        }
        if (!ok1) continue;
        for (var s2 = 1; s2 <= 7; s2++) {
          var rest2 = rest.slice(), ok2 = true;
          for (var d2 = 0; d2 < 3; d2++) {
            var ix2 = rest2.indexOf(s2 + d2);
            if (ix2 >= 0) rest2.splice(ix2, 1); else { ok2 = false; break; }
          }
          if (ok2 && rest2.length === 0) return '双顺';
        }
      }
    }

    // 9 碰将：刻子 + 将
    if (triples.length && pairs.some(function (p) { return p !== triples[0]; })) return '碰将';

    // 8 连对：同花色相邻两个对子
    for (i = 0; i < suits.length; i++) {
      var rk4 = sr[suits[i]];
      for (r = 1; r <= 8; r++) {
        if ((rk4[r] || 0) >= 2 && (rk4[r + 1] || 0) >= 2) return '连对';
      }
    }

    // 7 刻子
    if (triples.length) return '刻子';

    // 6 三碰
    if (pairs.length >= 3) return '三碰';

    // 5 顺将：顺子 + 将
    if (pairs.length) {
      for (i = 0; i < suits.length; i++) {
        var sName = suits[i], rk5 = sr[sName];
        for (r = 1; r <= 7; r++) {
          if (!runAt(rk5, r)) continue;
          var runSet = {};
          runSet[sName + r] = 1; runSet[sName + (r + 1)] = 1; runSet[sName + (r + 2)] = 1;
          if (pairs.some(function (p) { return !runSet[p]; })) return '顺将';
        }
      }
    }

    // 4 双碰
    if (pairs.length >= 2) return '双碰';

    // 3 顺子
    for (i = 0; i < suits.length; i++) {
      var rk6 = sr[suits[i]];
      for (r = 1; r <= 7; r++) if (runAt(rk6, r)) return '顺子';
    }

    // 2 对子
    if (pairs.length >= 1) return '对子';

    // 1 散牌
    return '散牌';
  }

  /** 番种加成（不含牌灵） */
  /**
   * 番种计算。返回番数小计；items 传 null 时不构明细（枚举专用）。
   */
  function yakuFan(cards, ctx, items) {
    var fan = 0;
    var hasW = 0, hasT = 0, hasB = 0, hasHonor = 0;
    var numsN = 0, has19 = 0, yakuhai = 0;
    for (var i = 0; i < cards.length; i++) {
      var ci = _idx[cards[i]], si = ci / 10 | 0;
      if (si === 3) {
        hasHonor = 1;
        if (_yak[ci] || cards[i] === ctx.windTile) yakuhai++;
      } else {
        if (si === 0) hasW = 1; else if (si === 1) hasT = 1; else hasB = 1;
        numsN++;
        var r = ci % 10;
        if (r === 1 || r === 9) has19 = 1;
      }
    }
    var suitN = hasW + hasT + hasB;

    if (!ctx.noHonorFan) {
      if (suitN === 0 && hasHonor) { fan += 4; if (items) items.push({ name: '字一色', fan: 4 }); }
      else if (hasHonor && suitN === 1) { fan += 1; if (items) items.push({ name: '混一色', fan: 1 }); }
    }
    if (!hasHonor && numsN && !has19) { fan += 1; if (items) items.push({ name: '断幺', fan: 1 }); }
    if (yakuhai && !ctx.noYaku && !ctx.noHonorFan) {
      var yv = yakuhai * 2;
      fan += yv; if (items) items.push({ name: '役牌 ×' + yakuhai, fan: yv });
    }
    if (!ctx.usedDiscard) {
      var menqing = 3;
      for (var j = 0; j < ctx.jokers.length; j++) {
        if (ctx.jokers[j].id === 'menqingzushi') menqing = 10;
      }
      fan += menqing; if (items) items.push({ name: '门清', fan: menqing });
    }
    if ((ctx.doras && ctx.doras.length) || ctx.dora) {
      var doras = ctx.doras || (ctx.dora ? [ctx.dora] : []);
      var doraCount = 0;
      for (var di = 0; di < cards.length; di++) {
        if (doras.indexOf(cards[di]) >= 0) doraCount++;
      }
      if (doraCount) { var dv = doraCount * 3; fan += dv; if (items) items.push({ name: '宝牌 ×' + doraCount, fan: dv }); }
    }
    return fan;
  }

  /**
   * 计算一次和牌的得分
   * ctx: { usedDiscard, dora, jokers, noYaku, noHonorFan, fanCap, isFirstPlayOfLevel, forcedMult }
   */
  var _sink = { push: function () {}, forEach: function () {}, length: 0 };   // 静默模式用的空数组

  function scorePlay(cards, ctx, silent) {
    var type = classify(cards);
    if (ctx.noRun && (type === '顺子' || type === '顺将' || type === '一条龙' || type === '双顺')) type = '散牌';
    var base = BASE[type];

    var tilePts = 0, maxPt = 0;
    for (var i = 0; i < cards.length; i++) {
      var p = _pts[_idx[cards[i]]];
      tilePts += p;
      if (p > maxPt) maxPt = p;
    }

    // 杠上开花会永久抬高「杠」的基础分
    // 升级符：指定牌型永久 +1 番、+40 基础分（散牌只加基础分）
    var up = (ctx.typeUpgrades && ctx.typeUpgrades[type]) || 0;
    var typePts = type === '散牌' ? 0 : up * 40;
    var basePts = base.pts + (type === '杠' ? (ctx.gangBonus || 0) : 0) + typePts;
    var points = type === '散牌' ? (maxPt + up * 40) : basePts + tilePts;
    var fan = base.fan + up + (ctx.fanBonus || 0);
    var fanItems = silent ? null : [];
    fan += yakuFan(cards, ctx, fanItems);

    // 杠上开花：本手含四张相同 → 番数 +2
    var tally = {};
    for (var q = 0; q < cards.length; q++) tally[cards[q]] = (tally[cards[q]] || 0) + 1;
    var maxSame = 0;
    for (var tk in tally) if (tally[tk] > maxSame) maxSame = tally[tk];
    if (maxSame >= 3) { fan += 2; if (fanItems) fanItems.push({ name: '刻上开花', fan: 2 }); }

    // 杠上开花的累积成长：每开过一次花，后续所有和牌永久 +1 番
    if (ctx.gangFanBonus) {
      fan += ctx.gangFanBonus;
      if (fanItems) fanItems.push({ name: '开花·累积', fan: ctx.gangFanBonus });
    }

    // 听牌落空倒扣
    if (ctx.tenpaiPenalty) {
      fan -= ctx.tenpaiPenalty;
      if (fanItems) fanItems.push({ name: '听牌落空', fan: -ctx.tenpaiPenalty });
    }

    // 牌灵效果
    var jctx = {
      cards: cards, type: type, dora: ctx.dora, doras: ctx.doras, usedDiscard: ctx.usedDiscard,
      isFirstPlayOfLevel: ctx.isFirstPlayOfLevel
    };
    var multipliers = [];
    // 乘算成长（滚雪球 / 连庄累积）
    if (ctx.snowballMult && ctx.snowballMult > 1) {
      multipliers.push({ name: '滚雪球·累积', mult: ctx.snowballMult });
    }

    // 听牌命中：番数 ×3
    if (ctx.tenpai && cards.indexOf(ctx.tenpai.tile) >= 0) {
      multipliers.push({ name: '听牌命中「' + T.tileName(ctx.tenpai.tile) + '」', mult: 3 });
    }
    for (var j = 0; j < ctx.jokers.length; j++) {
      var jk = ctx.jokers[j];
      if (!jk.fx) continue;
      var e = jk.fx(jctx) || {};
      // 合并档位：加号区数值 ×2 / ×4，乘号区取档位次方
      var tier = jk.tier || 1;
      var addScale = tier === 1 ? 1 : (tier === 2 ? 2 : 4);
      var tag = tier === 1 ? '' : (tier === 2 ? '·二重' : '·满贯');
      if (e.points) {
        var pv = e.points * addScale;
        points += pv;
        if (fanItems) fanItems.push({ name: jk.name + tag + ' +' + pv + '分', fan: 0 });
      }
      if (e.fan) { var fv = e.fan * addScale; fan += fv; if (fanItems) fanItems.push({ name: jk.name + tag, fan: fv }); }
      if (e.mult) multipliers.push({ name: jk.name + tag, mult: Math.pow(e.mult, tier) });
    }

    if (ctx.forcedMult) multipliers.push({ name: '加倍符', mult: ctx.forcedMult });

    if (ctx.fanCap && fan > ctx.fanCap) {
      if (fanItems) fanItems.push({ name: '禁令封顶', fan: ctx.fanCap - fan });
      fan = ctx.fanCap;
    }

    var mult = 1;
    multipliers.forEach(function (m) { mult *= m.mult; });

    // 静默模式：只返回枚举需要的两个字段，不构大对象
    if (silent) return { total: Math.round(points * fan * mult), type: type };

    return {
      type: type,
      points: points,
      tilePts: tilePts,
      basePts: type === '散牌' ? 0 : basePts,
      baseFan: base.fan,
      fanItems: fanItems || _sink,
      fan: fan,
      multipliers: multipliers,
      mult: mult,
      total: Math.round(points * fan * mult)
    };
  }

  global.Hand = {
    TYPES: TYPES,
    BASE: BASE,
    classify: classify,
    scorePlay: scorePlay,
    tag: tag
  };
})(window);
