/* UI: router, drill runner, timer, stats (localStorage), level gates, spaced repetition, cheat sheet, settings */
(function () {
  'use strict';
  const PT = window.PT, M = PT.math;
  const $app = document.getElementById('app');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pt1.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pt1.' + k, JSON.stringify(v)); } catch (e) { /* storage full or disabled */ } },
  };
  const settings = Object.assign({ fourColor: false, timerMode: 'stopwatch', decisionOnly: false, loose4B: false }, LS.get('settings', {}));
  const saveSettings = () => { LS.set('settings', settings); applySettings(); };
  function applySettings() { document.body.classList.toggle('fourcolor', !!settings.fourColor); }
  applySettings();

  // ----- sessions (for spaced repetition: missed items return after 1, 3, 7 sessions) -----
  const now = Date.now();
  let session = LS.get('session', 0);
  if (now - LS.get('lastActive', 0) > 30 * 60 * 1000) { session++; LS.set('session', session); }
  const touch = () => LS.set('lastActive', Date.now());
  touch();
  const SR_OFFSETS = [1, 3, 7];

  // ----- history -----
  let history = LS.get('history', []);
  function record(item) {
    history.push(item);
    if (history.length > 6000) history = history.slice(-6000);
    LS.set('history', history);
    touch();
  }
  const itemsFor = (ids) => history.filter((h) => ids.includes(h.d));
  function gateStats(items) {
    const last = items.slice(-50);
    const n = last.length;
    const acc = n ? last.filter((x) => x.ok).length / n : 0;
    const medT = M.median(last.map((x) => x.t / 1000));
    const medRatio = M.median(last.map((x) => x.t / 1000 / x.target));
    const ready = n ? last.filter((x) => x.ok && x.t / 1000 <= x.target).length / n : 0;
    return { n, acc, medT, medRatio, ready, pass: n >= 50 && acc >= 0.9 && medRatio <= 1 };
  }
  PT.gateStats = gateStats;

  // ----- spaced repetition queue -----
  let srq = LS.get('srq', []);
  const saveSrq = () => LS.set('srq', srq);
  function srMiss(drill, seed) {
    srq = srq.filter((x) => !(x.drill === drill && x.seed === seed));
    srq.push({ drill, seed, stage: 0, miss: session, due: session + SR_OFFSETS[0] });
    saveSrq();
  }
  function srReviewed(entry, ok) {
    const e = srq.find((x) => x.drill === entry.drill && x.seed === entry.seed);
    if (!e) return;
    if (!ok) { e.stage = 0; e.miss = session; e.due = session + SR_OFFSETS[0]; }
    else { e.stage++; if (e.stage >= SR_OFFSETS.length) srq = srq.filter((x) => x !== e); else e.due = e.miss + SR_OFFSETS[e.stage]; }
    e.lastSeen = session;
    saveSrq();
  }
  const dueFor = (drill) => srq.filter((x) => x.drill === drill && x.due <= session && x.lastSeen !== session);

  // ----- helpers -----
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (x) => (isNaN(x) ? '—' : (x * 100).toFixed(0) + '%');
  const sec = (x) => (isNaN(x) ? '—' : x.toFixed(1) + 's');
  const cardHtml = (c, isNew) => `<div class="pcard ${c[1]}${isNew ? ' newc' : ''}"><span class="r">${c[0] === 'T' ? '10' : c[0]}</span><span class="u">${PT.SUIT_SYM[c[1]]}</span></div>`;
  function setNav(name) { document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name)); }
  function currentLevel() {
    for (const L of PT.LEVELS) { if (L.soon) continue; if (!gateStats(itemsFor(L.drills)).pass) return L.level; }
    return 5;
  }

  // ----- timer -----
  let timer = null;
  function stopTimer() { if (timer) { cancelAnimationFrame(timer.raf); timer = null; } }
  function startTimer(target, onTimeout) {
    stopTimer();
    const t0 = performance.now();
    const limit = settings.timerMode === 'countdown' ? Math.ceil(target * 1.5) : null;
    const el = document.getElementById('timer'), bar = document.getElementById('tbar');
    timer = { t0, raf: 0 };
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      if (el) {
        if (limit) { const left = Math.max(0, limit - s); el.textContent = left.toFixed(1) + 's'; el.classList.toggle('over', s > target); }
        else { el.textContent = s.toFixed(1) + 's'; el.classList.toggle('over', s > target); }
      }
      if (bar) { bar.firstElementChild.style.width = Math.min(100, (s / (limit || target)) * 100) + '%'; bar.classList.toggle('over', s > target); }
      if (limit && s >= limit) { onTimeout(); return; }
      timer.raf = requestAnimationFrame(tick);
    };
    timer.raf = requestAnimationFrame(tick);
    return () => performance.now() - t0;
  }

  // ----- views -----
  function viewHome() {
    setNav('home');
    const cur = currentLevel();
    const due = srq.filter((x) => x.due <= session).length;
    let h = `<h1>NLHE combinatorics & EV 訓練</h1>
      <div class="panel">建議而家練：<b>Level ${cur}</b>　·　Session #${session}　·　待複習 (spaced repetition)：<b>${due}</b> 題
      <div class="muted" style="font-size:.85rem">升級條件：該 level 最近 50 題 accuracy ≥ 90% <u>同</u> median 時間 ≤ table-ready target（各 drill 用自己嘅 target 計）。</div></div>`;
    for (const L of PT.LEVELS) {
      if (L.soon) { h += `<div class="panel level muted"><div class="head"><b>${L.name}</b><span class="badge">v2</span></div></div>`; continue; }
      const g = gateStats(itemsFor(L.drills));
      h += `<div class="panel level"><div class="head"><b>${L.name}</b>
        <span class="badge ${g.pass ? 'ok' : g.n ? 'warn' : ''}">${g.pass ? '✓ 已達標 cleared' : `最近 ${g.n}/50 · ${pct(g.acc)} · median ${g.n ? (g.medRatio * 100).toFixed(0) + '% of target' : '—'}`}</span></div>
        <div class="drills">`;
      for (const id of L.drills) {
        const D = PT.drills[id];
        const s = gateStats(itemsFor([id]));
        const dueN = srq.filter((x) => x.drill === id && x.due <= session).length;
        h += `<button class="drillbtn" data-go="#/drill/${id}"><div class="t">${D.title}</div><div class="d">${D.desc}</div>
          <div class="s">Target ≤ ${D.target}s · ${s.n ? `${pct(s.acc)} 準確 · median ${sec(s.medT)}` : '未練過'}${dueN ? ` · <span class="review">複習 ${dueN}</span>` : ''}</div>
          <div class="bar"><i style="width:${Math.min(100, s.n * 2)}%"></i></div></button>`;
      }
      h += '</div></div>';
    }
    $app.innerHTML = h;
    $app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  }

  // drill runner state
  let run = null;
  function viewDrill(id) {
    setNav('home');
    const D = PT.drills[id];
    if (!D) { location.hash = '#/'; return; }
    run = { id, D, q: null, step: 0, answered: false, sessionCount: 0, sessionOk: 0 };
    nextQuestion();
  }
  function nextQuestion() {
    const { id, D } = run;
    const due = dueFor(id);
    let seed, review = null;
    if (due.length) { review = due[0]; seed = review.seed; }
    else seed = PT.newSeed();
    const opts = { decisionOnly: settings.decisionOnly, loose: settings.loose4B };
    let q;
    try { q = D.generate(PT.makeRng(seed), opts); }
    catch (e) { seed = PT.newSeed(); review = null; q = D.generate(PT.makeRng(seed), opts); }
    run.seed = seed; run.review = review; run.full = q; run.step = 0; run.stepOk = true;
    showStep();
  }
  function showStep() {
    const q = run.full.steps ? run.full.steps[run.step] : run.full;
    run.q = q; run.answered = false;
    const D = run.D;
    const prevBoardLen = run.full.steps && run.step ? run.full.steps[run.step - 1].board.length : null;
    let h = `<div class="dhead"><div><a href="#/">← 返回</a>　<b>${D.title}</b> ${run.review ? '<span class="review">複習 review</span>' : ''}
      <div class="muted" style="font-size:.85rem">Table-ready target ≤ ${q.target}s · 今次 ${run.sessionOk}/${run.sessionCount}${run.full.steps ? ` · 第 ${run.step + 1}/${run.full.steps.length} 步` : ''}</div></div>
      <div class="timer" id="timer">0.0s</div></div><div class="tbar" id="tbar"><i></i></div><div class="panel">`;
    if (q.board && q.board.length) h += `<div class="cardsrow"><span class="lbl">Board</span>${q.board.map((c, i) => cardHtml(c, prevBoardLen !== null && i >= prevBoardLen)).join('')}</div>`;
    if (q.hero && q.hero.length) h += `<div class="cardsrow"><span class="lbl">你 Hero</span>${q.hero.map((c) => cardHtml(c)).join('')}</div>`;
    h += `<div class="prompt">${q.promptHtml}</div>`;
    if (q.extraHtml) h += `<div id="extra">${q.extraHtml}</div>`;
    h += '<form class="ans" id="ansform" autocomplete="off">';
    for (const inp of q.inputs) {
      h += `<label>${inp.label}${inp.kind === 'pct' ? ' (%)' : ''}<input name="${inp.key}" inputmode="${inp.kind === 'int' ? 'numeric' : 'decimal'}" ${inp.kind === 'num' ? '' : 'pattern="[0-9.,%]*"'} enterkeyhint="done"></label>`;
    }
    if (q.actions) h += q.actions.map((a) => `<button type="button" class="btn ${a}" data-act="${a}">${a === 'call' ? 'Call 跟注' : 'Fold 棄牌'} <kbd>${a[0].toUpperCase()}</kbd></button>`).join('');
    else h += '<button class="btn" type="submit">提交 <kbd>Enter</kbd></button>';
    h += '</form><div id="fb"></div></div>';
    $app.innerHTML = h;
    const form = document.getElementById('ansform');
    form.addEventListener('submit', (e) => { e.preventDefault(); if (!q.actions) submit(); });
    form.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.act)));
    const first = form.querySelector('input');
    if (first && !matchMedia('(pointer:coarse)').matches) first.focus();
    run.elapsed = startTimer(q.target, () => submit(null, true));
  }
  function submit(action, timeout) {
    if (!run || run.answered) return;
    const q = run.q;
    const ms = run.elapsed();
    stopTimer();
    run.answered = true;
    const resp = { action: action || null };
    document.querySelectorAll('#ansform input').forEach((i) => { resp[i.name] = i.value; i.disabled = true; });
    document.querySelectorAll('#ansform button').forEach((b) => (b.disabled = true));
    const g = q.grade(resp);
    const ok = g.ok && !timeout;
    record({ d: q.drill, ok, t: Math.round(ms), target: q.target, ts: Date.now(), seed: run.seed, s: session, rv: run.review ? 1 : 0 });
    run.sessionCount++; if (ok) run.sessionOk++;
    if (!ok) run.stepOk = false;
    const lastStep = !run.full.steps || run.step === run.full.steps.length - 1;
    if (lastStep) {
      if (run.review) srReviewed(run.review, run.stepOk);
      else if (!run.stepOk) srMiss(q.drill, run.seed);
    }
    const s = ms / 1000;
    const readyBadge = ok && s <= q.target ? '<span class="badge ok">⚡ table-ready</span>' : ok ? '<span class="badge warn">啱，但慢過 target</span>' : '';
    let h = `<div class="fb"><div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ 正確' : timeout ? '⏱ 超時' : '✗ 唔啱'} <span class="muted" style="font-size:1rem">${s.toFixed(1)}s / target ${q.target}s</span> ${readyBadge}</div>
      <table class="res"><tr><th></th><th>你</th><th>答案</th></tr>${g.rows.map((r) => `<tr><td>${r.label}</td><td class="${r.ok ? 'ok' : 'bad'}">${esc(r.your)}</td><td>${esc(r.correct)}</td></tr>`).join('')}</table>
      <div class="solution">${q.solutionHtml}</div>
      <div class="row" style="margin-top:.8rem"><button class="btn" id="nextbtn">${lastStep ? '下一題' : '下一條街'} <kbd>Enter</kbd></button><a href="#/">返主頁</a></div></div>`;
    document.getElementById('fb').innerHTML = h;
    if (q.revealHtml) document.getElementById('extra').innerHTML = q.revealHtml;
    const nb = document.getElementById('nextbtn');
    nb.addEventListener('click', advance);
    nb.focus({ preventScroll: true });
    document.getElementById('fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function advance() {
    if (!run) return;
    if (run.full.steps && run.step < run.full.steps.length - 1) { run.step++; showStep(); }
    else nextQuestion();
  }

  function viewStats() {
    setNav('stats'); stopTimer(); run = null;
    let h = '<h1>統計 Stats</h1>';
    for (const L of PT.LEVELS) {
      if (L.soon) continue;
      const g = gateStats(itemsFor(L.drills));
      h += `<div class="panel"><div class="head"><b>${L.name}</b> <span class="badge ${g.pass ? 'ok' : ''}">${g.pass ? '✓ cleared' : '未達標'}</span></div>
        <div class="muted" style="font-size:.85rem">Level 最近 ${g.n}/50 題：accuracy ${pct(g.acc)}（要 ≥ 90%）· median 時間 / target = ${g.n ? (g.medRatio * 100).toFixed(0) + '%' : '—'}（要 ≤ 100%）</div>
        <div class="tblwrap"><table class="tbl"><tr><th>Drill</th><th class="num">總數</th><th class="num">最近50 準確</th><th class="num">Median 時間</th><th class="num">Target</th><th class="num">Table-ready</th><th>Gate</th></tr>`;
      for (const id of L.drills) {
        const all = itemsFor([id]);
        const s = gateStats(all);
        const D = PT.drills[id];
        h += `<tr><td>${D.title}</td><td class="num">${all.length}</td><td class="num">${pct(s.acc)}</td><td class="num">${sec(s.medT)}</td><td class="num">${D.target}s</td><td class="num">${pct(s.ready)}</td><td>${s.pass ? '✓' : s.n < 50 ? `${s.n}/50` : '✗'}</td></tr>`;
      }
      h += '</table></div></div>';
    }
    const recent = history.slice(-25).reverse();
    h += `<div class="panel"><b>最近 25 題</b><div class="tblwrap"><table class="tbl"><tr><th>時間</th><th>Drill</th><th>結果</th><th class="num">用時</th></tr>${recent.map((x) => `<tr><td>${new Date(x.ts).toLocaleString('zh-HK')}</td><td>${x.d}${x.rv ? ' (複習)' : ''}</td><td>${x.ok ? '✓' : '✗'}</td><td class="num">${(x.t / 1000).toFixed(1)}s</td></tr>`).join('') || '<tr><td colspan=4 class="muted">未有紀錄</td></tr>'}</table></div>
      <div class="muted">Spaced-repetition 隊列：${srq.length} 題（${srq.filter((x) => x.due <= session).length} 題今個 session 到期）</div>
      <div class="row" style="margin-top:.6rem"><button class="btn alt" id="exp">匯出 JSON (export)</button><button class="btn alt" id="rst">清除所有紀錄</button></div></div>`;
    $app.innerHTML = h;
    document.getElementById('exp').onclick = () => {
      const blob = new Blob([JSON.stringify({ history, srq, settings, session }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'poker-trainer-stats.json'; a.click();
    };
    document.getElementById('rst').onclick = () => { if (confirm('確定清除所有統計？')) { history = []; srq = []; LS.set('history', []); saveSrq(); viewStats(); } };
  }

  function viewCheat() {
    setNav('cheat'); stopTimer(); run = null;
    const f1 = (x) => (x * 100).toFixed(1) + '%';
    let betRows = '';
    for (const [s, label] of PT.BET_SIZES.concat([[3, '3']])) {
      betRows += `<tr><td>${label}</td><td class="num">${(1 + s) / s % 1 === 0 ? (1 + s) / s : ((1 + s) / s).toFixed(2)}:1</td><td class="num">${f1(M.reqEquity(1, s))}</td><td class="num">${f1(M.mdf(1, s))}</td><td class="num">${f1(M.alpha(1, s))}</td><td class="num">${f1(M.bluffShare(1, s))}</td><td class="num">1 : ${+((1 + s) / s).toFixed(2)}</td></tr>`;
    }
    let outsRows = '';
    for (let x = 1; x <= 21; x++) {
      const r1 = M.outsRule(x, 'turn1'), r2 = M.outsRule(x, 'flop2');
      outsRows += `<tr><td class="num">${x}${{ 4: ' (gutshot)', 8: ' (OESD)', 9: ' (FD)', 15: ' (FD+OESD)' }[x] || ''}</td><td class="num">${f1(M.outsEquity(x, 'flop1'))}</td><td class="num">${f1(M.outsEquity(x, 'turn1'))}</td><td class="num">${r1.est}</td><td class="num">${f1(M.outsEquity(x, 'flop2'))}</td><td class="num">${r2.est}</td></tr>`;
    }
    const grid = [4, 3, 2, 1].map((a) => `<tr><th>${a}</th>${[4, 3, 2, 1].map((b) => `<td class="num">${a * b}</td>`).join('')}</tr>`).join('');
    $app.innerHTML = `<h1>速查表 Cheat sheet</h1>
    <div class="panel"><h2>1. Combos 基本數</h2><div class="tblwrap"><table class="tbl"><tr><th>類型</th><th class="num">Preflop combos</th><th>Card removal 公式</th></tr>
      <tr><td>Pocket pair</td><td class="num">6</td><td>C(n,2) = n(n−1)/2，n = 該 rank 未見張數</td></tr>
      <tr><td>Suited (AKs)</td><td class="num">4</td><td>兩張都未見嘅花色數</td></tr>
      <tr><td>Offsuit (AKo)</td><td class="num">12</td><td>a×b − suited</td></tr>
      <tr><td>Any (AK)</td><td class="num">16</td><td>a×b</td></tr>
      <tr><td>全部起手牌</td><td class="num">1326</td><td>78 pairs + 312 suited + 936 offsuit</td></tr></table></div>
      <p>「未見」= 唔喺 board、唔喺<b>你自己</b>手上。Pair 剩 4/3/2/1 張 → <b>6 / 3 / 1 / 0</b> combos。</p>
      <b>Unpaired a × b grid</b><div class="tblwrap"><table class="tbl" style="max-width:320px"><tr><th>a \\ b</th><th class="num">4</th><th class="num">3</th><th class="num">2</th><th class="num">1</th></tr>${grid}</table></div>
      <p class="muted">例：AK 喺 K-7-2 = 4×3 = 12；K7 = 3×3 = 9；board 有 K 而你又有 K → KQ = 2×4 = 8。Flush draw：two-tone board 每個同花色 suited class = 1 combo。</p></div>
    <div class="panel"><h2>2. 注碼 → pot odds / MDF / alpha / bluff:value</h2>
      <p class="muted">Required equity = B/(P+2B)；MDF = P/(P+B)；alpha = B/(P+B)；river 平衡 bluff% = B/(P+2B)，bluff:value = B : (P+B)。</p>
      <div class="tblwrap"><table class="tbl"><tr><th>Bet (× pot)</th><th class="num">Odds</th><th class="num">Required equity</th><th class="num">MDF</th><th class="num">Alpha</th><th class="num">Bluff %</th><th class="num">Bluff : value</th></tr>${betRows}</table></div>
      <p class="tip">MDF 假設 bluff 係 0 equity，只係防 over-bluff 嘅參考；對 under-bluffer 要 fold 多啲。Bluff:value 比例只適用於 river。</p></div>
    <div class="panel"><h2>3. Outs → equity</h2>
      <div class="tblwrap"><table class="tbl"><tr><th class="num">Outs</th><th class="num">Flop→turn (/47)</th><th class="num">Turn→river (/46)</th><th class="num">×2+1 (≥14: ×2+2)</th><th class="num">Flop all-in (2 張)</th><th class="num">4x − (x−8)</th></tr>${outsRows}</table></div>
      <p class="tip">×4 只適用於 flop all-in（睇晒兩張唔使再面對下注）。Odds against（一張）：FD 4.1:1，OESD 4.75:1，gutshot 10.5:1。Outs 唔一定乾淨：會 pair board、會俾對手更大 flush 嘅要扣。</p></div>
    <div class="panel"><h2>4. EV 快算</h2><div class="tblwrap"><table class="tbl"><tr><th>決定</th><th>精確</th><th>快算</th></tr>
      <tr><td>Call（之後冇下注）</td><td>e(P+B) − (1−e)B</td><td>(e − req) × (P+2B)</td></tr>
      <tr><td>純 bluff（0 equity）</td><td>fP − (1−f)B</td><td>(f − α) × (P+B)</td></tr>
      <tr><td>Semi-bluff</td><td>fP + (1−f)[e(P+2B) − B]</td><td>Fold equity + call 分支</td></tr>
      <tr><td>Implied odds</td><td colspan=2>X = C/e − (call 後 final pot)；一張牌：C/e ≈ C × 46/outs</td></tr></table></div></div>
    <div class="panel"><h2>5. Table kit（實戰八招）</h2><ol>
      <li><b>Required equity = call / final pot</b>：½→25%，⅔→29%，¾→30%，pot→33%，2×→40%。</li>
      <li><b>Bluff:value = bet : (pot + bet)</b>：pot bet → 每 2 個 value 1 個 bluff；½ pot → 1:3；2× → 2:3。</li>
      <li><b>Combo grid</b>：pairs 6/3/1，unpaired 16/12/9（你又有 board rank → 8），suited 4/3，每個 FD class = 1。</li>
      <li>只數關鍵類別：value 頂部 + 最可能嘅 bluff；sets / two pair 大約 3 個一類。</li>
      <li><b>Outs</b>：一張 ×2(+1)；flop all-in 先用 ×4，>8 outs 減 (outs−8)；扣 dirty outs。</li>
      <li><b>EV 快算</b>：EV(call) = (equity − required) × final pot；EV(bluff) = (fold% − α) × (pot + bet)。</li>
      <li><b>最後做 blocker check</b>：你嘅牌移除 value（對 call 好）定 bluff（對 call 唔好）？一張牌：pair 6→3，unpaired 16→12。</li>
      <li><b>MDF 係護欄唔係規則</b>：對 under-bluff（river、大注、低級別）嘅人 fold 多過 MDF；OOP defend 略少於 MDF。</li></ol></div>`;
  }

  function viewSettings() {
    setNav('settings'); stopTimer(); run = null;
    $app.innerHTML = `<h1>設定 Settings</h1><div class="panel">
      <label class="setting"><input type="checkbox" id="s4c" ${settings.fourColor ? 'checked' : ''}> 四色牌 4-color deck（♦ 藍、♣ 綠）</label>
      <label class="setting">計時模式 Timer：<select id="stm"><option value="stopwatch">Stopwatch 正計時（只記錄）</option><option value="countdown">Countdown 倒數（target × 1.5，夠鐘當錯）</option></select></label>
      <label class="setting"><input type="checkbox" id="sdo" ${settings.decisionOnly ? 'checked' : ''}> 4B 只答 call / fold（唔使填 combos）</label>
      <label class="setting"><input type="checkbox" id="slo" ${settings.loose4B ? 'checked' : ''}> 4B 容許 combos ±10%（L4b 估算模式；預設要準確 = L4a）</label>
      <div class="cardsrow" style="margin-top:1rem"><span class="lbl">預覽</span>${['As', 'Kh', 'Qd', 'Jc'].map((c) => cardHtml(c)).join('')}</div></div>`;
    document.getElementById('stm').value = settings.timerMode;
    document.getElementById('s4c').onchange = (e) => { settings.fourColor = e.target.checked; saveSettings(); };
    document.getElementById('stm').onchange = (e) => { settings.timerMode = e.target.value; saveSettings(); };
    document.getElementById('sdo').onchange = (e) => { settings.decisionOnly = e.target.checked; saveSettings(); };
    document.getElementById('slo').onchange = (e) => { settings.loose4B = e.target.checked; saveSettings(); };
  }

  // ----- keyboard -----
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { location.hash = '#/'; return; }
    if (!run || !run.q) return;
    if (run.answered && e.key === 'Enter') { e.preventDefault(); advance(); return; }
    if (!run.answered && run.q.actions) {
      const k = e.key.toLowerCase();
      if (k === 'c' || k === 'f') { e.preventDefault(); submit(k === 'c' ? 'call' : 'fold'); return; }
    }
    if (!run.answered && /^[0-9.\-]$/.test(e.key) && !(e.target instanceof HTMLInputElement)) {
      const inp = document.querySelector('#ansform input'); if (inp) inp.focus();
    }
  });

  // ----- router -----
  function route() {
    stopTimer();
    const h = location.hash || '#/';
    let m;
    if ((m = h.match(/^#\/drill\/(\w+)/))) viewDrill(m[1]);
    else if (h.startsWith('#/stats')) viewStats();
    else if (h.startsWith('#/cheat')) viewCheat();
    else if (h.startsWith('#/settings')) viewSettings();
    else { run = null; viewHome(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
