"""
《和牌》原型数值模拟器

用途：
  1. 计算「固定 5 张」牌型表下，各牌型的实际出现率
  2. 计算每次和牌的期望得分
  3. 反推每一关需要的「番数倍率」，用于校准目标分曲线与牌灵强度

用法：
  python sim.py
"""

import random
from collections import Counter
from itertools import combinations

random.seed(20261016)

SUITS = ("W", "T", "B", "Z")  # 万、筒、条、字
RANK_MAX = {"W": 9, "T": 9, "B": 9, "Z": 7}
HONOR_NAMES = {1: "东", 2: "南", 3: "西", 4: "北", 5: "中", 6: "发", 7: "白"}

# ---------------------------------------------------------------- 牌组

def make_deck(copies_per_rank):
    """34 种牌，每种 copies_per_rank 张。"""
    deck = []
    for s in SUITS:
        for r in range(1, RANK_MAX[s] + 1):
            deck.extend([(s, r)] * copies_per_rank)
    return deck

def tile_points(card):
    """牌面点数：数牌按数字，字牌算 10。"""
    s, r = card
    return 10 if s == "Z" else r

# ---------------------------------------------------------------- 牌型判定
#
# 优先级由高到低（先按假设排序，再用模拟结果验证是否符合稀有度）

HAND_TYPES = [
    "一条龙",   # 5 张同花色连续
    "杠",       # 4 张相同 + 1 张
    "清一色",   # 5 张同花色（不连续）
    "碰将",     # 3 张相同 + 2 张相同
    "刻子",     # 3 张相同 + 2 张散牌
    "顺将",     # 3 张同花色连续 + 2 张相同
    "双碰",     # 2 + 2 + 1
    "对子",     # 2 + 1 + 1 + 1
    "散牌",     # 无结构
]

def _has_run_of(hand, suit, length=3):
    """手牌中该花色是否存在 length 张连续。返回可用的起始点列表。"""
    ranks = {r for (s, r) in hand if s == suit}
    return [r for r in range(1, RANK_MAX[suit] - length + 2)
            if all((r + i) in ranks for i in range(length))]

def classify_best(hand):
    """返回这 13 张手牌所能打出的最高档牌型。"""
    cnt = Counter(hand)
    counts = sorted(cnt.values(), reverse=True)
    suit_count = Counter(s for (s, _) in hand)

    # 1) 一条龙：同花色 5 张连续
    for s in ("W", "T", "B"):
        if suit_count[s] >= 5:
            ranks = sorted(r for (ss, r) in hand if ss == s)
            for i in range(len(ranks) - 4):
                if ranks[i + 4] - ranks[i] == 4 and len(set(ranks[i:i + 5])) == 5:
                    return "一条龙"

    # 2) 杠：4 张相同
    if counts[0] >= 4:
        return "杠"

    # 3) 清一色：同花色 >= 5 张
    for s in ("W", "T", "B"):
        if suit_count[s] >= 5:
            return "清一色"

    # 4) 碰将：3 + 2（两个不同牌种）
    triple_ranks = [c for c, n in cnt.items() if n >= 3]
    pair_ranks = [c for c, n in cnt.items() if n >= 2]
    for t in triple_ranks:
        if any(p != t for p in pair_ranks):
            return "碰将"

    # 5) 刻子：3 张相同
    if triple_ranks:
        return "刻子"

    # 6) 顺将：同花色 3 连 + 一个对子（对子不能占用顺子的牌）
    pair_set = set(pair_ranks)
    for s in ("W", "T", "B"):
        for start in _has_run_of(hand, s, 3):
            run = {(s, start), (s, start + 1), (s, start + 2)}
            if any(p not in run for p in pair_set):
                return "顺将"

    # 7) 双碰：两个对子
    if len(pair_ranks) >= 2:
        return "双碰"

    # 8) 对子
    if pair_ranks:
        return "对子"

    return "散牌"

# ---------------------------------------------------------------- 分布统计

def hand_type_distribution(copies_per_rank, hand_size=13, samples=60000):
    deck = make_deck(copies_per_rank)
    dist = Counter()
    for _ in range(samples):
        hand = random.sample(deck, hand_size)
        dist[classify_best(hand)] += 1
    return {t: dist.get(t, 0) / samples for t in HAND_TYPES}

# ---------------------------------------------------------------- 计分

# 基础分 / 基础番（v1 假设值，待验证）
BASE = {
    "一条龙": (100, 9),
    "杠":     (70, 7),
    "清一色": (50, 5),
    "碰将":   (55, 5),
    "刻子":   (35, 4),
    "顺将":   (45, 4),
    "双碰":   (25, 3),
    "对子":   (15, 2),
    "散牌":   (0, 1),   # 散牌的点数分 = 最大单张牌点数
}

def point_score(hand_type, cards):
    base, _ = BASE[hand_type]
    if hand_type == "散牌":
        return max(tile_points(c) for c in cards)
    return base + sum(tile_points(c) for c in cards)

