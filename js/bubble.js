/* Bubble Call Drill (SPEC v1.1): ICM maths (Harville/Malmuth) + drill using the offline question bank (data/bubble_bank.js) */
(function (G) {
  'use strict';
  const PT = (G.PT = G.PT || {});
  const POS = ['CO', 'BTN', 'SB', 'BB'];
  const BLIND = { CO: 0, BTN: 0, SB: 0.5, BB: 1 };
  const PAYOUTS = [50, 30, 20];
  const TOL = 0.015;
  const POS_ZH = { CO: 'CO', BTN: 'BTN（莊）', SB: 'SB（細盲）', BB: 'BB（大盲）' };

  /** Harville/Malmuth ICM: chance to finish 1st = stack share; then recurse on the rest. Returns $EV per player. */
  function icm(stacks, payouts) {
    payouts = payouts || PAYOUTS;
    const n = stacks.length, ev = new Array(n).fill(0);
    const memo = new Map();
    function rec(mask, place) { // $EV contributions for players in mask from `place` onwards
      const key = mask * 16 + place;
      if (memo.has(key)) return memo.get(key);
      const out = new Array(n).fill(0);
      if (place < payouts.length && mask) {
        let tot = 0;
        for (let i = 0; i < n; i++) if (mask & (1 << i)) tot += stacks[i];
        for (let i = 0; i < n; i++) {
          if (!(mask & (1 << i))) continue;
          const p = stacks[i] / tot;
          out[i] += p * payouts[place];
          const sub = rec(mask & ~(1 << i), place + 1);
          for (let j = 0; j < n; j++) out[j] += p * sub[j];
        }
      }
      memo.set(key, out);
      return out;
    }
    let mask = 0;
    for (let i = 0; i < n; i++) if (stacks[i] > 1e-12) mask |= 1 << i; // busted players get nothing
    const r = rec(mask, 0);
    for (let i = 0; i < n; i++) ev[i] = r[i];
    return ev;
  }
  PT.icm = icm;

  /** Everyone's stacks after Fold / Win / Lose and Hero's $EV in each. stacks = {CO,BTN,SB,BB} before blinds. */
  function bubbleSpot(stacks, vpos, hpos) {
    const eff = Math.min(stacks[vpos], stacks[hpos]);
    const dead = POS.filter((p) => p !== vpos && p !== hpos).reduce((s, p) => s + BLIND[p], 0);
    const pot = 2 * eff + dead, call = eff - BLIND[hpos];
    const after = (k) => {
      const st = {};
      for (const p of POS) st[p] = stacks[p] - BLIND[p];
      if (k === 'F') { st[hpos] = stacks[hpos] - BLIND[hpos]; st[vpos] = stacks[vpos] + BLIND[hpos] + dead; }
      else { const w = k === 'W'; st[hpos] = stacks[hpos] - eff + (w ? pot : 0); st[vpos] = stacks[vpos] - eff + (w ? 0 : pot); }
      return st;
    };
    const res = { eff, dead, pot, call, chipThr: call / pot, scen: {} };
    for (const k of ['F', 'W', 'L']) {
      const st = after(k), ev = icm(POS.map((p) => st[p]));
      res.scen[k] = { stacks: st, ev: Object.fromEntries(POS.map((p, i) => [p, ev[i]])) };
      res[k] = ev[POS.indexOf(hpos)];
    }
    res.icmThr = (res.F - res.L) / (res.W - res.L);
    res.rp = res.icmThr - res.chipThr;
    return res;
  }
  PT.bubbleSpot = bubbleSpot;

  const REASONS = [['enough', '夠 equity'], ['premium', 'Risk premium 食晒 edge'], ['short', 'Equity 唔夠']];
  /** grading rules (pure, unit-tested) */
  function gradeBubble(q, action, reason) {
    const eq = q.eq;
    const margIcm = Math.abs(eq - q.icmThr) <= TOL, margChip = Math.abs(eq - q.chipThr) <= TOL;
    const correctAct = eq >= q.icmThr ? 'call' : 'fold';
    const correctReason = eq >= q.icmThr ? 'enough' : eq >= q.chipThr ? 'premium' : 'short';
    const actOk = action === correctAct || (margIcm && (action === 'call' || action === 'fold'));
    const reasonScored = !(margIcm || margChip);
    const reasonOk = !reasonScored || reason === correctReason;
    return { ok: actOk && reasonOk, actOk, reasonOk, reasonScored, correctAct, correctReason, margIcm, margChip };
  }
  PT.gradeBubble = gradeBubble;
  PT.BUBBLE_REASONS = REASONS;

  const f1 = (x) => (x * 100).toFixed(1) + '%';
  const d2 = (x) => (Math.round(x * 100) / 100).toString();
  const bb = (x) => (Math.round(x * 10) / 10).toString();
  const cardH = (c) => { const r = c[0] === 'T' ? '10' : c[0], u = PT.SUIT_SYM[c[1]]; return `<div class="pcard ${c[1]}" aria-label="${r}${u}"><span class="cr">${r}<i>${u}</i></span><span class="cu">${u}</span><span class="cr br">${r}<i>${u}</i></span></div>`; };
  const hidden = '<div class="pcard hidden" aria-label="未知">？</div><div class="pcard hidden" aria-label="未知">？</div>';

  function seatsHtml(q, st, showEv) {
    return '<div class="seats">' + POS.map((p) => {
      const cls = p === q.heroPos ? ' hero' : p === q.villainPos ? ' vil' : '';
      const role = p === q.heroPos ? '你 Hero' : p === q.villainPos ? 'Villain（all-in）' : 'fold';
      return `<div class="seat${cls}"><b>${POS_ZH[p]}</b> · ${role}<br>${bb(st[p])}bb${showEv ? ` · $EV ${d2(showEv[p])}` : ''}</div>`;
    }).join('') + '</div>';
  }

  function icmCard(q) {
    const s = q.scen;
    const callEv = q.eq * q.W + (1 - q.eq) * q.L;
    return `<div class="icmcard"><b>ICM 快讀 quick-read</b>（獎金池 100 units：第一 50 / 第二 30 / 第三 20 / 第四 0）
      <table><tr><th>情況</th><th>你嘅 stack</th><th class="num">你嘅 $EV</th></tr>
      <tr><td>F = Fold（棄牌，輸咗盲注）</td><td>${bb(s.F.stacks[q.heroPos])}bb</td><td class="num">${d2(q.F)}</td></tr>
      <tr><td>W = Call 贏</td><td>${bb(s.W.stacks[q.heroPos])}bb</td><td class="num">${d2(q.W)}</td></tr>
      <tr><td>L = Call 輸</td><td>${bb(s.L.stacks[q.heroPos])}bb${s.L.stacks[q.heroPos] <= 0 ? '（出局 = 第四名 = 0）' : ''}</td><td class="num">${d2(q.L)}</td></tr>
      <tr><td>你嘅 equity（vs 佢成個 range）</td><td></td><td class="num"><b>${f1(q.eq)}</b></td></tr>
      <tr><td>Chip EV 門檻 = call ÷ final pot</td><td>${bb(q.call)} ÷ ${bb(q.pot)}</td><td class="num">${f1(q.chipThr)}</td></tr>
      <tr><td>ICM 門檻 = (F − L) ÷ (W − L)</td><td>(${d2(q.F)} − ${d2(q.L)}) ÷ (${d2(q.W)} − ${d2(q.L)})</td><td class="num">${f1(q.icmThr)}</td></tr>
      <tr><td>Risk premium = ICM 門檻 − chip 門檻</td><td></td><td class="num">${f1(q.rp)}</td></tr></table>
      <div class="leg muted" style="font-size:.85rem;margin-top:.3rem">符號：F / W / L = 你 fold / call 贏 / call 輸 之後嘅獎金期望值（$EV，單位係獎金池 units）；equity = 你 call 落去最後贏嘅機會（打和當半）。</div>
      <div class="plain" style="margin-top:.4rem"><b>白話：</b>
      ① Chip 角度：你要畀 ${bb(q.call)}bb 去爭 ${bb(q.pot)}bb 嘅 pot，所以贏 ${f1(q.chipThr)} 以上就有籌碼賺。<br>
      ② ICM 角度：fold 你保住 ${d2(q.F)}；call 贏變 ${d2(q.W)}（多 ${d2(q.W - q.F)}），call 輸變 ${d2(q.L)}（少 ${d2(q.F - q.L)}）。輸嘅代價${q.F - q.L > q.W - q.F ? '大過' : '細過'}贏嘅好處，所以要贏 ${f1(q.icmThr)} 先抵 call。<br>
      ③ 兩個門檻差 ${f1(q.rp)} 就係 risk premium：泡沫期出局冇錢收，所以要多啲 equity 先值得冒險。<br>
      ④ 你有 ${f1(q.eq)}：${q.eq >= q.icmThr ? '高過 ICM 門檻 → <b>夠 equity，call</b>。' : q.eq >= q.chipThr ? '高過 chip 門檻但低過 ICM 門檻 → chip 上係 call，但 <b>risk premium 食晒 edge，fold</b>。' : '連 chip 門檻都唔夠 → <b>equity 唔夠，fold</b>。'}
      Call 嘅 $EV ≈ ${f1(q.eq)} × ${d2(q.W)} + ${f1(1 - q.eq)} × ${d2(q.L)} = ${d2(callEv)}，fold = ${d2(q.F)}。</div></div>`;
  }
  PT.bubbleIcmCard = icmCard;

  const bank = () => (PT.BUBBLE_BANK && PT.BUBBLE_BANK.questions) || [];
  PT.drills = PT.drills || {};
  PT.drills.BUB = {
    level: 0, title: 'ICM 泡沫期 Call 唔 Call', desc: '4 走 3：chip EV 門檻 vs ICM 門檻 → call / fold + 原因', target: 45,
    generate(rng) {
      const Q = bank();
      if (!Q.length) throw new Error('bubble bank not loaded');
      const q = Q[Math.floor(rng() * Q.length)];
      const preSt = {};
      for (const p of POS) preSt[p] = q.stacks[p];
      const promptHtml = `<b>錦標賽泡沫期</b>：剩 4 個人，頭 3 名有錢（獎金池 50 / 30 / 20 units，第四名 0）。盲注 SB 0.5bb / BB 1bb，<b>冇 ante</b>。
        ${seatsHtml(q, preSt)}
        <b>${POS_ZH[q.villainPos]}</b> all-in ${bb(q.stacks[q.villainPos])}bb，其他人 fold，輪到你喺 <b>${POS_ZH[q.heroPos]}</b>。
        有效籌碼 ${bb(q.eff)}bb；你要再加 <b>${bb(q.call)}bb</b>（已扣你落咗嘅盲注）去 call，final pot <b>${bb(q.pot)}bb</b>。<br>
        <span class="muted" style="font-size:.88rem">Villain shove range（教學假設 teaching assumption）：${q.villainRange}（扣你手牌後 ${q.villainCombos} combos）</span>`;
      return {
        drill: 'BUB', target: 45, board: [], hero: q.hero, data: { id: q.id },
        promptHtml,
        extraHtml: `<div class="cardsrow"><span class="lbl">Villain</span>${hidden}</div>`,
        revealHtml: `<div class="cardsrow"><span class="lbl">Villain</span>${q.villainShown.map(cardH).join('')}<span class="muted" style="font-size:.85rem">（今次佢攤呢手；決定係對佢成個 range 計）</span></div>`,
        inputs: [{ key: 'reason', label: '原因', kind: 'choice', options: REASONS }],
        actions: ['call', 'fold'],
        answer: { action: q.eq >= q.icmThr ? 'call' : 'fold', q },
        grade: (r) => {
          const g = gradeBubble(q, r.action, r.reason);
          const name = (k) => (REASONS.find((x) => x[0] === k) || [0, '—'])[1];
          return { ok: g.ok, rows: [
            { label: 'Call / Fold', your: r.action || '—', correct: g.correctAct + (g.margIcm ? '（±1.5% 邊緣：兩樣都算啱）' : ''), ok: g.actOk },
            { label: '原因', your: name(r.reason), correct: name(g.correctReason) + (g.reasonScored ? '' : '（邊緣位，原因唔計分）'), ok: g.reasonOk },
          ] };
        },
        solutionHtml: icmCard(q),
      };
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
