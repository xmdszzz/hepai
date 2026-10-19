/**
 * 牌型判定与计分的自测
 * 用构造牌例逐档验证，并核对策划文档 §6.4 的计分示例
 *
 * 用法：node logic-test.js
 */

const path = require('path');
global.window = global;
global.localStorage = {
  _data: {},
  getItem: function (k) { return this._data[k] || null; },
  setItem: function (k, v) { this._data[k] = String(v); },
  removeItem: function (k) { delete this._data[k]; }
};
require(path.join(__dirname, '..', '..', 'src', 'tiles.js'));
require(path.join(__dirname, '..', '..', 'src', 'hand.js'));
require(path.join(__dirname, '..', '..', 'src', 'content.js'));
require(path.join(__dirname, '..', '..', 'src', 'game.js'));

const H = global.Hand, C = global.Content, G = global.Game;

let pass = 0, fail = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}  期望 ${expected}，实得 ${actual}`); }
}

/* ---------------- 1. 十四档牌型判定 ---------------- */

const CASES = [
  ['连刻', ['W3', 'W3', 'W3', 'W4', 'W4', 'W4']],
  ['杠带将', ['W5', 'W5', 'W5', 'W5', 'W3', 'W3']],
  ['杠', ['W5', 'W5', 'W5', 'W5', 'W3', 'W4']],
  ['一条龙', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']],
  ['双顺', ['T1', 'T2', 'T3', 'T5', 'T6', 'T7']],
  ['碰将', ['B5', 'B5', 'B5', 'B7', 'B7', 'B1']],
  ['连对', ['B3', 'B3', 'B4', 'B4', 'B7', 'B8']],
  ['刻子', ['B5', 'B5', 'B5', 'B1', 'B2', 'B7']],
  ['三碰', ['W1', 'W1', 'W3', 'W3', 'W7', 'W7']],
  ['顺将', ['W2', 'W3', 'W4', 'W7', 'W7', 'Z1']],
  ['双碰', ['W1', 'W1', 'W3', 'W3', 'W5', 'W7']],
  ['顺子', ['W2', 'W3', 'W4', 'W7', 'Z1', 'Z2']],
  ['对子', ['W1', 'W1', 'W3', 'W5', 'W7', 'Z1']],
  ['散牌', ['W1', 'W3', 'W5', 'W7', 'Z1', 'Z2']]
];

console.log('\n[1] 十四档牌型判定');
CASES.forEach(function (c) {
  check(c[0], H.classify(c[1]), c[0]);
});

/* ---------------- 2. 字牌不得参与顺子 / 连刻 / 连对 ---------------- */

console.log('\n[2] 字牌边界（不得被误判为顺子类）');
check('东 南 西 北 中 发 → 不是顺子类',
  ['顺子', '顺将', '一条龙', '双顺', '连刻', '连对'].indexOf(
    H.classify(['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'])) < 0, true);
// 东东东 南南南 = 3+2+1，读作碰将是合法的（字牌不能成为连刻）
check('东东东 南南南 → 碰将（不是连刻）',
  H.classify(['Z1', 'Z1', 'Z1', 'Z2', 'Z2', 'Z2']), '碰将');
check('东东 南南 西西 → 三碰',
  H.classify(['Z1', 'Z1', 'Z2', 'Z2', 'Z3', 'Z3']), '三碰');

/* ---------------- 3. 优先级（同手牌只能取最高档） ---------------- */

console.log('\n[3] 优先级');
check('刻子+将 优先于 刻子', H.classify(['W5', 'W5', 'W5', 'W7', 'W7', 'W1']), '碰将');
check('同花色 6 连 优先于 双顺', H.classify(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']), '一条龙');
check('杠 优先于 刻子', H.classify(['W5', 'W5', 'W5', 'W5', 'W1', 'W2']), '杠');
check('连对 优先于 双碰', H.classify(['B3', 'B3', 'B4', 'B4', 'B7', 'B8']), '连对');

/* ---------------- 4. 计分（对应文档 §6.4 示例） ---------------- */

console.log('\n[4] 计分公式');
const baseCtx = { usedDiscard: true, doras: [], jokers: [], windTile: null };

const rA = H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'], baseCtx);
check('示例A 牌型', rA.type, '对子');
check('示例A 点数分', rA.points, 50);
check('示例A 番数', rA.fan, 4);
check('示例A 总分', rA.total, 200);

const ctxB = { usedDiscard: true, doras: ['Z1'], jokers: [], windTile: 'Z1' };
const rB = H.scorePlay(['W3', 'W3', 'W3', 'Z1', 'Z1', 'T5'], ctxB);
check('示例B 牌型', rB.type, '碰将');
check('示例B 点数分', rB.points, 164);
// 万 + 字 + 筒 = 三种花色，不构成混一色
// 三万×3 触发刻上开花，额外 +2 番
check('示例B 番数（含刻上开花）', rB.fan, 23);
check('示例B 总分', rB.total, 3772);

const ctxC = { usedDiscard: false, doras: [], jokers: [], windTile: 'Z1' };
const qingyise = global.Content.jokerById('qingyise');
const ctxC2 = { usedDiscard: false, doras: [], jokers: [qingyise], windTile: 'Z1' };
const rC = H.scorePlay(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'], ctxC2);
check('示例C 牌型', rC.type, '一条龙');
check('示例C 点数分', rC.points, 196);
check('示例C 番数（含门清）', rC.fan, 18);
check('示例C 牌灵倍率', rC.mult, 2.5);
check('示例C 总分', rC.total, 8820);

/* ---------------- 5. 番种与牌灵 ---------------- */

console.log('\n[5] 番种与牌灵');
check('无役禁令下役牌不给番',
  H.scorePlay(['Z5', 'Z5', 'Z5', 'W1', 'W2', 'W3'],
    { usedDiscard: true, doras: [], jokers: [], windTile: 'Z1', noYaku: true, noRun: true })
    .fanItems.some(function (i) { return i.name.indexOf('役牌') === 0; }), false);
check('顺子无效禁令把顺子降为散牌',
  H.scorePlay(['W2', 'W3', 'W4', 'W7', 'Z1', 'Z2'],
    { usedDiscard: true, doras: [], jokers: [], windTile: null, noRun: true })
    .type, '散牌');
check('番数封顶 8',
  H.scorePlay(['W3', 'W3', 'W3', 'W4', 'W4', 'W4'],
    { usedDiscard: false, doras: [], jokers: [], windTile: 'Z1', fanCap: 8 })
    .fan, 8);
check('加倍符 ×2',
  H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'],
    { usedDiscard: true, doras: [], jokers: [], windTile: null, forcedMult: 2 })
    .total, 400);

/* ---------------- 6. 散牌按最大单张计分 ---------------- */

console.log('\n[6] 散牌');
const rS = H.scorePlay(['W1', 'W3', 'W5', 'W7', 'Z1', 'Z2'],
  { usedDiscard: true, doras: [], jokers: [], windTile: null });
check('散牌 点数分 = 最大单张点数（字牌=10）', rS.points, 10);
check('散牌 基础番 = 1', rS.baseFan, 1);

/* ---------------- 7. 牌组合法性 ---------------- */

console.log('\n[7] 牌组构造');
check('每种 3 张的牌组总量', global.Tiles.buildDeck(3).length, 102);
check('每种 4 张 = 一副麻将', global.Tiles.buildDeck(4).length, 136);
check('牌种数', global.Tiles.allTileIds().length, 34);

/* ---------------- 8. 灵活出牌（2~6 张） ---------------- */

console.log('\n[8] 灵活出牌（2~6 张）');
check('2 张 对子', H.classify(['W5', 'W5']), '对子');
check('3 张 顺子', H.classify(['W5', 'W6', 'W7']), '顺子');
check('3 张 刻子', H.classify(['W5', 'W5', 'W5']), '刻子');
check('4 张 杠', H.classify(['W5', 'W5', 'W5', 'W5']), '杠');
check('4 张 连对', H.classify(['B3', 'B3', 'B4', 'B4']), '连对');
check('5 张 碰将', H.classify(['W3', 'W3', 'W3', 'W5', 'W5']), '碰将');
check('5 张 顺将', H.classify(['W5', 'W5', 'W6', 'W7', 'W8']), '顺将');
check('6 张 一条龙', H.classify(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']), '一条龙');
check('6 张 三碰', H.classify(['W1', 'W1', 'W3', 'W3', 'W7', 'W7']), '三碰');

// 同牌型下，多打一张就多一张的点数分
const pShort = H.scorePlay(['W5', 'W5'], baseCtx);
const pLong = H.scorePlay(['W5', 'W5', 'W5'], baseCtx);
check('打 3 张比打 2 张得分高', pLong.total > pShort.total, true);

// 冗余牌不破坏已有结构（可以少打留牌）
check('刻子 + 冗余牌 仍是刻子',
  H.classify(['W5', 'W5', 'W5', 'T3', 'B7']), '刻子');
check('碰将 + 冗余牌 仍是碰将',
  H.classify(['W3', 'W3', 'W3', 'W5', 'W5', 'T9']), '碰将');

/* ---------------- 9. 听牌与杠上开花 ---------------- */

console.log('\n[9] 听牌与杠上开花');
const tpCtx = { usedDiscard: true, doras: [], jokers: [], windTile: null, tenpai: { tile: 'T5', turnsLeft: 3 } };
const tpMiss = H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'], tpCtx);
check('听口未出现则无倍率', tpMiss.mult, 1);
const tpHit = H.scorePlay(['W5', 'W5', 'T5', 'T7', 'B4', 'B6'], tpCtx);
check('听口命中则 ×3', tpHit.mult, 3);
check('听口命中得分是同牌面的三倍',
  tpHit.total,
  H.scorePlay(['W5', 'W5', 'T5', 'T7', 'B4', 'B6'], baseCtx).total * 3);

const gangCtx = { usedDiscard: true, doras: [], jokers: [], windTile: null };
const rGang = H.scorePlay(['W5', 'W5', 'W5', 'W5', 'W1', 'W2'], gangCtx);
check('刻上开花 +2 番', rGang.fanItems.some(function (i) { return i.name === '刻上开花' && i.fan === 2; }), true);
// 刻子（3 张）也应当触发
check('三张相同也触发开花',
  H.scorePlay(['W3', 'W3', 'W3', 'W5', 'W5', 'T9'], gangCtx)
    .fanItems.some(function (i) { return i.name === '刻上开花'; }), true);
check('只有对子不触发开花',
  H.scorePlay(['W3', 'W3', 'W5', 'W5', 'T9', 'T8'], gangCtx)
    .fanItems.some(function (i) { return i.name === '刻上开花'; }), false);
const gangUp = H.scorePlay(['W5', 'W5', 'W5', 'W5', 'W1', 'W2'],
  { usedDiscard: true, doras: [], jokers: [], windTile: null, gangBonus: 30, gangFanBonus: 2 });
check('开花永久抬高杠的基础分', gangUp.basePts, H.BASE['杠'].pts + 30);
check('开花累积 +番', gangUp.fan, rGang.fan + 2);

const penCtx = { usedDiscard: true, doras: [], jokers: [], windTile: null, tenpaiPenalty: 2 };
const rPen = H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'], penCtx);
check('听牌落空倒扣 2 番', rPen.fan, H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'], baseCtx).fan - 2);

/* ---------------- 10. 静默/完整计分路径一致性 ---------------- */

console.log('\n[10] 静默枚举路径 vs 完整路径（防止展示层重构破坏计分）');

// 确定性伪随机，保证可复现
let seed = 20261016;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

const allTiles = global.Tiles.allTileIds();
const abJokers = global.Content.JOKERS.slice(0, 8).map(function (j) {
  return Object.assign({}, j, { tier: 2 });
});

const AB_CONTEXTS = [
  { usedDiscard: false, doras: ['W5', 'Z5'], jokers: abJokers, windTile: 'Z1', typeUpgrades: { '碰将': 2, '对子': 1 }, fanBonus: 3, gangBonus: 30, gangFanBonus: 2, snowballMult: 1.4, isFirstPlayOfLevel: true },
  { usedDiscard: true, doras: ['T3'], jokers: abJokers, windTile: 'Z2', noYaku: true, noRun: true },
  { usedDiscard: false, doras: [], jokers: [], windTile: 'Z3', fanCap: 8, tenpaiPenalty: 2 },
  { usedDiscard: true, doras: [], jokers: [], windTile: null, noHonorFan: true, forcedMult: 2 }
];

let abBad = 0, abTotal = 0;
AB_CONTEXTS.forEach(function (ctx, ci) {
  for (let i = 0; i < 300; i++) {
    const cards = [];
    for (let k = 0; k < 6; k++) cards.push(allTiles[(rnd() * allTiles.length) | 0]);
    const full = H.scorePlay(cards, ctx);
    const quiet = H.scorePlay(cards, ctx, true);
    abTotal++;
    if (full.total !== quiet.total || full.type !== quiet.type) {
      abBad++;
      if (abBad <= 3) {
        console.log(`  FAIL ctx#${ci} ${cards.join(',')} 完整=${full.total}(${full.type}) 静默=${quiet.total}(${quiet.type})`);
      }
    }
  }
});

