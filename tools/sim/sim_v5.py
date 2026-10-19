"""
6 张方案的牌型"独立出现率"测量

不按优先级级联，而是逐个测量「13 张手牌能否凑出该结构」。
这样才能把牌型按真实稀有度排出一个干净的档位表。

用法：python sim_v5.py
"""

import random

from sim import make_deck

random.seed(515)

DIFFICULTY = (("东风局(4张)", 4), ("南风局(3张)", 3), ("西风局(2张)", 2))
SAMPLES = 30000


def probe(hand):
    """返回所有可达成结构的布尔字典。"""
    cnt = {}
    for c in hand:
        cnt[c] = cnt.get(c, 0) + 1
    sr = {}
    for c, n in cnt.items():
        sr.setdefault(c[0], {})[c[1]] = n

    pairs = [c for c, n in cnt.items() if n >= 2]
    triples = [c for c, n in cnt.items() if n >= 3]
    quads = [c for c, n in cnt.items() if n >= 4]
    pair_set = set(pairs)

    r = {}

    # --- 对子族 ---
    r["对子"] = len(pairs) >= 1
    r["双碰"] = len(pairs) >= 2
    r["三碰"] = len(pairs) >= 3
    r["连对"] = any(
        ranks.get(x, 0) >= 2 and ranks.get(x + 1, 0) >= 2
        for ranks in sr.values() for x in range(1, 9)
    )

    # --- 刻子族 ---
    r["刻子"] = len(triples) >= 1
    r["碰将"] = bool(triples) and any(p != triples[0] for p in pairs)
    r["连刻(严)"] = any(
        ranks.get(x, 0) >= 3 and ranks.get(x + 1, 0) >= 3
        for ranks in sr.values() for x in range(1, 9)
    )
    r["连刻(宽)"] = len(triples) >= 2

    # --- 杠族 ---
    r["杠"] = len(quads) >= 1
    r["杠带将"] = bool(quads) and any(p != quads[0] for p in pairs)

    # --- 顺子族 ---
    def has_run(ranks, start):
        return all((start + k) in ranks for k in range(3))

    r["顺子"] = any(has_run(ranks, s) for ranks in sr.values() for s in range(1, 8))
    r["顺将"] = False
    if pairs:
        for ranks in sr.values():
            for s in range(1, 8):
                if has_run(ranks, s):
                    suit = next(k for k, v in sr.items() if v is ranks)
                    run = {(suit, s), (suit, s + 1), (suit, s + 2)}
                    if any(p not in run for p in pair_set):
                        r["顺将"] = True
                        break
            if r["顺将"]:
                break

    r["双顺"] = False
    for ranks in sr.values():
        for s1 in range(1, 8):
            if not has_run(ranks, s1):
                continue
            for s2 in range(s1, 8):
                need = {}
                for s in (s1, s2):
                    for k in range(s, s + 3):
                        need[k] = need.get(k, 0) + 1
                if all(ranks.get(k, 0) >= v for k, v in need.items()):
                    r["双顺"] = True
                    break
            if r["双顺"]:
                break

    r["一条龙"] = any(
        all((s + k) in ranks for k in range(6))
        for ranks in sr.values() for s in range(1, 5)
    )

    # 散牌：能挑出 6 张互不相同且无 3 连
    distinct = len(cnt) >= 6
    no_run = not any(has_run(ranks, s) for ranks in sr.values() for s in range(1, 8))
    r["散牌"] = distinct and no_run

    return r


KEYS = ("对子", "双碰", "连对", "三碰", "顺子", "顺将", "刻子", "碰将",
        "连刻(严)", "连刻(宽)", "杠", "杠带将", "双顺", "一条龙", "散牌")


def main():
    print("=" * 86)
    print(f"6 张出牌：各结构的独立出现率（13 张手牌，各 {SAMPLES:,} 次抽样）")
    print("=" * 86)
    print(f"{'结构':<10}" + "".join(f"{n:>15}" for n, _ in DIFFICULTY))
    print("-" * 55)

    res = {}
    for name, copies in DIFFICULTY:
        deck = make_deck(copies)
        acc = {k: 0 for k in KEYS}
        for _ in range(SAMPLES):
            p = probe(random.sample(deck, 13))
            for k in KEYS:
                if p[k]:
                    acc[k] += 1
        res[name] = {k: v / SAMPLES for k, v in acc.items()}

    for k in KEYS:
        print(f"{k:<10}" + "".join(f"{res[n][k] * 100:>14.2f}%" for n, _ in DIFFICULTY))

    print()
    print("=" * 86)
    print("按「南风局(3张)」稀有度排序 —— 这就是档位表的推荐顺序（低 → 高）")
    print("=" * 86)
    order = sorted(KEYS, key=lambda k: -res["南风局(3张)"][k])
    for i, k in enumerate(order, 1):
        v = res["南风局(3张)"][k]
        bar = "#" * int(v * 40)
        print(f"{i:>2}. {k:<10} {v * 100:>6.2f}%  {bar}")

    print()
    print("=" * 86)
    print("6 张 vs 5 张：新结构的可获得性")
    print("=" * 86)
    for k in ("连对", "三碰", "连刻(严)", "连刻(宽)", "杠带将", "双顺"):
        vals = " / ".join(f"{res[n][k] * 100:.2f}%" for n, _ in DIFFICULTY)
        print(f"   {k:<10} 东风 / 南风 / 西风 = {vals}")


if __name__ == "__main__":
    main()
