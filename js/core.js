/* Poker Trainer core: cards, RNG, 7-card evaluator, combos, range parsing/formatting, math.
 * Plain script (no ES modules) so it works from file:// and in Node (attaches to globalThis.PT). */
(function (G) {
  'use strict';
  const PT = (G.PT = G.PT || {});
  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc'; // spades, hearts, diamonds, clubs
  const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  PT.RANKS = RANKS; PT.SUITS = SUITS; PT.SUIT_SYM = SUIT_SYM;

  // ---------- RNG (seeded, reproducible: used for spaced-repetition replays) ----------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  PT.makeRng = makeRng;
  PT.newSeed = () => (Math.random() * 4294967296) >>> 0;
  PT.randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1)); // inclusive
  PT.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  PT.shuffle = (rng, arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  PT.sample = (rng, arr, k) => PT.shuffle(rng, arr).slice(0, k);

  // ---------- cards ----------
  const rankOf = (c) => RANKS.indexOf(c[0]);
  const suitOf = (c) => SUITS.indexOf(c[1]);
  PT.rankOf = rankOf; PT.suitOf = suitOf;
  PT.cardIndex = (c) => rankOf(c) * 4 + suitOf(c);
  PT.fullDeck = () => { const d = []; for (const r of RANKS) for (const s of SUITS) d.push(r + s); return d; };
  PT.cardText = (c) => c[0] + SUIT_SYM[c[1]];
  PT.comboKey = (a, b) => (PT.cardIndex(a) > PT.cardIndex(b) ? a + b : b + a);
  PT.comboText = (combo) => combo.map(PT.cardText).join('');

  // ---------- 7-card evaluator (own implementation, cross-checked vs phevaluator in tests) ----------
  const CAT_NAMES = ['High Card 高牌', 'One Pair 一對', 'Two Pair 兩對', 'Trips / Set 三條', 'Straight 順子',
    'Flush 同花', 'Full House 葫蘆', 'Quads 四條', 'Straight Flush 同花順'];
  PT.CAT_NAMES = CAT_NAMES;
  function straightHigh(mask) {
    for (let hi = 12; hi >= 4; hi--) {
      const m = 0x1f << (hi - 4);
      if ((mask & m) === m) return hi;
    }
    if ((mask & 0x100f) === 0x100f) return 3; // wheel A-2-3-4-5, high card 5
    return -1;
  }
  function score(cat, ks) {
    let v = cat;
    for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] === undefined ? 0 : ks[i]);
    return v;
  }
  function topRanks(mask, n, exclude) {
    const out = [];
    for (let r = 12; r >= 0 && out.length < n; r--) if ((mask >> r) & 1 && !(exclude && exclude.includes(r))) out.push(r);
    return out;
  }
  /** evaluate(cards[5..7]) -> {score, cat} ; higher score = better hand */
  function evaluate(cards) {
    const rc = new Array(13).fill(0), sm = [0, 0, 0, 0], sc = [0, 0, 0, 0];
    let rmask = 0;
    for (const c of cards) {
      const r = rankOf(c), s = suitOf(c);
      rc[r]++; sm[s] |= 1 << r; sc[s]++; rmask |= 1 << r;
    }
    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
    if (flushSuit >= 0) {
      const sf = straightHigh(sm[flushSuit]);
      if (sf >= 0) return { score: score(8, [sf]), cat: 8 };
    }
    const quads = [], trips = [], pairs = [];
    for (let r = 12; r >= 0; r--) {
      if (rc[r] === 4) quads.push(r); else if (rc[r] === 3) trips.push(r); else if (rc[r] === 2) pairs.push(r);
    }
    if (quads.length) {
      const q = quads[0];
      return { score: score(7, [q, topRanks(rmask, 1, [q])[0]]), cat: 7 };
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const t = trips[0];
      const p = Math.max(trips.length > 1 ? trips[1] : -1, pairs.length ? pairs[0] : -1);
      return { score: score(6, [t, p]), cat: 6 };
    }
    if (flushSuit >= 0) return { score: score(5, topRanks(sm[flushSuit], 5)), cat: 5 };
    const st = straightHigh(rmask);
    if (st >= 0) return { score: score(4, [st]), cat: 4 };
    if (trips.length) {
      const t = trips[0];
      return { score: score(3, [t].concat(topRanks(rmask, 2, [t]))), cat: 3 };
    }
    if (pairs.length >= 2) {
      const [p1, p2] = pairs;
      return { score: score(2, [p1, p2, topRanks(rmask, 1, [p1, p2])[0]]), cat: 2 };
    }
    if (pairs.length === 1) {
      const p = pairs[0];
      return { score: score(1, [p].concat(topRanks(rmask, 3, [p]))), cat: 1 };
    }
    return { score: score(0, topRanks(rmask, 5)), cat: 0 };
  }
  PT.evaluate = evaluate;

  // ---------- hand classes & combos ----------
  /** normalise class name: 'KAs' -> 'AKs', 'aa' -> 'AA' */
  function normClass(s) {
    s = s.trim();
    const r1 = s[0].toUpperCase(), r2 = s[1].toUpperCase(), suf = (s[2] || '').toLowerCase();
    if (RANKS.indexOf(r1) < 0 || RANKS.indexOf(r2) < 0) throw new Error('bad class ' + s);
    const [hi, lo] = RANKS.indexOf(r1) >= RANKS.indexOf(r2) ? [r1, r2] : [r2, r1];
    return hi === lo ? hi + lo : hi + lo + suf;
  }
  PT.normClass = normClass;
  /** all combos of a class: 'AA' (6), 'AKs' (4), 'AKo' (12), 'AK' (16) */
  function combosOfClass(cls) {
    cls = normClass(cls);
    const a = cls[0], b = cls[1], suf = cls[2] || '';
    const out = [];
    if (a === b) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([a + SUITS[i], b + SUITS[j]]);
      return out;
    }
    for (const s1 of SUITS) for (const s2 of SUITS) {
      if (suf === 's' && s1 !== s2) continue;
      if (suf === 'o' && s1 === s2) continue;
      out.push([a + s1, b + s2]);
    }
    return out;
  }
  PT.combosOfClass = combosOfClass;
  PT.liveCombos = (cls, dead) => {
    const D = dead instanceof Set ? dead : new Set(dead || []);
    return combosOfClass(cls).filter(([x, y]) => !D.has(x) && !D.has(y));
  };
  /** class of a concrete 2-card hand */
  PT.classOf = (c1, c2) => {
    const [h, l] = rankOf(c1) >= rankOf(c2) ? [c1, c2] : [c2, c1];
    if (h[0] === l[0]) return h[0] + l[0];
    return h[0] + l[0] + (h[1] === l[1] ? 's' : 'o');
  };
  /** the 169 grid classes, row-major from AA: grid[i][j] */
  PT.gridClass = (i, j) => {
    const r1 = RANKS[12 - i], r2 = RANKS[12 - j];
    if (i === j) return r1 + r2;
    if (i < j) return r1 + r2 + 's';
    return r2 + r1 + 'o';
  };
  PT.allClasses = () => { const o = []; for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) o.push(PT.gridClass(i, j)); return o; };

  // ---------- range parsing ----------
  const R = '[2-9TJQKA]';
  /** parseRange('AA,KQs+,T9s,77-55,A2s-A5s,AhKh') -> {classes:[...], combos:[[c1,c2],...] (unique)} */
  function parseRange(str) {
    const classes = new Set(), specific = [];
    const tokens = String(str).split(/[\s,]+/).filter(Boolean);
    const ri = (ch) => RANKS.indexOf(ch.toUpperCase());
    for (let tok of tokens) {
      let m;
      if ((m = tok.match(new RegExp('^(' + R + ')\\1\\+$', 'i')))) {
        for (let r = ri(m[1]); r <= 12; r++) classes.add(RANKS[r] + RANKS[r]);
      } else if ((m = tok.match(new RegExp('^(' + R + ')\\1-(' + R + ')\\2$', 'i')))) {
        const [lo, hi] = [ri(m[1]), ri(m[2])].sort((x, y) => x - y);
        for (let r = lo; r <= hi; r++) classes.add(RANKS[r] + RANKS[r]);
      } else if ((m = tok.match(new RegExp('^(' + R + ')\\1$', 'i')))) {
        classes.add(m[1].toUpperCase() + m[1].toUpperCase());
      } else if ((m = tok.match(new RegExp('^(' + R + ')(' + R + ')([so]?)\\+$', 'i')))) {
        const c = normClass(m[1] + m[2] + m[3]);
        const hi = ri(c[0]), lo = ri(c[1]), suf = c[2] || '';
        for (let r = lo; r < hi; r++) addUnpaired(classes, RANKS[hi] + RANKS[r], suf);
      } else if ((m = tok.match(new RegExp('^(' + R + ')(' + R + ')([so]?)-(' + R + ')(' + R + ')([so]?)$', 'i')))) {
        const c1 = normClass(m[1] + m[2] + m[3]), c2 = normClass(m[4] + m[5] + m[6]);
        if (c1[0] !== c2[0] || (c1[2] || '') !== (c2[2] || '')) throw new Error('bad range token ' + tok);
        const hi = ri(c1[0]); const [lo1, lo2] = [ri(c1[1]), ri(c2[1])].sort((x, y) => x - y);
        for (let r = lo1; r <= lo2; r++) addUnpaired(classes, RANKS[hi] + RANKS[r], c1[2] || '');
      } else if ((m = tok.match(new RegExp('^(' + R + ')([shdc])(' + R + ')([shdc])$', 'i')))) {
        const a = m[1].toUpperCase() + m[2].toLowerCase(), b = m[3].toUpperCase() + m[4].toLowerCase();
        if (a !== b) specific.push([a, b]);
      } else if ((m = tok.match(new RegExp('^(' + R + ')(' + R + ')([so]?)$', 'i')))) {
        const c = normClass(m[1] + m[2] + m[3]);
        if (c[0] === c[1]) classes.add(c); else addUnpaired(classes, c.slice(0, 2), c[2] || '');
      } else throw new Error('無法解析 range token: ' + tok);
    }
    const seen = new Set(), combos = [];
    const push = (x, y) => { const k = PT.comboKey(x, y); if (!seen.has(k)) { seen.add(k); combos.push(cardOrder(x, y)); } };
    for (const c of classes) for (const [x, y] of combosOfClass(c)) push(x, y);
    for (const [x, y] of specific) push(x, y);
    return { classes: Array.from(classes), combos };
  }
  function addUnpaired(set, hl, suf) {
    if (suf) set.add(hl + suf); else { set.add(hl + 's'); set.add(hl + 'o'); }
  }
  function cardOrder(x, y) { return PT.cardIndex(x) > PT.cardIndex(y) ? [x, y] : [y, x]; }
  PT.parseRange = parseRange;

  /** formatRange(classes) -> compact string e.g. 'TT+,77-55,AKs,KTs+,A5s-A2s,AQo+' */
  function formatRange(classList) {
    const set = new Set(classList.map(normClass));
    const parts = [];
    // pairs
    const pr = []; for (let r = 12; r >= 0; r--) if (set.has(RANKS[r] + RANKS[r])) pr.push(r);
    for (const run of runs(pr)) {
      const top = run[0], bot = run[run.length - 1];
      if (run.length === 1) parts.push(RANKS[top] + RANKS[top]);
      else if (top === 12) parts.push(RANKS[bot] + RANKS[bot] + '+');
      else parts.push(RANKS[top] + RANKS[top] + '-' + RANKS[bot] + RANKS[bot]);
    }
    for (let hi = 12; hi >= 1; hi--) for (const suf of ['s', 'o']) {
      const lows = []; for (let lo = hi - 1; lo >= 0; lo--) if (set.has(RANKS[hi] + RANKS[lo] + suf)) lows.push(lo);
      for (const run of runs(lows)) {
        const top = run[0], bot = run[run.length - 1], H = RANKS[hi];
        if (run.length === 1) parts.push(H + RANKS[top] + suf);
        else if (top === hi - 1) parts.push(H + RANKS[bot] + suf + '+');
        else parts.push(H + RANKS[top] + suf + '-' + H + RANKS[bot] + suf);
      }
    }
    return parts.join(',');
  }
  function runs(desc) { // desc-sorted ints -> consecutive runs
    const out = []; let cur = [];
    for (const r of desc) { if (cur.length && cur[cur.length - 1] - 1 !== r) { out.push(cur); cur = []; } cur.push(r); }
    if (cur.length) out.push(cur);
    return out;
  }
  PT.formatRange = formatRange;

  // ---------- poker math ----------
  PT.math = {
    reqEquity: (P, B) => B / (P + 2 * B),          // call / final pot
    mdf: (P, B) => P / (P + B),
    alpha: (P, B) => B / (P + B),
    bluffShare: (P, B) => B / (P + 2 * B),         // balanced river bluff share of betting range
    valuePerBluff: (P, B) => (P + B) / B,          // bluff:value = B : (P+B)
    potOddsRatio: (P, B) => (P + B) / B,           // odds offered x:1
    choose2: (n) => (n * (n - 1)) / 2,
    /** exact equity of `outs` clean outs. mode: 'flop1' (flop->turn, 47 unseen), 'turn1' (46 unseen), 'flop2' (flop all-in, 2 cards) */
    outsEquity: (outs, mode) => {
      if (mode === 'flop1') return outs / 47;
      if (mode === 'turn1') return outs / 46;
      const c = (n) => (n * (n - 1)) / 2;
      return 1 - c(47 - outs) / c(47);
    },
    outsRule: (outs, mode) => { // returns {est, text}
      if (mode === 'flop2') {
        if (outs > 8) return { est: 4 * outs - (outs - 8), text: `4×${outs} − (${outs}−8) = ${4 * outs - (outs - 8)}%` };
        return { est: 4 * outs, text: `4×${outs} = ${4 * outs}%` };
      }
      if (outs <= 13) return { est: 2 * outs + 1, text: `2×${outs} + 1 = ${2 * outs + 1}%` };
      return { est: 2 * outs + 2, text: `2×${outs} + 2 = ${2 * outs + 2}%` };
    },
    /** EV of calling a river bet. w/l/t = combos villain-wins, villain-loses(bluffs), ties. P = pot before bet, B = bet */
    evCall: (P, B, value, bluff, chop) => {
      const n = value + bluff + (chop || 0);
      const e = (bluff + 0.5 * (chop || 0)) / n;
      return { equity: e, ev: e * (P + B) - (1 - e) * B };
    },
    median: (arr) => {
      if (!arr.length) return NaN;
      const a = arr.slice().sort((x, y) => x - y), m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    },
  };
  PT.fmtPct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  PT.round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

  if (typeof module !== 'undefined' && module.exports) module.exports = PT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
