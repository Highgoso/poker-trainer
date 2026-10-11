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


for it in D["2M"]:
    P, B, a = it["data"]["P"], it["data"]["B"], it["answer"]
    check("2M", abs(float(F(B, P + B)) - a["alpha"]) < 1e-12 and abs(float(F(P, P + B)) - a["mdf"]) < 1e-12 and abs(float(F(B, P + 2 * B)) - a["bluff"]) < 1e-12, it)
for it in D["4E"]:
    d, a = it["data"], it["answer"]; P, B, X = d["P"], d["B"], d["X"]
    req = F(B, P + 2 * B); b = F(X, 100); ev = b * (P + B) - (1 - b) * B
    check("4E", abs(float(F(P, P + B)) - a["mdf"]) < 1e-12 and (("call" if b > req else "fold") == a["decision"]) and abs(float(ev) - a["ev"]) < 1e-9 and ((ev > 0) == (b > req)), it)

def cls_of(c1, c2):
    R = "23456789TJQKA"
    h, l = (c1, c2) if R.index(c1[0]) >= R.index(c2[0]) else (c2, c1)
    if h[0] == l[0]: return h[0] + l[0]
    return h[0] + l[0] + ("s" if h[1] == l[1] else "o")
def vb_py(hero, board, rng):
    dead = set(hero) | set(board); hr = evaluate_cards(*(hero + board)); V = Bl = T = 0
    for (h, w) in eval7.HandRange(rng).hands:
        c1, c2 = str(h[0]), str(h[1])
        if c1 in dead or c2 in dead: continue
        r = evaluate_cards(c1, c2, *board)
        if r < hr: V += 1
        elif r > hr: Bl += 1
        else: T += 1
    return V, Bl, T
def blocked_py(hero, board, rng, value_classes):
    bs, hs = set(board), set(hero); v = b = 0
    for (h, w) in eval7.HandRange(rng).hands:
        c1, c2 = str(h[0]), str(h[1])
        if c1 in bs or c2 in bs or not (c1 in hs or c2 in hs): continue
        if cls_of(c1, c2) in value_classes: v += 1
        else: b += 1
    return v, b
for it in D["4T"]:
    d, a = it["data"], it["answer"]; k = d["step"]
    V, Bl, T = vb_py(d["hero"], d["board"], d["rangeStr"]); n = V + Bl + T; P, B = d["P"], d["B"]
    e = F(2 * Bl + T, 2 * n); req = F(B, P + 2 * B); ev = e * (P + B) - (1 - e) * B
    vc = set()
    for c in d["valueClasses"]:
        for (h, w) in eval7.HandRange(c).hands: vc.add(cls_of(str(h[0]), str(h[1])))
    exp = [{"n": n}, {"n": V}, {"n": Bl}, {"p": float(e)}, {"p": float(req)}, dict(zip(("v", "b"), blocked_py(d["hero"], d["board"], d["rangeStr"], vc))), {"decision": "call" if ev > 0 else "fold"}][k]
    ok = all((abs(exp[x] - a[x]) < 1e-9 if isinstance(exp[x], float) else exp[x] == a[x]) for x in exp)
    check(f"4T.step{k + 1}", ok, f"{d} py {exp} js {a}")

# Learn page / cheat sheet example numbers
deck = [r + s_ for r in "23456789TJQKA" for s_ in "shdc"]
def enum_eq(hero, vill, board):
    known = set(hero + vill + board); rest = [c for c in deck if c not in known]; w = 0; n = 0
    for run in itertools.combinations(rest, 5 - len(board)):
        b = board + list(run); h = evaluate_cards(*(hero + b)); v = evaluate_cards(*(vill + b))
        w += 2 if h < v else 1 if h == v else 0; n += 2
    return F(w, n)
def live(rng, dead):
    D_ = set(dead); return sum(1 for (h, w) in eval7.HandRange(rng).hands if str(h[0]) not in D_ and str(h[1]) not in D_)
