"""
《和牌》原型数值模拟器 v2

v1 发现的两个问题：
  A. 「清一色」作为 5 张牌型时出现率高达 59%，不能当高档牌型
  B. 每种 2 张时，刻子/碰将/杠 在数学上完全不可能出现（0.00%）

v2 的修正：
  A. 清一色从「牌型」降级为「番种 +2」，牌型表只保留结构性组合
  B. 初始牌组密度按难度分层：休闲 4 张 / 标准 3 张 / 硬核 2 张
  C. 补上「顺子」档位，使牌型表与《小丑牌》的 9 档结构对齐

用法：python sim_v2.py
"""

import random
from itertools import combinations

from sim import make_deck, tile_points, HONOR_NAMES

random.seed(7)

RANK_MAX = {"W": 9, "T": 9, "B": 9, "Z": 7}

# 牌型表 v2（由强到弱）
HAND_TYPES = (
    "杠",       # 4 张相同 + 1 张（需 4 张副本，只有休闲档开局可遇）
    "一条龙",   # 5 张同花色连续
    "碰将",     # 3 张相同 + 2 张相同
    "刻子",     # 3 张相同 + 2 张散牌
    "顺将",     # 3 张同花色连续 + 2 张相同
    "顺子",     # 3 张同花色连续 + 2 张散牌
    "双碰",     # 2 + 2 + 1
    "对子",     # 2 + 1 + 1 + 1
    "散牌",     # 无结构
)

# 基础分 / 基础番
BASE = {
    "杠":     (150, 14),
    "一条龙": (120, 11),
    "碰将":   (85, 8),
    "刻子":   (70, 7),
    "顺将":   (50, 5),
    "顺子":   (35, 4),
    "双碰":   (25, 3),
    "对子":   (15, 2),
    "散牌":   (0, 1),
}


def classify5(cards):
    """判定恰好 5 张牌的牌型。cards = [(suit, rank), ...]"""
    cnt = {}
    sc = {s: 0 for s in RANK_MAX}
    for c in cards:
        cnt[c] = cnt.get(c, 0) + 1
        sc[c[0]] += 1

    maxc = max(cnt.values())
    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]

    # 1) 一条龙
    for s in ("W", "T", "B"):
        if sc[s] == 5:
            rs = sorted(r for (ss, r) in cards if ss == s)
            if len(set(rs)) == 5 and rs[-1] - rs[0] == 4:
                return "一条龙"

    # 2) 杠
    if maxc >= 4:
        return "杠"

    # 3) 碰将
    if triples and any(p != triples[0] for p in pairs):
        return "碰将"

    # 4) 刻子
    if triples:
        return "刻子"

    # 5/6) 顺将、顺子
    for s in ("W", "T", "B"):
        if sc[s] >= 3:
            rs = {r for (ss, r) in cards if ss == s}
            for start in range(1, 8):
                if {start, start + 1, start + 2} <= rs:
                    run = {(s, start), (s, start + 1), (s, start + 2)}
                    others = [c for c in cards if c not in run]
                    if len(others) == 2:
                        if others[0] == others[1]:
                            return "顺将"
                        return "顺子"

    # 7) 双碰
    if len(pairs) >= 2:
        return "双碰"

    # 8) 对子
    if pairs:
        return "对子"

    return "散牌"


def classify_best13(hand):
    """13 张手牌能打出的最高档牌型。"""
    cnt = {}
    sc = {s: 0 for s in RANK_MAX}
    for c in hand:
        cnt[c] = cnt.get(c, 0) + 1
        sc[c[0]] += 1

    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]
    quads = [c for c, n in cnt.items() if n >= 4]
    pair_set = set(pairs)

    for s in ("W", "T", "B"):
        if sc[s] >= 5:
            rs = sorted(r for (ss, r) in hand if ss == s)
            uniq = sorted(set(rs))
            for i in range(len(uniq) - 4):
                if uniq[i + 4] - uniq[i] == 4:
                    return "一条龙"

    if quads:
        return "杠"
    if triples and any(p != triples[0] for p in pairs):
        return "碰将"
    if triples:
        return "刻子"

    if pairs:
        for s in ("W", "T", "B"):
            if sc[s] >= 3:
                rs = {r for (ss, r) in hand if ss == s}
                for start in range(1, 8):
                    if {start, start + 1, start + 2} <= rs:
                        run = {(s, start), (s, start + 1), (s, start + 2)}
                        if any(p not in run for p in pair_set):
                            return "顺将"

    # 顺子：手里能凑出任意同花色 3 连即可
    for s in ("W", "T", "B"):
        if sc[s] >= 3:
            rs = {r for (ss, r) in hand if ss == s}
            for start in range(1, 8):
                if {start, start + 1, start + 2} <= rs:
                    return "顺子"

    if len(pairs) >= 2:
        return "双碰"
    if pairs:
        return "对子"
    return "散牌"


def point_score(hand_type, cards):
    if hand_type == "散牌":
        return max(tile_points(c) for c in cards)
    return BASE[hand_type][0] + sum(tile_points(c) for c in cards)


