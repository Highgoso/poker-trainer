"""Independent verifier: recomputes every answer from the raw question data.
Uses eval7 (range parsing / combos), phevaluator (hand strength), fractions + brute force (math).
Shares no code with the JS app."""
import json, sys, itertools
from fractions import Fraction as F
import eval7
from phevaluator import evaluate_cards

data = json.load(open(sys.argv[1]))
fails = []
counts = {}
def check(name, cond, msg):
    counts[name] = counts.get(name, 0) + 1
    if not cond:
        fails.append(f"{name}: {msg}")

def cat_of(rank):  # phevaluator rank 1 (best) .. 7462
    for c, hi in ((8, 10), (7, 166), (6, 322), (5, 1599), (4, 1609), (3, 2467), (2, 3325), (1, 6185)):
        if rank <= hi: return c
    return 0

# A. evaluator
ev = data["evaluator"]
ranks = [evaluate_cards(*h["cards"]) for h in ev]
for h, r in zip(ev, ranks):
    check("evaluator.category", cat_of(r) == h["cat"], f"{h['cards']} js cat {h['cat']} phe rank {r}")
for i in range(len(ev) - 1):
    if len(ev[i]["cards"]) != len(ev[i + 1]["cards"]): continue
    js = (ev[i]["score"] > ev[i + 1]["score"]) - (ev[i]["score"] < ev[i + 1]["score"])
    ph = (ranks[i] < ranks[i + 1]) - (ranks[i] > ranks[i + 1])
    check("evaluator.order", js == ph, f"{ev[i]['cards']} vs {ev[i+1]['cards']}")
for t in data["ties"]:
    a = evaluate_cards(*(t["h1"] + t["board"])); b = evaluate_cards(*(t["h2"] + t["board"]))
    check("evaluator.shared_board", ((a < b) - (a > b)) == t["cmp"], f"{t}")

# B. ranges
def e7_keys(s):
    keys = set()
    for (h, w) in eval7.HandRange(s).hands:
        a, b = str(h[0]), str(h[1])
        keys.add(tuple(sorted((a, b))))
    return keys
for r in data["ranges"]:
    k = e7_keys(r["str"])
    js = set(tuple(sorted((key[:2], key[2:]))) for key in r["keys"])
    check("range.parse_vs_eval7", k == js, f"{r['str']}: eval7 {len(k)} js {len(js)}")
    if r["fmt"]:
        k2 = e7_keys(r["fmt"])
        # formatted string must reproduce exactly the class part
        cls_keys = e7_keys(",".join(r["classes"])) if r["classes"] else set()
        check("range.format_vs_eval7", k2 == cls_keys, f"{r['fmt']}")

def live_count(cls, dead):
    n = 0
    for (h, w) in eval7.HandRange(cls).hands:
        if str(h[0]) not in dead and str(h[1]) not in dead: n += 1
    return n

D = data["drills"]
for it in D["1A"]:
    check("1A", sum(live_count(c, set()) for c in it["data"]["classes"]) == it["answer"]["n"], it)
for k in ("1B", "1C", "1D"):
    for it in D[k]:
        d = it["data"]; dead = set(d["board"]) | set(d["hero"])
        check(k, live_count(d["cls"], dead) == it["answer"]["n"], it)
for it in D["1E"]:
    d = it["data"]; dead = set(d["board"]) | set(d["hero"]); X = d["suit"]; n = 0
    for c in d["classes"]:
        for (h, w) in eval7.HandRange(c).hands:
            a, b = str(h[0]), str(h[1])
            if a[1] == X and b[1] == X and a not in dead and b not in dead: n += 1
    check("1E", n == it["answer"]["n"], it)
for it in D["2A"]:
    s = F(it["data"]["size"]).limit_denominator(1000)
    check("2A", abs(float(s / (1 + 2 * s)) - it["answer"]["req"]) < 1e-9, it)
for it in D["2B"]:
    P, B = it["data"]["P"], it["data"]["B"]
    check("2B", abs(float(F(B, P + 2 * B)) - it["answer"]["req"]) < 1e-12, it)
deck47 = list(range(47))
for it in D["2C"]:
    x, mode = it["data"]["outs"], it["data"]["mode"]
    if mode == "flop1": exact = F(x, 47)
    elif mode == "turn1": exact = F(x, 46)
    else:
        hits = sum(1 for a, b in itertools.combinations(deck47, 2) if a < x or b < x)
        exact = F(hits, 1081)
    check("2C", abs(float(exact) - it["answer"]["eq"]) < 1e-12, it)
for it in D["2G"]:
    P, B, w = F(it["data"]["P"]).limit_denominator(1000), F(it["data"]["B"]).limit_denominator(1000), it["data"]["what"]
    v = P / (P + B) if w == "mdf" else B / (P + B) if w == "alpha" else B / (P + 2 * B)
    check("2G", abs(float(v) - it["answer"]["v"]) < 1e-9, it)
for it in D["4B"]:
    d, a = it["data"], it["answer"]
    dead = set(d["board"]) | set(d["hero"])
    hr = evaluate_cards(*(d["hero"] + d["board"]))
    V = Bl = T = 0
    for (h, w) in eval7.HandRange(d["rangeStr"]).hands:
        c1, c2 = str(h[0]), str(h[1])
        if c1 in dead or c2 in dead: continue
        r = evaluate_cards(c1, c2, *d["board"])
        if r < hr: V += 1
        elif r > hr: Bl += 1
        else: T += 1
    n = V + Bl + T
    e = F(2 * Bl + T, 2 * n)
    P, B = d["P"], d["B"]
    evc = e * (P + B) - (1 - e) * B
    req = F(B, P + 2 * B)
    dec = "call" if evc > 0 else "fold"
    check("4B.counts", (V, Bl, T) == (a["v"], a["b"], a["chop"]), f"{d} py {(V, Bl, T)} js {(a['v'], a['b'], a['chop'])}")
    check("4B.ev", abs(float(evc) - a["ev"]) < 1e-9, f"{d} py {float(evc)} js {a['ev']}")
    check("4B.req", abs(float(req) - a["req"]) < 1e-12, d)
    check("4B.decision", dec == a["decision"], d)
    # decision consistent with bluff-share-vs-required rule (no chops case)
    if T == 0: check("4B.share_rule", (F(Bl, n) > req) == (dec == "call"), d)
for it in D["4C"]:
    P, B, b = it["data"]["P"], it["data"]["B"], F(it["data"]["b"]).limit_denominator(100)
    evc = b * (P + B) - (1 - b) * B
    fast = (b - F(B, P + 2 * B)) * (P + 2 * B)
    check("4C", abs(float(evc) - it["answer"]["ev"]) < 1e-9 and evc == fast, it)

print("Python independent checks:")
for k in sorted(counts): print(f"  {k:28s} {counts[k]:6d} checked")
for f_ in fails[:30]: print("  PY FAIL", str(f_)[:300])
print(f"TOTAL FAILURES: {len(fails)}")
