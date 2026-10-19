/* 牌面定义与牌组构造 */
(function (global) {
  'use strict';

  var SUITS = ['W', 'T', 'B', 'Z'];
  var SUIT_MAX = { W: 9, T: 9, B: 9, Z: 7 };
  var SUIT_NAME = { W: '万', T: '筒', B: '条', Z: '字' };
  var HONOR_NAME = { 1: '东', 2: '南', 3: '西', 4: '北', 5: '中', 6: '发', 7: '白' };
  // 中、发、白 = 役牌
  var YAKUHAI = { Z5: 1, Z6: 1, Z7: 1 };

  function suitOf(t) { return t[0]; }
  function rankOf(t) { return parseInt(t.slice(1), 10); }
  function make(s, r) { return s + r; }

  function points(t) {
    return suitOf(t) === 'Z' ? 10 : rankOf(t);
  }

  /** 牌面点数：数牌 1~9，字牌 10 */
  function numRanks() { return 9 * 3 + 7; }

  function allTileIds() {
    var out = [];
    for (var i = 0; i < SUITS.length; i++) {
      var s = SUITS[i];
      for (var r = 1; r <= SUIT_MAX[s]; r++) out.push(make(s, r));
    }
    return out;
  }

  /** 建牌组：每种牌 copies 张副本 */
  function buildDeck(copies) {
    var out = [];
    var ids = allTileIds();
    for (var i = 0; i < ids.length; i++) {
      for (var c = 0; c < copies; c++) out.push(ids[i]);
    }
    return out;
  }

  /** 显示用：主字符与大字符 */
  function label(t) {
    var s = suitOf(t), r = rankOf(t);
    if (s === 'Z') return { big: HONOR_NAME[r], small: '', suit: 'Z' };
    var cn = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][r];
    return { big: String(r), small: SUIT_NAME[s], suit: s, cn: cn };
  }

  function tileName(t) {
    var s = suitOf(t), r = rankOf(t);
    if (s === 'Z') return HONOR_NAME[r];
    return ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][r] + SUIT_NAME[s];
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  global.Tiles = {
    SUITS: SUITS,
    SUIT_MAX: SUIT_MAX,
    SUIT_NAME: SUIT_NAME,
    HONOR_NAME: HONOR_NAME,
    YAKUHAI: YAKUHAI,
    suitOf: suitOf,
    rankOf: rankOf,
    points: points,
    allTileIds: allTileIds,
    buildDeck: buildDeck,
    label: label,
    tileName: tileName,
    shuffle: shuffle
  };
})(window);
