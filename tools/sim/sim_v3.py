"""
5 张 vs 6 张 牌型方案对比

背景：上一份报告里「4~7 倍 vs 小丑牌 20 倍」是两个不同口径的比较
     （我们用「均分对最高分」，小丑牌用「最弱牌型对最强牌型」）。
      本脚本统一口径，把两种出牌张数放在同一把尺子上量。

口径定义：
  设计跨度 = 最强牌型的标准得分 / 最弱牌型的标准得分（都不含番种加成）
  实战跨度 = 模拟中「最高档牌型均分 / 最低档牌型均分」

用法：python sim_v3.py
"""

import random
from itertools import combinations

from sim import make_deck, tile_points

random.seed(2026)

DIFFICULTY = (
    ("东风局(4张)", 4),
    ("南风局(3张)", 3),
    ("西风局(2张)", 2),
)
SAMPLES = 30000


# ============================================================ 6 张牌型表
#
# 由强到弱。结构说明：
#   一条龙  6 张同花色连续
#   连刻    两个同花色连续刻子（3+3，需 6 张副本）
#   杠带将  杠 + 将（4+2）
#   双顺    两个同花色顺子（3+3）
#   三碰    三个对子（2+2+2）
#   连对    三个同花色连续对子（2+2+2 连续）
#   碰将    刻子 + 将（3+2+1）
#   杠      杠 + 2 散（4+1+1）
#   刻子    刻子 + 3 散（3+1+1+1）
#   顺将    顺子 + 将（3+2+1）
#   顺子    顺子 + 3 散（3+1+1+1）
#   双碰    两个对子（2+2+1+1）
#   对子    一个对子（2+1+1+1+1）
#   散牌    无结构（1×6）

SIX_TYPES = (
    "一条龙", "连刻", "杠带将", "双顺", "三碰", "连对", "碰将",
    "杠", "刻子", "顺将", "顺子", "双碰", "对子", "散牌",
)

# 基础分 / 基础番（先给一版，再用模拟出的稀有度校准）
SIX_BASE = {
    "一条龙": (200, 20),
    "连刻":   (180, 18),
    "杠带将": (170, 16),
    "双顺":   (150, 14),
    "三碰":   (140, 13),
    "连对":   (130, 12),
    "碰将":   (110, 10),
    "杠":     (100, 9),
    "刻子":   (80, 7),
    "顺将":   (65, 6),
    "顺子":   (50, 5),
    "双碰":   (35, 4),
    "对子":   (20, 3),
    "散牌":   (0, 1),
}

# 5 张版（沿用 v2 的最终表）作为对照
FIVE_TYPES = (
    "杠", "一条龙", "碰将", "刻子", "顺将", "顺子", "双碰", "对子", "散牌",
)
FIVE_BASE = {
    "杠": (150, 14), "一条龙": (120, 11), "碰将": (85, 8), "刻子": (70, 7),
    "顺将": (50, 5), "顺子": (35, 4), "双碰": (25, 3), "对子": (15, 2),
    "散牌": (0, 1),
}


# ============================================================ 工具

def build_index(hand):
    cnt = {}
    for c in hand:
        cnt[c] = cnt.get(c, 0) + 1
    suit_ranks = {}
    for c, n in cnt.items():
        suit_ranks.setdefault(c[0], {})[c[1]] = n
    return cnt, suit_ranks


def can_runs(suit_rank, runs):
    """判断该花色能否同时凑出给定的顺子集合（考虑副本数）。"""
    need = {}
    for r in runs:
        for k in range(r, r + 3):
            need[k] = need.get(k, 0) + 1
    return all(suit_rank.get(k, 0) >= v for k, v in need.items())


# ============================================================ 6 张判定

def best6(hand):
    cnt, sr = build_index(hand)
    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]
    quads = [c for c, n in cnt.items() if n >= 4]

    # 一条龙：同花色 6 连
    for s, ranks in sr.items():
        for r in range(1, 5):
            if all((r + k) in ranks for k in range(6)):
                return "一条龙"

    # 连刻：同花色连续两个刻子
    for s, ranks in sr.items():
        for r in range(1, 9):
            if ranks.get(r, 0) >= 3 and ranks.get(r + 1, 0) >= 3:
                return "连刻"

    # 杠带将
    if quads and any(p != quads[0] for p in pairs):
        return "杠带将"

    # 双顺：同花色两个顺子
    for s, ranks in sr.items():
        for r1 in range(1, 8):
            for r2 in range(r1, 8):
                if can_runs(ranks, (r1, r2)):
                    return "双顺"

    # 三碰 / 连对
    if len(pairs) >= 3:
        for s, ranks in sr.items():
            for r in range(1, 8):
                if all(ranks.get(r + k, 0) >= 2 for k in range(3)):
                    return "连对"
        return "三碰"

    # 碰将
    if triples and any(p != triples[0] for p in pairs):
        return "碰将"

    # 杠
    if quads:
        return "杠"

    # 刻子
    if triples:
        return "刻子"

    # 顺将 / 顺子
    if pairs:
        for s, ranks in sr.items():
            for r in range(1, 8):
                if all((r + k) in ranks for k in range(3)):
                    run = {(s, r), (s, r + 1), (s, r + 2)}
                    if any(p not in run for p in pairs):
                        return "顺将"

    for s, ranks in sr.items():
        for r in range(1, 8):
            if all((r + k) in ranks for k in range(3)):
                return "顺子"

    if len(pairs) >= 2:
        return "双碰"
    if pairs:
        return "对子"
    return "散牌"