for c in data["learn"]:
    k, A, v = c["kind"], c["args"], c["value"]
    Fr = lambda x: F(x).limit_denominator(10 ** 6)
    if k in ("req", "bshare"): exp = F(A[1], A[0] + 2 * A[1]) if all(isinstance(x, int) for x in A) else Fr(A[1]) / (Fr(A[0]) + 2 * Fr(A[1]))
    elif k == "mdf": exp = Fr(A[0]) / (Fr(A[0]) + Fr(A[1]))
    elif k == "alpha": exp = Fr(A[1]) / (Fr(A[0]) + Fr(A[1]))
    elif k == "vpb": exp = (Fr(A[0]) + Fr(A[1])) / Fr(A[1])
    elif k == "outs":
        x, mode = A
        exp = F(x, 47) if mode == "flop1" else F(x, 46) if mode == "turn1" else F(sum(1 for p, q in itertools.combinations(range(47), 2) if p < x or q < x), 1081)
    elif k == "rule":
        x, mode = A
        exp = (3 * x + 8 if x > 8 else 4 * x) if mode == "flop2" else (2 * x + 1 if x <= 13 else 2 * x + 2)
    elif k == "implied": Cc, o, u, fp = A; exp = Fr(Cc) / F(o, u) - fp
    elif k == "evcall": e, P, B = map(Fr, A); exp = e * (P + B) - (1 - e) * B
    elif k == "evcallfast": e, P, B = map(Fr, A); exp = (e - B / (P + 2 * B)) * (P + 2 * B)
    elif k == "evbluff": f_, P, B = map(Fr, A); exp = f_ * P - (1 - f_) * B
    elif k == "evblufffast": f_, P, B = map(Fr, A); exp = (f_ - B / (P + B)) * (P + B)
    elif k == "semibluff": f_, o, u, P, B = A; f_ = Fr(f_); e = F(o, u); exp = f_ * P + (1 - f_) * (e * (P + 2 * B) - B)
    elif k == "combos": cls, board, hero = A; exp = live(cls, board + hero)
    elif k == "fd":
        classes, suit, board, hero = A; dead = set(board + hero); exp = 0
        for cl in classes:
            exp += sum(1 for (h, w) in eval7.HandRange(cl).hands if str(h[0])[1] == suit and str(h[1])[1] == suit and str(h[0]) not in dead and str(h[1]) not in dead)
    elif k == "rangecount": exp = live(A[0], A[1])
    elif k == "vb": exp = list(vb_py(A[0], A[1], A[2]))
    elif k == "blocked":
        vc = set(cls_of(str(h[0]), str(h[1])) for (h, w) in eval7.HandRange(A[3]).hands)
        exp = list(blocked_py(A[0], A[1], A[2], vc))
    elif k == "enumeq": exp = enum_eq(A[0], A[1], A[2])
    else:
        check("learn.unknown_kind", False, k); continue
    ok = (exp == v) if isinstance(exp, (list, int)) and not isinstance(exp, bool) and isinstance(v, (list, int)) else abs(float(exp) - float(v)) < 1e-9
    check(f"learn.{k}", ok, f"{A} py {exp} js {v}")
# KB reference values for Learn examples (from coach_knowledge_base.md)
kbv = {("enumeq", "AhQh"): 0.463, ("enumeq", "JhTh"): 0.563, ("enumeq", "8c7c"): 0.182}
for c in data["learn"]:
    if c["kind"] == "enumeq":
        key = ("enumeq", "".join(c["args"][0]))
        check("learn.kb_match", round(c["value"], 3) == kbv[key], f"{key} {c['value']}")
    if c["kind"] == "implied" and c["args"] == [50, 9, 46, 200]:
        check("learn.kb_match", round(c["value"], 1) == 55.6, c)
    if c["kind"] == "semibluff" and c["args"][1:] == [9, 46, 12, 8]:
        # KB lists 3.29 / 1.84 / 0.39 using e rounded to 0.196; with exact e = 9/46 the last two are 1.83 / 0.38
        check("learn.kb_match", round(c["value"], 2) == {0.4: 3.29, 0.3: 1.83, 0.2: 0.38}[c["args"][0]], c)

print("Python independent checks:")
for k in sorted(counts): print(f"  {k:28s} {counts[k]:6d} checked")
for f_ in fails[:30]: print("  PY FAIL", str(f_)[:300])
print(f"TOTAL FAILURES: {len(fails)}")
