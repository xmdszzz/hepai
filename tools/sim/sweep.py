"""
手牌上限参数扫描

目标：找出一个手牌张数，让牌型出现率随优先级单调递减
     （越强的牌型越稀有），并且顺子/对子这类基础牌型占大头。

用法：python sweep.py
"""

import random
from sim import make_deck
from sim_v2 import HAND_TYPES, classify_best13

random.seed(11)

COPIES = 3                      # 固定用「每种 3 张」来比较手牌张数的影响
SIZES = (8, 9, 10, 11, 12, 13)
SAMPLES = 30000


def distribution(hand_size):
    deck = make_deck(COPIES)
    dist = {t: 0 for t in HAND_TYPES}
    for _ in range(SAMPLES):
        dist[classify_best13(random.sample(deck, hand_size))] += 1
    return {t: v / SAMPLES for t, v in dist.items()}


def inversion_score(dist):
    """统计「出现率违反优先级顺序」的相邻对数，越少越好。"""
    bad = 0
    for a, b in zip(HAND_TYPES, HAND_TYPES[1:]):
        if dist[b] > dist[a] + 0.005:
            bad += 1
    return bad


def main():
    results = {}
    for hs in SIZES:
        results[hs] = distribution(hs)

    print("=" * 100)
    print(f"手牌张数对牌型分布的影响（每种 {COPIES} 张；按优先级顺序列出）")
    print("=" * 100)
    head = f"{'牌型':<7}" + "".join(f"{h:>10}" for h in SIZES)
    print(head)
    print("-" * len(head))
    for t in HAND_TYPES:
        row = f"{t:<7}"
        for h in SIZES:
            row += f"{results[h][t] * 100:>9.1f}%"
        print(row)

    print()
    print(f"{'指标':<28}" + "".join(f"{h:>10}" for h in SIZES))
    print("-" * (28 + 10 * len(SIZES)))
    inv = [inversion_score(results[h]) for h in SIZES]
    print(f"{'优先级倒挂数(越少越好)':<24}" + "".join(f"{v:>10}" for v in inv))
    base = [results[h]['对子'] + results[h]['双碰'] for h in SIZES]
    print(f"{'对子+双碰 占比':<24}" + "".join(f"{v * 100:>9.1f}%" for v in base))
    low = [results[h]['散牌'] for h in SIZES]
    print(f"{'散牌 占比':<24}" + "".join(f"{v * 100:>9.1f}%" for v in low))
    top = [results[h]['碰将'] + results[h]['刻子'] + results[h]['杠'] + results[h]['一条龙']
           for h in SIZES]
    print(f"{'高档牌型 占比':<24}" + "".join(f"{v * 100:>9.1f}%" for v in top))
    pairr = [results[h]['顺将'] for h in SIZES]
    print(f"{'顺将 占比(越高越糟)':<22}" + "".join(f"{v * 100:>9.1f}%" for v in pairr))


if __name__ == "__main__":
    main()
