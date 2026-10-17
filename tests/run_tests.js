#!/usr/bin/env node
/* Cross-check every drill's answers against an independent Python implementation
 * (eval7 for range/combos, phevaluator for hand strength, fractions/brute-force for math).
 * Usage: node tests/run_tests.js [spotsPerDrill=300]   (env PYTHON=path to python with eval7+phevaluator) */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
require('../js/core.js'); require('../js/drills.js'); require('../js/learn.js');
const PT = globalThis.PT;
const N = parseInt(process.argv[2] || '300', 10);
const PY = process.env.PYTHON || '/workspace/poker-research/venv/bin/python';
const out = { evaluator: [], ties: [], ranges: [], drills: {}, kb: {}, learn: [] };
let jsFail = 0; const jsFails = [];
const fail = (msg) => { jsFail++; if (jsFails.length < 30) jsFails.push(msg); };

// ---- A. evaluator samples ----
const rng = PT.makeRng(12345);
for (let i = 0; i < 40000; i++) {
  const k = i % 8 === 0 ? 5 : i % 8 === 1 ? 6 : 7;
  const cards = PT.sample(rng, PT.fullDeck(), k);
  const e = PT.evaluate(cards);
  out.evaluator.push({ cards, score: e.score, cat: e.cat });
}
// shared-board pairs (many ties / close comparisons, like 4B)
for (let i = 0; i < 20000; i++) {
  const d = PT.sample(rng, PT.fullDeck(), 9);
  const board = d.slice(0, 5), h1 = d.slice(5, 7), h2 = d.slice(7, 9);
  const a = PT.evaluate(h1.concat(board)).score, b = PT.evaluate(h2.concat(board)).score;
  out.ties.push({ board, h1, h2, cmp: Math.sign(a - b) });
}

// ---- B. range parser + formatter ----
const R = PT.RANKS;
for (let i = 0; i < N; i++) {
  const toks = [];
  const nt = PT.randInt(rng, 1, 6);
  for (let t = 0; t < nt; t++) {
    const kind = PT.randInt(rng, 0, 6);
    const hi = PT.randInt(rng, 1, 12), lo = PT.randInt(rng, 0, hi - 1);
    const suf = PT.pick(rng, ['s', 'o', '']);
    if (kind === 0) toks.push(R[hi] + R[hi]);
    else if (kind === 1) toks.push(R[lo] + R[lo] + '+');
    else if (kind === 2) toks.push(R[hi] + R[hi] + '-' + R[lo] + R[lo]);
    else if (kind === 3) toks.push(R[hi] + R[lo] + suf);
    else if (kind === 4) toks.push(R[hi] + R[lo] + suf + '+');
    else if (kind === 5) { const lo2 = PT.randInt(rng, 0, lo); toks.push(R[hi] + R[lo] + suf + '-' + R[hi] + R[lo2] + suf); }
    else { const [a, b] = PT.sample(rng, PT.fullDeck(), 2); toks.push(a + b); }
  }
  const str = toks.join(',');
  const parsed = PT.parseRange(str);
  const keys = parsed.combos.map(([a, b]) => PT.comboKey(a, b)).sort();
  // formatter round trip on the class part
  const fmt = PT.formatRange(parsed.classes);
  const re = PT.parseRange(fmt).classes.sort().join(',');
  if (re !== parsed.classes.slice().sort().join(',')) fail(`formatRange round-trip ${str} -> ${fmt}`);
  out.ranges.push({ str, n: parsed.combos.length, keys, fmt, classes: parsed.classes });
}