check('两种计分路径结果一致（' + abTotal + ' 组）', abBad, 0);

/* ---------------- 11. 牌灵获取路径与合并档位 ---------------- */

console.log('\n[11] 牌灵获取路径与合并档位');

G.setEconomy({ base: 1, perPlay: 2, interestDiv: 10, interestCap: 3 });
const econ = G.economy();
check('经济参数可覆盖', econ.base + ':' + econ.perPlay + ':' + econ.interestDiv + ':' + econ.interestCap, '1:2:10:3');

G.newRun('east');
const econState = G.state();
econState.playsLeft = 3;
econState.money = 20;
const incomeInfo = G.completeLevel();
check('关卡收入使用覆盖参数', incomeInfo.income, 7);
check('利息使用覆盖参数', incomeInfo.interest, 2);
check('结算后铜钱', econState.money, 29);

G.newRun('east');
const choutouState = G.state();
choutouState.playsLeft = 0;
choutouState.money = 200;
choutouState.jokers = [{ id: 'choutou', tier: 1 }];
G.setEconomy({ base: 0, perPlay: 0, interestDiv: 10, interestCap: 0 });
check('抽头存款加成有上限', G.completeLevel().income, 5);
G.setEconomy({ base: 3, perPlay: 1, interestDiv: 10, interestCap: 2 });