# ============================================================ 5 张判定
#
# 与 sim_v2 保持一致，但允许从 13 张手里挑出 5 张。
# 这里用「单次出牌已选定的 5 张」来算，用于对照设计跨度。

def best5(hand):
    cnt, sr = build_index(hand)
    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]
    quads = [c for c, n in cnt.items() if n >= 4]

    for s, ranks in sr.items():
        for r in range(1, 5):
            if all((r + k) in ranks for k in range(5)):
                row = sorted(ranks)
                if len(row) >= 5 and any(row[i + 4] - row[i] == 4 for i in range(len(row) - 4)):
                    return "一条龙"
    if quads:
        return "杠"
    if triples and any(p != triples[0] for p in pairs):
        return "碰将"
    if triples:
        return "刻子"
    if pairs:
        for s, ranks in sr.items():
            for r in range(1, 8):
                if all((r + k) in ranks for k in range(3)):
                    run = {(s, r), (s, r + 1), (s, r + 2)}
                    if any(p not in run for p in pairs):
                        return "顺将"
    for s, ranks in sr.items():
        for r in range(1, 8):
            if all((r + k) in ranks for k in range(3)):
                return "顺子"
    if len(pairs) >= 2:
        return "双碰"
    if pairs:
        return "对子"
    return "散牌"


# ============================================================ 统计

def distribution(classifier, types, copies, n=SAMPLES):
    deck = make_deck(copies)
    dist = {t: 0 for t in types}
    for _ in range(n):
        dist[classifier(random.sample(deck, 13))] += 1
    return {t: v / n for t, v in dist.items()}


def design_span(base):
    """设计跨度：最强牌型标准得分 / 最弱牌型标准得分（不含番种）。"""
    scores = {}
    for t, (pts, fan) in base.items():
        if t == "散牌":
            scores[t] = 10 * fan          # 散牌按最大单张点数（字牌 10）
        else:
            scores[t] = (pts + 75) * fan  # 6 张平均点数约 75
    lo = min(scores.values())
    hi = max(scores.values())
    return hi / lo, scores


def rule(title):
    print()
    print("=" * 88)
    print(title)
    print("=" * 88)


def main():
    rule("1. 6 张方案：牌型出现率")
    d6 = {}
    for name, copies in DIFFICULTY:
        d6[name] = distribution(best6, SIX_TYPES, copies)
    print(f"{'牌型':<7}" + "".join(f"{n:>16}" for n, _ in DIFFICULTY))
    print("-" * 62)
    for t in SIX_TYPES:
        print(f"{t:<7}" + "".join(f"{d6[n][t] * 100:>15.2f}%" for n, _ in DIFFICULTY))

    rule("2. 5 张方案：牌型出现率（对照）")
    d5 = {}
    for name, copies in DIFFICULTY:
        d5[name] = distribution(best5, FIVE_TYPES, copies)
    print(f"{'牌型':<7}" + "".join(f"{n:>16}" for n, _ in DIFFICULTY))
    print("-" * 62)
    for t in FIVE_TYPES:
        print(f"{t:<7}" + "".join(f"{d5[n][t] * 100:>15.2f}%" for n, _ in DIFFICULTY))

    rule("3. 设计跨度对比（最强牌型 ÷ 最弱牌型，不含番种加成）")
    span5, sc5 = design_span(FIVE_BASE)
    span6, sc6 = design_span(SIX_BASE)
    print(f"5 张方案设计跨度：{span5:.1f}x")
    for t in FIVE_TYPES:
        print(f"    {t:<6} {sc5[t]:>9,.0f}")
    print(f"\n6 张方案设计跨度：{span6:.1f}x")
    for t in SIX_TYPES:
        print(f"    {t:<6} {sc6[t]:>9,.0f}")

    rule("4. 可玩档位数量（出现率 ≥1% 的牌型个数）")
    for label, types, dists in (("5 张", FIVE_TYPES, d5), ("6 张", SIX_TYPES, d6)):
        print(f"\n【{label}方案】")
        for name, _ in DIFFICULTY:
            live = [t for t in types if dists[name][t] >= 0.01]
            dead = [t for t in types if dists[name][t] < 0.01]
            print(f"    {name:<12} 可玩 {len(live)} 档 / 共 {len(types)} 档"
                  f"   无法触及：{'、'.join(dead) if dead else '无'}")

    rule("5. 单调性检查（按优先级顺序，出现率应递减）")
    for label, types, dists in (("5 张", FIVE_TYPES, d5), ("6 张", SIX_TYPES, d6)):
        d = dists["南风局(3张)"]
        bad = []
        for a, b in zip(types, types[1:]):
            if d[b] > d[a] + 0.005 and d[a] > 0.005:
                bad.append(f"{b}({d[b]*100:.1f}%) > {a}({d[a]*100:.1f}%)")
        print(f"\n【{label}方案】倒挂 {len(bad)} 处")
        for x in bad:
            print(f"    {x}")


if __name__ == "__main__":
    main()