// ---- C. drills ----
const okResp = {
  '1A': (q) => ({ n: q.answer.n }), '1B': (q) => ({ n: q.answer.n }), '1C': (q) => ({ n: q.answer.n }), '1D': (q) => ({ n: q.answer.n }),
  '1E': (q) => ({ n: q.answer.n }), '2A': (q) => ({ p: (q.answer.req * 100).toFixed(1) }), '2B': (q) => ({ p: (q.answer.req * 100).toFixed(1) }),
  '2C': (q) => ({ p: (q.answer.eq * 100).toFixed(1) }), '2G': (q) => ({ p: (q.answer.v * 100).toFixed(1) }),
  '4B': (q) => ({ v: q.answer.v, b: q.answer.b, action: q.answer.decision }), '4C': (q) => ({ ev: q.answer.ev.toFixed(2) }),
  '2M': (q) => ({ a: (q.answer.alpha * 100).toFixed(1), m: (q.answer.mdf * 100).toFixed(1), b: (q.answer.bluff * 100).toFixed(1) }),
  '4E': (q) => ({ m: (q.answer.mdf * 100).toFixed(1), action: q.answer.decision }),
  '4T': (q) => { const a = q.answer; if ('decision' in a) return { action: a.decision }; if ('v' in a) return { v: a.v, b: a.b }; if ('p' in a) return { p: (a.p * 100).toFixed(1) }; return { n: a.n }; },
};
const badResp = {
  '1A': (q) => ({ n: q.answer.n + 1 }), '1B': (q) => ({ n: q.answer.n + 1 }), '1C': (q) => ({ n: q.answer.n - 1 }), '1D': (q) => ({ n: q.answer.n + 2 }),
  '1E': (q) => ({ n: q.answer.n + 1 }), '2A': (q) => ({ p: (q.answer.req * 100 + 1.6).toFixed(1) }), '2B': (q) => ({ p: (q.answer.req * 100 - 2.6).toFixed(1) }),
  '2C': (q) => ({ p: (q.answer.eq * 100 + 2.6).toFixed(1) }), '2G': (q) => ({ p: (q.answer.v * 100 + 2.6).toFixed(1) }),
  '4B': (q) => ({ v: q.answer.v, b: q.answer.b, action: q.answer.decision === 'call' ? 'fold' : 'call' }), '4C': (q) => { const e = q.answer.ev, t = Math.max(0.15 * Math.abs(e), 0.5); return { ev: (Math.abs(e) > t ? -e : e + 3 * t).toFixed(2) }; },
  '2M': (q) => ({ a: (q.answer.alpha * 100).toFixed(1), m: (q.answer.mdf * 100 + 2.6).toFixed(1), b: (q.answer.bluff * 100).toFixed(1) }),
  '4E': (q) => ({ m: (q.answer.mdf * 100).toFixed(1), action: q.answer.decision === 'call' ? 'fold' : 'call' }),
  '4T': (q) => { const a = q.answer; if ('decision' in a) return { action: a.decision === 'call' ? 'fold' : 'call' }; if ('v' in a) return { v: a.v + 1, b: a.b }; if ('p' in a) return { p: (a.p * 100 + 1.6).toFixed(1) }; return { n: a.n + 1 }; },
};
const t0 = Date.now();
for (const id of PT.drillList()) {
  out.drills[id] = [];
  for (let s = 1; s <= N; s++) {
    const seed = 1000 * s + id.charCodeAt(1);
    const full = PT.drills[id].generate(PT.makeRng(seed), {});
    // determinism (spaced repetition replays by seed)
    const again = PT.drills[id].generate(PT.makeRng(seed), {});
    if (JSON.stringify(again.data) !== JSON.stringify(full.data) || JSON.stringify((again.steps || []).map((x) => x.answer)) !== JSON.stringify((full.steps || []).map((x) => x.answer))) fail(`${id} seed ${seed} not deterministic`);
    const qs = full.steps || [full];
    for (const q of qs) {
      if (!q.grade(okResp[id](q)).ok) fail(`${id} seed ${seed}: correct answer graded wrong`);
      if (q.grade(badResp[id](q)).ok) fail(`${id} seed ${seed}: wrong answer graded correct`);
      out.drills[id].push({ seed, data: q.data, answer: q.answer });
    }
  }
  // 4B loose mode / decision-only grading
  if (id === '4B') {
    const q = PT.drills['4B'].generate(PT.makeRng(77), { loose: true });
    const tol = Math.round(q.answer.v * 0.1);
    if (!q.grade({ v: q.answer.v + tol, b: q.answer.b, action: q.answer.decision }).ok) fail('4B loose tolerance');
    const q2 = PT.drills['4B'].generate(PT.makeRng(77), { decisionOnly: true });
    if (!q2.grade({ action: q2.answer.decision }).ok || q2.inputs.length) fail('4B decision-only');
  }
}
const genMs = Date.now() - t0;