def fan_score(hand_type, cards):
    """不含牌灵、不含宝牌的番数。"""
    _, fan = BASE[hand_type]
    suits = {s for (s, _) in cards}
    nums = [r for (s, r) in cards if s != "Z"]

    if suits == {"Z"}:
        fan += 6                                   # 字一色
    elif "Z" in suits and len(suits - {"Z"}) == 1:
        fan += 3                                   # 混一色
    if nums and all(r not in (1, 9) for r in nums) and "Z" not in suits:
        fan += 1                                   # 断幺
    # 役牌（本模拟不含门风，中发白全算）
    fan += 2 * sum(1 for (s, r) in cards if s == "Z" and r >= 5)
    return fan

def all_five_subsets(hand):
    return combinations(hand, 5)

def best_play(hand):
    """枚举 C(13,5)，返回得分最高的那一手（贪心最优打法）。"""
    best = None
    for cards in all_five_subsets(hand):
        t = classify_best(cards)
        score = point_score(t, cards) * fan_score(t, cards)
        if best is None or score > best[0]:
            best = (score, t, cards)
    return best

# ---------------------------------------------------------------- 目标分曲线

TARGETS = [
    (300, 500, 800),
    (1200, 1800, 2600),
    (4000, 6000, 9000),
    (14000, 20000, 30000),
    (45000, 65000, 95000),
    (140000, 200000, 300000),
    (450000, 650000, 950000),
    (1500000, 2200000, 3500000),
]

DIFFICULTY = {
    "东风局(休闲)": {"copies": 3, "plays": 5, "discards": 4},
    "南风局(标准)": {"copies": 2, "plays": 4, "discards": 3},
    "西风局(硬核)": {"copies": 2, "plays": 3, "discards": 2},
}

# ---------------------------------------------------------------- 主流程

def report_header(title):
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)

def main():
    # ---------- 1. 牌型出现率 ----------
    report_header("1. 牌型出现率（13 张手牌可打出的最高档牌型）")
    dists = {}
    for name, cfg in DIFFICULTY.items():
        dists[name] = hand_type_distribution(cfg["copies"])
    header = f"{'牌型':<8}" + "".join(f"{n:>16}" for n in DIFFICULTY)
    print(header)
    print("-" * len(header.encode("gbk", errors="ignore")))
    for t in HAND_TYPES:
        row = f"{t:<8}"
        for n in DIFFICULTY:
            row += f"{dists[n].get(t, 0) * 100:>15.2f}%"
        print(row)

    # ---------- 2. 期望得分 ----------
    report_header("2. 白板期望得分（枚举最优 5 张，无牌灵、无宝牌、无门清）")
    for name, cfg in DIFFICULTY.items():
        deck = make_deck(cfg["copies"])
        samples = 400
        total = 0
        per_type = Counter()
        type_plays = Counter()
        for _ in range(samples):
            hand = random.sample(deck, 13)
            score, t, _ = best_play(hand)
            total += score
            per_type[t] += score
            type_plays[t] += 1
        avg = total / samples
        print(f"\n【{name}】每种 {cfg['copies']} 张，平均每次和牌 {avg:,.0f} 分")
        for t in HAND_TYPES:
            if type_plays[t]:
                print(f"   {t:<6} 出现 {type_plays[t]/samples*100:5.1f}%   "
                      f"该类均分 {per_type[t]/type_plays[t]:>9,.0f}")

    # ---------- 3. 目标分需要的倍率 ----------
    report_header("3. 目标分曲线可行性：每一关需要多少「番数倍率」")
    print("说明：倍率 = 目标分 / (出牌次数 × 白板期望得分)")
    print("      倍率 1.0 表示纯白板刚好能过；倍率越高说明越依赖牌灵构筑\n")

    for name, cfg in DIFFICULTY.items():
        deck = make_deck(cfg["copies"])
        base_scores = []
        for _ in range(400):
            hand = random.sample(deck, 13)
            base_scores.append(best_play(hand)[0])
        avg = sum(base_scores) / len(base_scores)
        plays = cfg["plays"]
        print(f"【{name}】白板单次均分 {avg:,.0f} × {plays} 次出牌 = {avg*plays:,.0f} 分")
        print(f"{'圈':<4}{'小关':>12}{'中关':>12}{'庄关':>12}")
        for i, (a, b, c) in enumerate(TARGETS, start=1):
            row = f"{i:<4}"
            for tgt in (a, b, c):
                need = tgt / (avg * plays)
                row += f"{need:>11.1f}x"
            print(row)
        print()

    # ---------- 4. 单调性检查 ----------
    report_header("4. 优先级合理性检查：牌型越稀有，得分档位应越高")
    d = dists["南风局(标准)"]
    prev = None
    ok = True
    for t in HAND_TYPES:
        p = d.get(t, 0) * 100
        flag = ""
        if prev is not None and p > prev + 0.01:
            flag = "  <-- 比上一档更常见，优先级需调整"
            ok = False
        prev = p
        print(f"   {t:<6} 出现率 {p:6.2f}%  基础分 {BASE[t][0]:>4}  / 基础番 {BASE[t][1]:>2}{flag}")
    print()
    print("   优先级顺序 " + ("有效" if ok else "存在倒挂，需要重排"))

if __name__ == "__main__":
    main()