const gaolidai = C.jokerById('gaolidai');
const oldRollJoker = C.rollJoker;
C.rollJoker = function () { return [gaolidai, gaolidai, gaolidai, gaolidai, gaolidai, gaolidai, gaolidai, gaolidai]; };
G.newRun('east');
const slotState = G.state();
slotState.money = 0;
slotState.jokers = [];
slotState.slotUsedThisRound = false;
G.spinSlot();
C.rollJoker = oldRollJoker;
check('老虎机获得高利贷立即 +20', slotState.money, 20);
check('三张同名合并为满贯', slotState.jokers[0].tier, 3);

G.newRun('east');
const shopState = G.state();
shopState.money = 20;
shopState.shop = { jokers: [{ j: gaolidai, sold: false }], consumables: [], rerollCost: 3 };
G.buyJoker(0);
check('商店购买高利贷立即 +20', shopState.money, 32);

G.newRun('east');
const rerollState = G.state();
rerollState.money = 3;
rerollState.consumableIds = ['xipaifu'];
rerollState.shop = { jokers: [], consumables: [], rerollCost: 3 };
check('洗牌符可正常使用', G.useConsumable(0), true);
check('洗牌符消耗后清空槽位', rerollState.consumableIds.length, 0);

const t1 = H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'],
  { usedDiscard: true, doras: [], jokers: [Object.assign({}, C.jokerById('laoqian'), { tier: 1 })], windTile: null });
const t2 = H.scorePlay(['W5', 'W5', 'T3', 'T7', 'B4', 'B6'],
  { usedDiscard: true, doras: [], jokers: [Object.assign({}, C.jokerById('laoqian'), { tier: 2 })], windTile: null });
check('二重牌灵加点数分翻倍', t2.points - t1.points, 20);

console.log(`\n结果：通过 ${pass}，失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
