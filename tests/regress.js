#!/usr/bin/env node
/* Regression tests for P1–P4 fixes and the Bubble Call Drill (ICM maths, bank, grading). Usage: node tests/regress.js */
'use strict';
require('../js/core.js'); require('../js/drills.js'); require('../data/bubble_bank.js'); require('../js/bubble.js');
const PT = globalThis.PT;
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } };
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;

// ---- P1: draw labels must come from the hole cards, not from the board alone ----
function genuineDraw(combo, board5, dead) { // independent check: some river/turn card where combo makes flush/straight but board+card does not
  const out = { fl: false, st: false };
  for (const n of [3, 4]) {
    const b = board5.slice(0, n);
    if (PT.evaluate(combo.concat(b)).cat >= 4) continue;
    for (const x of PT.fullDeck()) {
      if (b.includes(x) || combo.includes(x) || dead.has(x)) continue;
      const w = PT.evaluate(combo.concat(b, [x])), bo = PT.evaluate(b.concat([x]));
      if ((w.cat === 5 || w.cat === 8) && bo.cat < 5) out.fl = true;
      if (w.cat === 4 && bo.cat < 4) out.st = true;
    }
  }
  return out;
}
function oldDrawType(combo, board5, dead) { // pre-fix logic, to show the bug existed
  let fl = false, st = false;
  for (const n of [3, 4]) {
    const b = board5.slice(0, n);
    if (PT.evaluate(combo.concat(b)).cat >= 4) continue;
    for (const x of PT.fullDeck()) {
      if (b.includes(x) || combo.includes(x) || dead.has(x)) continue;
      const e = PT.evaluate(combo.concat(b, [x])).cat;
      if (e === 5 || e === 8) fl = true; else if (e === 4) st = true;
    }
  }
  return fl && st ? 'combo draw' : fl ? 'flush draw' : st ? 'straight draw' : null;
}
let p1Labels = 0, p1Bad = 0, p1OldBad = 0, p1Spots = 0;
for (let seed = 1; seed <= 300; seed++) {
  let sp; try { sp = PT.gen4BSpot(PT.makeRng(seed)); } catch (e) { continue; }
  p1Spots++;
  const bs = new Set(sp.board);
  for (const r of sp.rows) {
    if (r.res !== 'bluff') continue;
    const g = genuineDraw(r.combo, sp.board, bs);
    const lbl = r.draw;
    if (lbl) p1Labels++;
    const wantFl = lbl === 'flush draw' || lbl === 'combo draw', wantSt = lbl === 'straight draw' || lbl === 'combo draw';
    if (wantFl !== g.fl || wantSt !== g.st) { p1Bad++; if (p1Bad <= 5) console.log('  P1 mislabel', seed, r.combo.join(''), sp.board.join(''), lbl, g); }
    const old = oldDrawType(r.combo, sp.board, bs);
    if (old !== lbl && ((old === 'flush draw' || old === 'combo draw') !== g.fl || (old === 'straight draw' || old === 'combo draw') !== g.st)) p1OldBad++;
  }
}
// targeted: turn board already four-to-a-flush: a low off-suit combo is NOT a flush draw
{
  const board = ['2h', '7h', 'Jh', 'Kh', '3c'], combo = ['9s', '4d'];
  check(PT._drawType(combo, board, new Set(board)) === null, 'P1 board 4-flush labelled a draw for 9s4d');
  const board2 = ['5c', '6d', '7h', '8s', 'Kd'];
  check(PT._drawType(['2c', '2d'], board2, new Set(board2)) === null, 'P1 board 4-straight labelled 22 as straight draw');
  check(PT._drawType(['Ah', 'Qh'], ['2h', '7h', '3c', 'Kd', '9s'], new Set(['2h', '7h', '3c', 'Kd', '9s'])) === 'flush draw', 'P1 real nut flush draw missed');
}
check(p1Bad === 0, `P1 ${p1Bad} board-made mislabels`);
console.log(`P1: seeds 1..300 → ${p1Spots} 4B spots, ${p1Labels} draw labels on bluffs, mislabels after fix: ${p1Bad} (old logic would mislabel: ${p1OldBad})`);

