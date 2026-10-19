"""
《和牌》最终数值模型（6 张出牌）

档位顺序按「独立出现率」从常见到稀有排列，做到完全单调 —— 越强的牌型越稀有。
这一版的数据直接用于策划文档 v0.2。

用法：python model_final.py
"""

import random
from itertools import combinations

from sim import make_deck

random.seed(21212)

DIFFICULTY = (
    ("东风局", 4, 5),
    ("南风局", 3, 4),
    ("西风局", 2, 3),
)
SAMPLES = 300

# 档位顺序 = 由强到弱，也等于由稀有到常见
TYPES = (
    "连刻", "杠带将", "杠", "一条龙", "双顺", "碰将", "连对",
    "刻子", "三碰", "顺将", "双碰", "顺子", "对子", "散牌",
)

BASE = {
    "连刻":   (240, 21),
    "杠带将": (220, 19),
    "杠":     (195, 17),
    "一条龙": (175, 15),
    "双顺":   (150, 13),
    "碰将":   (130, 11),
    "连对":   (115, 10),
    "刻子":   (100, 9),
    "三碰":   (80, 7),
    "顺将":   (65, 6),
    "双碰":   (50, 5),
    "顺子":   (35, 4),
    "对子":   (20, 3),
    "散牌":   (0, 1),
}


def tile_points(card):
    s, r = card
    return 10 if s == "Z" else r


def classify6(cards):
    cnt = {}
    for c in cards:
        cnt[c] = cnt.get(c, 0) + 1
    sr = {}
    for c, n in cnt.items():
        sr.setdefault(c[0], {})[c[1]] = n
    sr.pop('Z', None)   # 字牌不能参与顺子 / 连刻 / 连对

    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]
    quads = [c for c, n in cnt.items() if n >= 4]
    pair_set = set(pairs)

    def run_at(ranks, s):
        return all((s + k) in ranks for k in range(3))

    # 连刻：同花色连续两个刻子
    for ranks in sr.values():
        for s in range(1, 9):
            if ranks.get(s, 0) >= 3 and ranks.get(s + 1, 0) >= 3:
                return "连刻"

    # 杠带将
    if quads and any(p != quads[0] for p in pairs):
        return "杠带将"

    # 杠
    if quads:
        return "杠"

    # 一条龙：同花色 6 连
    for ranks in sr.values():
        if sum(ranks.values()) == 6:
            for s in range(1, 5):
                if all((s + k) in ranks for k in range(6)):
                    return "一条龙"

    # 双顺：6 张同花色可拆成两个顺子
    for suit, ranks in sr.items():
        if sum(ranks.values()) == 6:
            flat = []
            for r, n in ranks.items():
                flat.extend([r] * n)
            for s1 in range(1, 8):
                rest = list(flat)
                ok1 = True
                for k in (s1, s1 + 1, s1 + 2):
                    if k in rest:
                        rest.remove(k)
                    else:
                        ok1 = False
                        break
                if not ok1:
                    continue
                for s2 in range(1, 8):
                    r3 = list(rest)
                    ok = True
                    for k in (s2, s2 + 1, s2 + 2):
                        if k in r3:
                            r3.remove(k)
                        else:
                            ok = False
                            break
                    if ok and not r3:
                        return "双顺"

    # 碰将：刻子 + 将
    if triples and any(p != triples[0] for p in pairs):
        return "碰将"

    # 连对：同花色相邻两个对子
    for ranks in sr.values():
        for s in range(1, 9):
            if ranks.get(s, 0) >= 2 and ranks.get(s + 1, 0) >= 2:
                return "连对"

    # 刻子
    if triples:
        return "刻子"

    # 三碰
    if len(pairs) >= 3:
        return "三碰"

    # 顺将：顺子 + 将
    if pairs:
        for suit, ranks in sr.items():
            for s in range(1, 8):
                if run_at(ranks, s):
                    run = {(suit, s), (suit, s + 1), (suit, s + 2)}
                    if any(p not in run for p in pair_set):
                        return "顺将"

    # 双碰
    if len(pairs) >= 2:
        return "双碰"

    # 顺子
    for ranks in sr.values():
        for s in range(1, 8):
            if run_at(ranks, s):
                return "顺子"

    # 对子
    if pairs:
        return "对子"

    return "散牌"