// ---- D. knowledge-base reference values ----
const M = PT.math;
const kbReq = [[1 / 4, 16.7, 80.0, 20.0], [1 / 3, 20.0, 75.0, 25.0], [1 / 2, 25.0, 66.7, 33.3], [2 / 3, 28.6, 60.0, 40.0], [3 / 4, 30.0, 57.1, 42.9], [1, 33.3, 50.0, 50.0], [1.25, 35.7, 44.4, 55.6], [1.5, 37.5, 40.0, 60.0], [2, 40.0, 33.3, 66.7], [3, 42.9, 25.0, 75.0]];
for (const [s, req, mdf, al] of kbReq) {
  const r1 = (x) => Math.round(x * 1000) / 10;
  if (r1(M.reqEquity(1, s)) !== req || r1(M.mdf(1, s)) !== mdf || r1(M.alpha(1, s)) !== al) fail(`KB bet table mismatch at s=${s}`);
}
const kbOuts = { 1: [2.1, 2.2, 4.3, 4], 4: [8.5, 8.7, 16.5, 16], 8: [17.0, 17.4, 31.5, 32], 9: [19.1, 19.6, 35.0, 35], 12: [25.5, 26.1, 45.0, 44], 15: [31.9, 32.6, 54.1, 53], 21: [44.7, 45.7, 69.9, 71] };
for (const [x, [a, b, c, d]] of Object.entries(kbOuts)) {
  const r1 = (v) => Math.round(v * 1000) / 10;
  if (r1(M.outsEquity(+x, 'flop1')) !== a || r1(M.outsEquity(+x, 'turn1')) !== b || r1(M.outsEquity(+x, 'flop2')) !== c || M.outsRule(+x, 'flop2').est !== d) fail(`KB outs table mismatch at ${x}`);
}
// KB §6.3 worked example: hero KhJd on Ks7d2c6s2h, pot 28 bet 28 -> V 29, B 21, EV +7.28
{
  const board = ['Ks', '7d', '2c', '6s', '2h'], hero = ['Kh', 'Jd'];
  const rangeStr = 'AK,KQ,KK,77,66,K7s,K6s,A2s,22,98s,85s,54s,AsQs,AsJs,AsTs,As5s,As4s,As3s,QsJs,QsTs,JsTs';
  const dead = new Set(board.concat(hero));
  const hs = PT.evaluate(hero.concat(board)).score;
  let V = 0, B = 0, T = 0;
  for (const cb of PT.parseRange(rangeStr).combos) {
    if (dead.has(cb[0]) || dead.has(cb[1])) continue;
    const s = PT.evaluate(cb.concat(board)).score; if (s > hs) V++; else if (s < hs) B++; else T++;
  }
  const ev = M.evCall(28, 28, V, B, T).ev;
  out.kb.example = { V, B, T, ev };
  if (V !== 29 || B !== 21 || T !== 0 || Math.abs(ev - 7.28) > 0.005) fail(`KB worked example mismatch V${V} B${B} T${T} EV${ev}`);
  // hero KhJs variant: 29 / 18 ; hero QhQd: 35 / 21
  const variant = (h, eV, eB) => {
    const d = new Set(board.concat(h)); const s0 = PT.evaluate(h.concat(board)).score; let v = 0, b = 0;
    for (const cb of PT.parseRange(rangeStr).combos) { if (d.has(cb[0]) || d.has(cb[1])) continue; const s = PT.evaluate(cb.concat(board)).score; if (s > s0) v++; else if (s < s0) b++; }
    if (v !== eV || b !== eB) fail(`KB variant ${h} got ${v}/${b} expected ${eV}/${eB}`);
  };
  variant(['Kh', 'Js'], 29, 18); variant(['Qh', 'Qd'], 35, 21);
}
// KB §1.4 table on Ks7d2c (board only / + hero KhJd)
{
  const board = ['Ks', '7d', '2c'], hero = ['Kh', 'Jd'];
  const chk = { KK: [3, 1], '77': [3, null], QQ: [6, null], AK: [12, 8], AKs: [3, null], KQ: [12, 8], KJ: [null, 6], QJ: [16, 12], JJ: [null, 3], K7: [9, null], K7s: [2, 1], '72': [9, null] };
  for (const [c, [b0, b1]] of Object.entries(chk)) {
    if (b0 !== null && PT.explainClass(c, board, []).count !== b0) fail(`KB 1.4 ${c} board-only`);
    if (b1 !== null && PT.explainClass(c, board, hero).count !== b1) fail(`KB 1.4 ${c} with hero`);
  }
}


