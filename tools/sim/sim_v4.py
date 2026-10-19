"""
5 张 vs 6 张：实战得分跨度对比（统一口径）

上一版只算了「设计跨度」（牌型表纸面值）。这一版算「实战跨度」：
  实战跨度 = 可触及的最高档牌型均分 ÷ 散牌均分
这才是能和《小丑牌》对比的口径。

《小丑牌》同口径：高牌 ≈45 分 → 同花顺 ≈1120 分，实战斗跨度约 25 倍。

用法：python sim_v4.py
"""

import random
from itertools import combinations

from sim import make_deck
from sim_v3 import SIX_TYPES, SIX_BASE, FIVE_TYPES, FIVE_BASE

random.seed(31337)

DIFFICULTY = (("东风局(4张)", 4), ("南风局(3张)", 3))
SAMPLES = 200


def tile_points(card):
    s, r = card
    return 10 if s == "Z" else r


def classify6_exact(cards):
    """恰好 6 张牌的牌型判定。"""
    cnt = {}
    for c in cards:
        cnt[c] = cnt.get(c, 0) + 1
    sr = {}
    for c, n in cnt.items():
        sr.setdefault(c[0], {})[c[1]] = n

    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]
    quads = [c for c, n in cnt.items() if n >= 4]

    # 一条龙：同花色 6 张连续
    for s, ranks in sr.items():
        if len(ranks) == 6 and max(ranks) - min(ranks) == 5 and sum(ranks.values()) == 6:
            return "一条龙"

    # 连刻：同花色连续两个刻子
    for s, ranks in sr.items():
        for r in range(1, 9):
            if ranks.get(r, 0) >= 3 and ranks.get(r + 1, 0) >= 3:
                return "连刻"

    # 杠带将
    if quads and any(p != quads[0] for p in pairs):
        return "杠带将"

    # 双顺：6 张同花色，能拆成两个顺子
    for s, ranks in sr.items():
        if sum(ranks.values()) == 6:
            flat = []
            for r, n in ranks.items():
                flat.extend([r] * n)
            for r1 in range(1, 8):
                rest = list(flat)
                ok = True
                for k in (r1, r1 + 1, r1 + 2):
                    if k in rest:
                        rest.remove(k)
                    else:
                        ok = False
                        break
                if not ok:
                    continue
                for r2 in range(1, 8):
                    r3 = list(rest)
                    good = True
                    for k in (r2, r2 + 1, r2 + 2):
                        if k in r3:
                            r3.remove(k)
                        else:
                            good = False
                            break
                    if good and not r3:
                        return "双顺"

    # 连对 / 三碰
    if len(pairs) >= 3:
        for s, ranks in sr.items():
            for r in range(1, 8):
                if all(ranks.get(r + k, 0) >= 2 for k in range(3)):
                    return "连对"
        return "三碰"

    if triples and any(p != triples[0] for p in pairs):
        return "碰将"
    if quads:
        return "杠"
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


def point6(t, cards):
    if t == "散牌":
        return max(tile_points(c) for c in cards)
    return SIX_BASE[t][0] + sum(tile_points(c) for c in cards)


def fan6(t, cards):
    fan = SIX_BASE[t][1]
    suits = {c[0] for c in cards}
    nums = [r for (s, r) in cards if s != "Z"]
    if suits == {"Z"}:
        fan += 4
    elif "Z" in suits and len(suits) == 2:
        fan += 1
    if nums and "Z" not in suits and all(r not in (1, 9) for r in nums):
        fan += 1
    if len(suits) == 1 and "Z" not in suits:
        fan += 2
    fan += 2 * sum(1 for (s, r) in cards if s == "Z" and r >= 5)
    return fan


def best6_play(hand):
    best = None
    for cards in combinations(hand, 6):
        t = classify6_exact(cards)
        score = point6(t, cards) * fan6(t, cards)
        if best is None or score > best[0]:
            best = (score, t)
    return best


def rule(title):
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def main():
    rule("实战得分：6 张方案（枚举最优 6 张，无牌灵、无宝牌）")
    table = {}
    for name, copies in DIFFICULTY:
        deck = make_deck(copies)
        total = 0
        by = {}
        for _ in range(SAMPLES):
            hand = random.sample(deck, 13)
            score, t = best6_play(hand)
            total += score
            by.setdefault(t, [0, 0])
            by[t][0] += score
            by[t][1] += 1
        table[name] = (total / SAMPLES, by)
        print(f"\n【{name}】单次均分 {total / SAMPLES:,.0f}")
        for t in SIX_TYPES:
            if t in by:
                s, c = by[t]
                print(f"    {t:<6} 出现 {c / SAMPLES * 100:5.1f}%   均分 {s / c:>9,.0f}")

    rule("实战跨度对比（只统计出现率 ≥1% 的牌型）")
    print(f"{'方案':<8}{'最低档(散牌)':>14}{'最高可触及档':>16}{'实战跨度':>12}")
    print("-" * 52)

    # 5 张方案：用 v2 的实测均分
    print(f"{'5 张':<8}{'56':>14}{'碰将 1,343':>16}{'24x':>12}")
    for name, _ in DIFFICULTY:
        avg, by = table[name]
        live = [(t, by[t][0] / by[t][1]) for t in SIX_TYPES
                if t in by and by[t][1] / SAMPLES >= 0.01 and t != "散牌"]
        if not live:
            continue
        hi_t, hi_v = max(live, key=lambda x: x[1])
        lo = by["散牌"][0] / by["散牌"][1] if "散牌" in by else 0
        print(f"{'6 张':<8}{lo:>14,.0f}{f'{hi_t} {hi_v:,.0f}':>16}{hi_v / lo:>11.0f}x")

    rule("说明")
    print("  《小丑牌》同口径实战跨度 ≈ 25 倍（高牌 45 分 → 同花顺 1,120 分）")
    print("  若本作低于 25 倍，说明牌型之间拉不开差距；高于 25 倍则区分度更强。")


if __name__ == "__main__":
    main()
