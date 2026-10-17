#!/usr/bin/env python3
"""Offline generator for the Bubble Call Drill question bank (SPEC v1.1).
4 left, 3 paid (50/30/20 prize units). Villain shoves CO/BTN/SB, Hero calls from SB/BB.
Equity: eval7.py_hand_vs_range_monte_carlo, 200k samples, ties count half (preflop, no board).
ICM: Harville/Malmuth. Usage: venv/bin/python tools/gen_bubble.py [seed]"""
import json, random, sys, os
from functools import lru_cache
import eval7

PAYOUTS = (50.0, 30.0, 20.0)
POS = ('CO', 'BTN', 'SB', 'BB')
BLIND = {'CO': 0.0, 'BTN': 0.0, 'SB': 0.5, 'BB': 1.0}
SAMPLES = 200_000
TOL = 0.015  # marginal band

# Teaching-assumption shove ranges by villain position and effective-stack bucket (bb)
RANGES = {
    'CO':  [(12, '22+,A2s+,A7o+,K9s+,KJo+,QTs+,JTs'), (20, '55+,A7s+,ATo+,KTs+,KQo,QJs'),
            (30, '77+,A9s+,AJo+,KQs'), (40, '88+,ATs+,AQo+,KQs')],
    'BTN': [(12, '22+,A2s+,A4o+,K7s+,KTo+,Q9s+,QJo,J9s+,T9s'), (20, '33+,A2s+,A8o+,K9s+,KJo+,QTs+,JTs'),
            (30, '66+,A8s+,ATo+,KTs+,KQo,QJs'), (40, '77+,A9s+,AJo+,KJs+')],
    'SB':  [(12, '22+,A2s+,A2o+,K5s+,K9o+,Q8s+,QTo+,J8s+,JTo,T8s+,98s'), (20, '22+,A2s+,A5o+,K8s+,KTo+,Q9s+,QJo,J9s+,T9s'),
            (30, '44+,A5s+,A9o+,K9s+,KJo+,QTs+,JTs'), (40, '55+,A7s+,ATo+,KTs+,KQo,QJs')],
}

def villain_range(pos, eff):
    for cap, r in RANGES[pos]:
        if eff <= cap:
            return r
    return RANGES[pos][-1][1]

def icm(stacks, payouts=PAYOUTS):
    """Harville/Malmuth: P(i finishes k-th) chained by stack proportions. Returns $EV list."""
    n = len(stacks)
    alive = tuple(i for i in range(n) if stacks[i] > 1e-12)
    ev = [0.0] * n

    @lru_cache(maxsize=None)
    def rec(remaining, place):
        # returns tuple of $EV contributions for players in `remaining` from places >= place
        out = {i: 0.0 for i in remaining}
        if place >= len(payouts) or not remaining:
            return tuple(sorted(out.items()))
        tot = sum(stacks[i] for i in remaining)
        for i in remaining:
            p = stacks[i] / tot
            out[i] += p * payouts[place]
            rest = tuple(j for j in remaining if j != i)
            for j, v in rec(rest, place + 1):
                out[j] += p * v
        return tuple(sorted(out.items()))

    for i, v in rec(alive, 0):
        ev[i] = v
    return ev

def spot_numbers(stacks, vpos, hpos):
    """stacks: dict pos->bb before blinds. Returns pot/call/thresholds/F/W/L."""
    S = dict(stacks)
    eff = min(S[vpos], S[hpos])
    dead = sum(BLIND[p] for p in POS if p not in (vpos, hpos))
    pot = 2 * eff + dead
    call = eff - BLIND[hpos]
    def after(kind):
        st = {}
        for p in POS:
            if p == vpos or p == hpos:
                continue
            st[p] = S[p] - BLIND[p]
        if kind == 'F':
            st[hpos] = S[hpos] - BLIND[hpos]
            st[vpos] = S[vpos] - BLIND[vpos] + BLIND[vpos] + BLIND[hpos] + dead  # villain collects all blinds
        else:
            hw = kind == 'W'
            st[hpos] = S[hpos] - eff + (pot if hw else 0)
            st[vpos] = S[vpos] - eff + (0 if hw else pot)
        return st
    res = {}
    for k in 'FWL':
        st = after(k)
        evs = icm([st[p] for p in POS])
        res[k] = {'stacks': {p: round(st[p], 2) for p in POS}, 'ev': {p: round(e, 3) for p, e in zip(POS, evs)}}
    F, W, L = (res[k]['ev'][hpos] for k in 'FWL')
    # use unrounded for thresholds
    Fx, Wx, Lx = (icm([after(k)[p] for p in POS])[POS.index(hpos)] for k in 'FWL')
    return dict(eff=eff, dead=dead, pot=pot, call=call, chipThr=call / pot, F=Fx, W=Wx, L=Lx,
                icmThr=(Fx - Lx) / (Wx - Lx), scen=res)