// ---- E. Learn page + cheat sheet: recorded example numbers, prose arithmetic, anchors ----
const learnHtml = PT.learnHtml();
const learnChecks = PT.LEARN_CHECKS.slice();
const cheatHtml = PT.cheatHtml();
const cheatChecks = PT.LEARN_CHECKS.slice();
out.learn = learnChecks.concat(cheatChecks);
const strip = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
let arithChecked = 0, arithSkipped = 0;
function checkArithmetic(name, html) {
  const text = strip(html);
  const re = /([\d(][\d.\s()+\-−×÷\/]*[\d)])\s*=\s*(−?\d+(?:\.\d+)?)(\s*%)?(?!\s*[+\-−×÷\/(\d])/g;
  let m;
  while ((m = re.exec(text))) {
    let expr = m[1].trim();
    if (!/[+\-−×÷\/]/.test(expr.replace(/^−/, ''))) continue;
    // balance parentheses: drop leading unmatched ')' fragments
    const bal = (e) => { let d = 0; for (const ch of e) { if (ch === '(') d++; if (ch === ')') d--; if (d < 0) return false; } return d === 0; };
    if (!bal(expr)) { arithSkipped++; continue; }
    const js = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    let left; try { left = Function('"use strict";return (' + js + ')')(); } catch (e) { arithSkipped++; continue; }
    const r = parseFloat(m[2].replace('−', '-'));
    const dec = (m[2].split('.')[1] || '').length;
    const tol = 0.5 * 10 ** -dec + 0.006 * Math.abs(r) + 1e-9;
    const ok = Math.abs(left - r) <= tol || (m[3] && Math.abs(left * 100 - r) <= tol);
    arithChecked++;
    if (!ok) fail(`${name} arithmetic: "${expr} = ${m[2]}${m[3] || ''}" (computed ${left})`);
  }
}
checkArithmetic('learn', learnHtml); checkArithmetic('cheat', cheatHtml);
const ids = new Set([...learnHtml.matchAll(/id="L-([\w-]+)"/g)].map((x) => x[1]));
let anchors = 0;
for (const [name, h] of [['learn', learnHtml], ['cheat', cheatHtml]]) for (const x of h.matchAll(/href="#\/learn\/([\w-]+)"/g)) { anchors++; if (!ids.has(x[1])) fail(`${name}: broken anchor #/learn/${x[1]}`); }
for (const need of ['chain', 'combos', 'removal', 'flushdraw', 'potodds', 'sizes', 'outs', 'dirty', 'implied', 'trio', 'mdf', 'alpha', 'bluffvalue', 'evcall', 'evbluff', 'semibluff', 'blockers', 'mdfguard', 'buckets', 'kit', 'example']) if (!ids.has(need)) fail('learn missing section ' + need);
if (!/Table kit（實戰八招）/.test(cheatHtml) || (cheatHtml.match(/<li>/g) || []).length < 8) fail('cheat sheet table kit missing');
if (/§/.test(learnHtml)) fail('unresolved § reference in learn');
// every section has formula/legend/example/derivation where applicable
const secCount = ids.size, derivCount = (learnHtml.match(/class="derive"/g) || []).length, legCount = (learnHtml.match(/class="leg"/g) || []).length;
// suit colouring: no bare suit symbol outside an ic span in rendered pages
for (const [name, h] of [['learn', learnHtml], ['cheat', cheatHtml]]) {
  const bare = h.replace(/<span class="ic [shdc]">[2-9TJQKA]?[♠♥♦♣]<\/span>/g, '').replace(/<[^>]*>/g, '');
  if (/[♠♥♦♣]/.test(bare)) fail(`${name}: uncoloured suit symbol found`);
}
console.log(`Learn/cheat: ${secCount} sections, ${legCount} legends, ${derivCount} derivations, ${out.learn.length} recorded example numbers, ${arithChecked} prose equations checked (${arithSkipped} skipped), ${anchors} anchor links`);

const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'spots.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`JS-side: generated ${Object.values(out.drills).reduce((s, a) => s + a.length, 0)} drill items (${N} spots/drill) in ${genMs} ms; JS self-checks failed: ${jsFail}`);
jsFails.forEach((m) => console.log('  JS FAIL', m));
let py;
try { py = execFileSync(PY, [path.join(__dirname, 'verify.py'), file], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
catch (e) { console.log(e.stdout || ''); console.error(e.stderr || e.message); process.exit(1); }
process.stdout.write(py);
const pyFail = /TOTAL FAILURES: (\d+)/.exec(py);
const total = jsFail + (pyFail ? +pyFail[1] : 1);
console.log(total === 0 ? '\nALL TESTS PASSED ✅' : `\nFAILURES: ${total} ❌`);
process.exit(total === 0 ? 0 : 1);