def point6(t, cards):
    if t == "散牌":
        return max(tile_points(c) for c in cards)
    return BASE[t][0] + sum(tile_points(c) for c in cards)


def fan6(t, cards):
    fan = BASE[t][1]
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


def best6(hand):
    best = None
    for cards in combinations(hand, 6):
        t = classify6(cards)
        score = point6(t, cards) * fan6(t, cards)
        if best is None or score > best[0]:
            best = (score, t)
    return best


def rule(t):
    print()
    print("=" * 84)
    print(t)
    print("=" * 84)


def main():
    data = {}
    rule("1. 牌型出现率与均分（每档 300 次穷举最优 6 张）")
    for name, copies, plays in DIFFICULTY:
        deck = make_deck(copies)
        total = 0
        by = {}
        for _ in range(SAMPLES):
            hand = random.sample(deck, 13)
            score, t = best6(hand)
            total += score
            by.setdefault(t, [0, 0])
            by[t][0] += score
            by[t][1] += 1
        data[name] = (total / SAMPLES, plays, by)
        print(f"\n【{name}】每种 {copies} 张｜{plays} 次出牌｜"
              f"单次均分 {total / SAMPLES:,.0f}｜上限 {total / SAMPLES * plays:,.0f}")
        for t in TYPES:
            if t in by:
                s, c = by[t]
                print(f"    {t:<6} {BASE[t][0]:>4}分/{BASE[t][1]:>2}番"
                      f"   出现 {c / SAMPLES * 100:5.1f}%   均分 {s / c:>9,.0f}")

    rule("2. 设计跨度（纸面：最强档 ÷ 最弱档，不含番种）")
    scores = {}
    for t, (pts, fan) in BASE.items():
        scores[t] = 10 * fan if t == "散牌" else (pts + 55) * fan
    for t in TYPES:
        print(f"    {t:<6} {scores[t]:>9,.0f}")
    print(f"\n    设计跨度 = {max(scores.values()) / min(scores.values()):.0f} 倍")

    rule("3. 实战跨度（只算出现率 ≥1% 的档位）")
    for name, _, _ in DIFFICULTY:
        avg, plays, by = data[name]
        live = [(t, by[t][0] / by[t][1]) for t in TYPES
                if t in by and by[t][1] / SAMPLES >= 0.01 and t != "散牌"]
        hi_t, hi_v = max(live, key=lambda x: x[1])
        lo = by["散牌"][0] / by["散牌"][1] if "散牌" in by else 0
        print(f"    {name:<8} 散牌 {lo:>6,.0f} 分  →  {hi_t} {hi_v:>7,.0f} 分"
              f"   跨度 {hi_v / lo:>5.0f} 倍")
    print("\n    《小丑牌》同口径：高牌 45 分 → 同花顺 1,120 分 ≈ 25 倍")

    rule("4. 建议目标分曲线")
    CURVE = (0.5, 0.7, 0.9, 1.4, 2.0, 2.6, 4.0, 5.6, 7.4, 11, 16, 21,
             31, 44, 58, 88, 123, 163, 245, 343, 455, 686, 960, 1274)
    for name, _, _ in DIFFICULTY:
        avg, plays, _ = data[name]
        cap = avg * plays
        print(f"\n【{name}】白板上限 {cap:,.0f}")
        k = 0
        for i in range(8):
            row = []
            for _ in range(3):
                row.append(f"{round(cap * CURVE[k] / 100) * 100:>11,}")
                k += 1
            print(f"    第 {i + 1} 圈  " + "".join(row))


if __name__ == "__main__":
    main()