def classify(eq, chip, icmt):
    if eq >= icmt:
        return 'call'          # 夠 equity
    if eq >= chip:
        return 'premium'       # chip-EV call but ICM fold
    return 'short'             # Equity 唔夠

def combo_list(rng_str, dead):
    hr = eval7.HandRange(rng_str)
    return [(str(a), str(b)) for (a, b), w in hr.hands if str(a) not in dead and str(b) not in dead]

def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 20261016
    R = random.Random(seed)
    deck = [r + s for r in '23456789TJQKA' for s in 'shdc']
    target = {'premium': 60, 'call': 30, 'short': 30}
    got = {k: [] for k in target}
    tries = 0
    while any(len(got[k]) < target[k] for k in target) and tries < 4000:
        tries += 1
        vpos = R.choice(['CO', 'BTN', 'SB'])
        hpos = 'BB' if vpos == 'SB' else R.choice(['SB', 'BB'])
        stacks = {p: R.randint(8, 40) for p in POS}
        n = spot_numbers(stacks, vpos, hpos)
        vr = villain_range(vpos, n['eff'])
        hero = R.sample(deck, 2)
        hc = [eval7.Card(c) for c in hero]
        # quick screen (20k) to steer the mix, final number is the 200k run
        q = eval7.py_hand_vs_range_monte_carlo(hc, eval7.HandRange(vr), [], 20_000)
        cat = classify(q, n['chipThr'], n['icmThr'])
        if len(got[cat]) >= target[cat]:
            continue
        if cat == 'premium' and n['icmThr'] - n['chipThr'] < 0.03:
            continue
        eq = eval7.py_hand_vs_range_monte_carlo(hc, eval7.HandRange(vr), [], SAMPLES)
        cat = classify(eq, n['chipThr'], n['icmThr'])
        if len(got[cat]) >= target[cat]:
            continue
        live = combo_list(vr, set(hero))
        shown = list(R.choice(live))
        rec = dict(stacks=stacks, villainPos=vpos, heroPos=hpos, hero=hero, villainRange=vr, villainCombos=len(live),
                   villainShown=shown, eq=round(eq, 4), cat=cat,
                   margChip=abs(eq - n['chipThr']) <= TOL, margIcm=abs(eq - n['icmThr']) <= TOL,
                   eff=n['eff'], dead=n['dead'], pot=n['pot'], call=n['call'],
                   chipThr=round(n['chipThr'], 4), icmThr=round(n['icmThr'], 4), rp=round(n['icmThr'] - n['chipThr'], 4),
                   F=round(n['F'], 3), W=round(n['W'], 3), L=round(n['L'], 3), scen=n['scen'])
        got[cat].append(rec)
    bank = got['premium'] + got['call'] + got['short']
    R.shuffle(bank)
    for i, b in enumerate(bank):
        b['id'] = i + 1
    meta = dict(version='1.1', seed=seed, samples=SAMPLES, payouts=PAYOUTS, blinds='SB 0.5 / BB 1, no ante',
                tol=TOL, ranges=RANGES, method='eval7.py_hand_vs_range_monte_carlo (ties = half), Harville ICM')
    out = dict(meta=meta, questions=bank)
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, '..', 'data', 'bubble_bank.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    with open(os.path.join(here, '..', 'data', 'bubble_bank.js'), 'w') as f:
        f.write('/* generated by tools/gen_bubble.py — do not edit */\n(function (G) { (G.PT = G.PT || {}).BUBBLE_BANK = ')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write('; })(typeof globalThis !== "undefined" ? globalThis : this);\n')
    print({k: len(v) for k, v in got.items()}, 'tries', tries)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'icmtest':
        print([round(x, 3) for x in icm([50, 30, 20])], [round(x, 3) for x in icm([40, 30, 20, 10])], icm([25]*4)[:1], icm([10,10,10]))
    else:
        main()