def fan_score(hand_type, cards, dora=None):
    """番数 = 牌型基础番 + 番种加成"""
    fan = BASE[hand_type][1]
    suits = {s for (s, _) in cards}
    nums = [r for (s, r) in cards if s != "Z"]

    if suits == {"Z"}:
        fan += 4                                    # 字一色
    elif "Z" in suits and len(suits) == 2:
        fan += 1                                    # 混一色
    if nums and "Z" not in suits and all(r not in (1, 9) for r in nums):
        fan += 1                                    # 断幺
    if len(suits) == 1 and "Z" not in suits:
        fan += 2                                    # 清一色（降级后）
    fan += 2 * sum(1 for (s, r) in cards if s == "Z" and r >= 5)   # 役牌
    if dora is not None:
        fan += 3 * sum(1 for c in cards if c == dora)              # 宝牌
    return fan


def best_play(hand):
    best = None
    for cards in combinations(hand, 5):
        t = classify5(cards)
        score = point_score(t, cards) * fan_score(t, cards)
        if best is None or score > best[0]:
            best = (score, t)
    return best


# 每种牌在牌组里的副本数 / 出牌次数 / 换牌次数
DIFFICULTY = (
    ("东风局(休闲)", 4, 5, 4),
    ("南风局(标准)", 3, 4, 3),
    ("西风局(硬核)", 2, 3, 2),
)

# 目标倍率曲线：圈1 小关 0.5 倍白板能力起步，每圈约 ×2.8
TOUGHNESS = (
    (0.5, 0.7, 0.9),
    (1.4, 2.0, 2.6),
    (4.0, 5.6, 7.4),
    (11, 16, 21),
    (31, 44, 58),
    (88, 123, 163),
    (245, 343, 455),
    (686, 960, 1274),
)


def rule(title):
    print()
    print("=" * 76)
    print(title)
    print("=" * 76)


def main():
    dists = {}
    stats = {}

    # ---------- 1. 牌型出现率 ----------
    rule("1. 牌型出现率（13 张手牌能打出的最高档牌型，各 4 万次抽样）")
    print(f"{'牌型':<7}{'东风局(4张)':>16}{'南风局(3张)':>16}{'西风局(2张)':>16}")
    print("-" * 60)
    for name, copies, _, _ in DIFFICULTY:
        deck = make_deck(copies)
        dist = {t: 0 for t in HAND_TYPES}
        n = 40000
        for _ in range(n):
            dist[classify_best13(random.sample(deck, 13))] += 1
        dists[name] = {t: v / n for t, v in dist.items()}
    for t in HAND_TYPES:
        row = f"{t:<7}"
        for name, _, _, _ in DIFFICULTY:
            row += f"{dists[name][t] * 100:>15.2f}%"
        print(row)

    # ---------- 2. 白板期望得分 ----------
    rule("2. 白板期望得分（枚举最优 5 张；不含牌灵、宝牌、门清）")
    for name, copies, plays, _ in DIFFICULTY:
        deck = make_deck(copies)
        n = 400
        total = 0
        by_type = {}
        for _ in range(n):
            hand = random.sample(deck, 13)
            score, t = best_play(hand)
            total += score
            by_type.setdefault(t, [0, 0])
            by_type[t][0] += score
            by_type[t][1] += 1
        avg = total / n
        stats[name] = (avg, plays)
        print(f"\n【{name}】每种 {copies} 张｜单次均分 {avg:,.0f}｜"
              f"{plays} 次出牌合计 {avg * plays:,.0f}")
        for t in HAND_TYPES:
            if t in by_type:
                s, c = by_type[t]
                print(f"    {t:<6} 出现 {c / n * 100:5.1f}%   均分 {s / c:>9,.0f}")

    # ---------- 3. 建议目标分曲线 ----------
    rule("3. 建议目标分曲线（按「白板能力 × 倍率」反推）")
    for name, copies, plays, _ in DIFFICULTY:
        avg, pl = stats[name]
        cap = avg * pl
        print(f"\n【{name}】白板上限 {cap:,.0f} 分"
              f"（单次 {avg:,.0f} × {pl} 次）")
        print(f"{'圈':<4}{'小关':>12}{'中关':>12}{'庄关':>12}   {'所需倍率':>14}")
        for i, (a, b, c) in enumerate(TOUGHNESS, start=1):
            row = f"{i:<4}"
            for k in (a, b, c):
                row += f"{round(cap * k / 100) * 100:>12,}"
            row += f"   {a:.1f}x ~ {c:.1f}x".rjust(18)
            print(row)

    # ---------- 4. 数值跨度检查 ----------
    rule("4. 牌型价值跨度检查（最高档 / 最低档 的得分比）")
    for name, copies, plays, _ in DIFFICULTY:
        deck = make_deck(copies)
        avg, _ = stats[name]
        hi = 0
        for _ in range(200):
            hand = random.sample(deck, 13)
            score, _t = best_play(hand)
            hi = max(hi, score)
        print(f"   {name:<14} 白板均分 {avg:>6,.0f}   单次最高 {hi:>7,}"
              f"   跨度 {hi / avg:.1f}x")

    # ---------- 5. 优先级单调性 ----------
    rule("5. 优先级检查：越稀有的牌型，档位应越高")
    d = dists["南风局(标准)"]
    prev = None
    ok = True
    for t in HAND_TYPES:
        p = d[t] * 100
        flag = ""
        if prev is not None and p > prev + 0.05:
            flag = "   <-- 倒挂"
            ok = False
        prev = p
        print(f"   {t:<6} 出现率 {p:6.2f}%   基础分 {BASE[t][0]:>4}   基础番 {BASE[t][1]:>2}{flag}")
    print()
    print("   结论：" + ("优先级顺序有效（单调递减）" if ok else "仍有倒挂，需要重排"))


if __name__ == "__main__":
    main()