// ---- P2: spaced repetition ----
{
  const e = { stage: 0, miss: 1, due: 2 };
  PT.srApply(e, true, 5); // reviewed late at session 5
  check(e.due === 5 + PT.SR_OFFSETS[1], `P2 due after correct = ${e.due}, expected session+offset ${5 + PT.SR_OFFSETS[1]}`);
  check(!PT.srIsDue(e, 5), 'P2 item seen this session still counted due');
  const e2 = { stage: 0, miss: 1, due: 2, lastSeen: 3 };
  check(!PT.srIsDue(e2, 3) && PT.srIsDue(e2, 4), 'P2 lastSeen filter');
  const e3 = { stage: 2, miss: 1, due: 4 };
  check(PT.srApply(e3, true, 6) === false, 'P2 graduation');
  const e4 = { stage: 1, miss: 1, due: 4 }; PT.srApply(e4, false, 9);
  check(e4.stage === 0 && e4.due === 10 && e4.lastSeen === 9, 'P2 miss resets');
  const fs = require('fs'); const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  check(!/x\.due <= session\)/.test(app) && !/e\.miss \+ SR_OFFSETS/.test(app), 'P2 app.js still has old due logic');
}
console.log('P2: srApply/srIsDue checks done');

// ---- P3: CSS mobile grid ----
{
  const css = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
  check(/\.grid13\{[^}]*font-size:clamp\(10px/.test(css), 'P3 grid min font 10px');
  check(/\.top nav a\{[^}]*min-height:44px/.test(css), 'P3 nav min-height 44px');
  const m = /\.cell\{[^}]*color:#([0-9a-f]{6})/.exec(css);
  const lum = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = m ? (lum('f1f4f1') + 0.05) / (lum(m[1]) + 0.05) : 0;
  check(ratio >= 4.5, `P3 out-of-range cell contrast ${ratio.toFixed(2)} < 4.5`);
  check(/cellzoom/.test(require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8')), 'P3 tap-to-zoom missing');
  console.log(`P3: out-of-range cell text contrast ${ratio.toFixed(2)}:1`);
}

// ---- P4: 4C sign only required when |ev| > tolAbs ----
{
  let small = 0, big = 0;
  for (let s = 1; s <= 3000; s++) {
    const q = PT.drills['4C'].generate(PT.makeRng(s));
    const ev = q.answer.ev, tol = Math.max(0.15 * Math.abs(ev), 0.5);
    if (Math.abs(ev) <= tol) { // near-zero: an answer of opposite sign but within tolerance is OK
      const v = ev > 0 ? ev - tol * 0.99 : ev + tol * 0.99;
      if (Math.sign(v) !== Math.sign(ev) && v !== 0) { small++; check(q.grade({ ev: v.toFixed(4) }).ok, `P4 seed ${s} near-zero EV opposite sign rejected`); }
    } else { big++; check(!q.grade({ ev: (-ev).toFixed(2) }).ok, `P4 seed ${s} wrong sign accepted`); }
  }
  console.log(`P4: ${small} near-zero spots accept opposite sign within tol, ${big} spots still require sign`);
}

// ---- Bubble: ICM ----
{
  const a = PT.icm([25, 25, 25, 25]); check(a.every((x) => near(x, 25)), 'ICM equal 4 stacks → 25 each');
  const b = PT.icm([10, 10, 10]); check(b.every((x) => near(x, 100 / 3)), 'ICM equal 3 stacks → 33.33 each');
  const A = PT.icm([50, 30, 20]); check(near(A[0], 38.393) && near(A[1], 32.75) && near(A[2], 28.857), 'ICM Test A ' + A.map((x) => x.toFixed(3)));
  const B = PT.icm([40, 30, 20, 10]); check(near(B[0], 33.603) && near(B[1], 29.488) && near(B[2], 23.587) && near(B[3], 13.321), 'ICM Test B ' + B.map((x) => x.toFixed(3)));
  check(near(PT.icm([30, 0, 20, 10])[1], 0), 'busted player gets 0');
  console.log(`ICM: equal → ${b.map((x) => x.toFixed(2))}; A → ${A.map((x) => x.toFixed(3))}; B → ${B.map((x) => x.toFixed(3))}`);
}
// ---- Bubble: bank consistency (JS recompute vs Python) + counts + grading ----
{
  const Q = PT.BUBBLE_BANK.questions;
  let premium = 0, call = 0, short = 0, marg = 0;
  for (const q of Q) {
    const s = PT.bubbleSpot(q.stacks, q.villainPos, q.heroPos);
    check(near(s.F, q.F, 2e-3) && near(s.W, q.W, 2e-3) && near(s.L, q.L, 2e-3), `bank q${q.id} F/W/L mismatch`);
    check(near(s.chipThr, q.chipThr, 1e-4) && near(s.icmThr, q.icmThr, 1e-4) && near(s.call, q.call) && near(s.pot, q.pot), `bank q${q.id} thresholds mismatch`);
    check(['CO', 'BTN', 'SB'].includes(q.villainPos) && ['SB', 'BB'].includes(q.heroPos) && q.villainPos !== q.heroPos, `bank q${q.id} positions`);
    check(Object.values(q.stacks).every((x) => x >= 8 && x <= 40), `bank q${q.id} stacks range`);
    check(!q.villainShown.some((c) => q.hero.includes(c)), `bank q${q.id} card overlap`);
    const busts = q.stacks[q.heroPos] <= q.stacks[q.villainPos];
    if (busts) check(q.L === 0, `bank q${q.id} busted hero should get 0`);
    const cat = q.eq >= q.icmThr ? 'call' : q.eq >= q.chipThr ? 'premium' : 'short';
    if (cat === 'premium') premium++; else if (cat === 'call') call++; else short++;
    if (q.margChip || q.margIcm) marg++;
    // grading
    const g = PT.gradeBubble(q, cat === 'call' ? 'call' : 'fold', cat === 'call' ? 'enough' : cat);
    check(g.ok, `bank q${q.id} correct answer graded wrong`);
    const gw = PT.gradeBubble(q, cat === 'call' ? 'fold' : 'call', 'enough');
    if (!q.margIcm) check(!gw.ok, `bank q${q.id} wrong action graded right`);
    else check(gw.actOk, `bank q${q.id} marginal action should accept both`);
    if (q.margIcm || q.margChip) check(!g.reasonScored, `bank q${q.id} marginal reason scored`);
    // drill wrapper
  }
  check(Q.length >= 30, 'bank size ≥ 30');
  check(premium >= 10, 'bank needs ≥10 chip-EV call / ICM fold');
  const q0 = PT.drills.BUB.generate(PT.makeRng(7));
  check(q0.grade({ action: q0.answer.action, reason: q0.answer.q.eq >= q0.answer.q.icmThr ? 'enough' : q0.answer.q.eq >= q0.answer.q.chipThr ? 'premium' : 'short' }).ok, 'BUB drill grade');
  check(/？/.test(q0.extraHtml) && !q0.answer.q.villainShown.some((c) => q0.extraHtml.includes(c)), 'villain cards hidden in question');
  console.log(`Bubble bank: ${Q.length} questions · chip-EV call but ICM fold ${premium} · clear call ${call} · equity short ${short} · marginal (reason not scored) ${marg}`);
}
console.log(fails ? `\nREGRESSION FAILURES: ${fails} ❌` : '\nREGRESSION TESTS PASSED ✅');
process.exit(fails ? 1 : 0);
