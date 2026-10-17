/* UI: router, drill runner, timer, stats (localStorage), level gates, spaced repetition, cheat sheet, settings */
(function () {
  'use strict';
  const PT = window.PT, M = PT.math;
  const $app = document.getElementById('app');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('pt1.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pt1.' + k, JSON.stringify(v)); } catch (e) { /* storage full or disabled */ } },
  };
  const savedSettings = LS.get('settings', {});
  const settings = Object.assign({ fourColor: false, timerMode: 'stopwatch', decisionOnly: false, loose4B: false }, savedSettings);
  // migration (v2): default deck is classic 2-colour; reset any setting saved before the 2-colour default
  if (!savedSettings.ver || savedSettings.ver < 2) { settings.fourColor = false; settings.ver = 2; LS.set('settings', settings); }
  const saveSettings = () => { LS.set('settings', settings); applySettings(); };
  function applySettings() { document.body.classList.toggle('fourcolor', !!settings.fourColor); }
  applySettings();

  // ----- sessions (for spaced repetition: missed items return after 1, 3, 7 sessions) -----
  const now = Date.now();
  let session = LS.get('session', 0);
  if (now - LS.get('lastActive', 0) > 30 * 60 * 1000) { session++; LS.set('session', session); }
  const touch = () => LS.set('lastActive', Date.now());
  touch();
  const SR_OFFSETS = PT.SR_OFFSETS;

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
    if (!PT.srApply(e, ok, session)) srq = srq.filter((x) => x !== e);
    saveSrq();
  }
  const isDue = (x) => PT.srIsDue(x, session);
  const dueFor = (drill) => srq.filter((x) => x.drill === drill && isDue(x));

  // ----- helpers -----
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (x) => (isNaN(x) ? '—' : (x * 100).toFixed(0) + '%');
  const sec = (x) => (isNaN(x) ? '—' : x.toFixed(1) + 's');
  const cardHtml = (c, isNew) => {
    const r = c[0] === 'T' ? '10' : c[0], u = PT.SUIT_SYM[c[1]];
    return `<div class="pcard ${c[1]}${isNew ? ' newc' : ''}" aria-label="${r}${u}"><span class="cr">${r}<i>${u}</i></span><span class="cu">${u}</span><span class="cr br">${r}<i>${u}</i></span></div>`;
  };
  const CS = (h) => PT.colorSuits(h || '');
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
    const due = srq.filter(isDue).length;
    let h = `<h1>NLHE combinatorics & EV 訓練</h1>
      <div class="panel chainpanel"><b>River 決策思路鏈</b> <a class="more" href="#/learn/chain">詳細 →</a><div class="chips">${PT.CHAIN.map((c, i) => PT.chainChip(i)).join('')}</div>
      <div class="muted" style="font-size:.85rem">4T 逐步練、4B 一次過、4E 練 ⑦ 對手類型；2G / 2M 練 ④ ⑤ 嘅數字。</div></div>
      <div class="panel">建議而家練：<b>Level ${cur}</b>　·　Session #${session}　·　待複習 (spaced repetition)：<b>${due}</b> 題
      <div class="muted" style="font-size:.85rem">升級條件：該 level 最近 50 題 accuracy ≥ 90% <u>同</u> median 時間 ≤ table-ready target（各 drill 用自己嘅 target 計）。</div></div>`;
    if (PT.drills.BUB) {
      const D = PT.drills.BUB, s = gateStats(itemsFor(['BUB'])), dueN = srq.filter((x) => x.drill === 'BUB' && isDue(x)).length;
      h += `<div class="panel level"><div class="head"><b>錦標賽 ICM · 泡沫期 Bubble</b><span class="badge">新</span></div><div class="drills">
        <button class="drillbtn" data-go="#/drill/BUB"><div class="t">${D.title}</div><div class="d">${D.desc}</div>
        <div class="s">Target ≤ ${D.target}s · ${s.n ? `${pct(s.acc)} 準確 · median ${sec(s.medT)}` : '未練過'}${dueN ? ` · <span class="review">複習 ${dueN}</span>` : ''}</div></button></div></div>`;
    }
    for (const L of PT.LEVELS) {
      if (L.soon) { h += `<div class="panel level muted"><div class="head"><b>${L.name}</b><span class="badge">v2</span></div></div>`; continue; }
      const g = gateStats(itemsFor(L.drills));
      h += `<div class="panel level"><div class="head"><b>${L.name}</b>
        <span class="badge ${g.pass ? 'ok' : g.n ? 'warn' : ''}">${g.pass ? '✓ 已達標 cleared' : `最近 ${g.n}/50 · ${pct(g.acc)} · median ${g.n ? (g.medRatio * 100).toFixed(0) + '% of target' : '—'}`}</span></div>
        <div class="drills">`;
      for (const id of L.drills) {
        const D = PT.drills[id];
        const s = gateStats(itemsFor([id]));
        const dueN = srq.filter((x) => x.drill === id && isDue(x)).length;
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
    setNav(id === 'BUB' ? 'bubble' : 'home');
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
    h += `<div class="prompt">${CS(q.promptHtml)}</div>`;
    if (q.extraHtml) h += `<div id="extra">${q.extraHtml}</div>`;
    h += '<form class="ans" id="ansform" autocomplete="off">';
    for (const inp of q.inputs) {
      if (inp.kind === 'choice') { h += `<div class="reasons" role="radiogroup" aria-label="${inp.label}"><b>${inp.label}：</b>${inp.options.map(([v, t]) => `<label><input type="radio" name="${inp.key}" value="${v}">${t}</label>`).join('')}</div>`; continue; }
      h += `<label>${inp.label}${inp.kind === 'pct' ? ' (%)' : ''}<input name="${inp.key}" inputmode="${inp.kind === 'int' ? 'numeric' : 'decimal'}" ${inp.kind === 'num' ? '' : 'pattern="[0-9.,%]*"'} enterkeyhint="done"></label>`;
    }
    if (q.actions) h += q.actions.map((a) => `<button type="button" class="btn ${a}" data-act="${a}">${a === 'call' ? 'Call 跟注' : 'Fold 棄牌'} <kbd>${a[0].toUpperCase()}</kbd></button>`).join('');
    else h += '<button class="btn" type="submit">提交 <kbd>Enter</kbd></button>';
    h += '</form><div id="fb"></div></div>';
    $app.innerHTML = h;
    const form = document.getElementById('ansform');
    form.addEventListener('submit', (e) => { e.preventDefault(); if (!q.actions) submit(); });
    form.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.act)));
    const first = form.querySelector('input:not([type=radio])');
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
    document.querySelectorAll('#ansform input').forEach((i) => { if (i.type !== 'radio' || i.checked) resp[i.name] = i.value; i.disabled = true; });
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
    let h = `<div class="fb"><div class="verdict ${ok ? 'ok' : 'bad'}" role="status">${ok ? '✓ 正確' : timeout ? '⏱ 超時' : '✗ 唔啱'} <span class="muted" style="font-size:1rem">${s.toFixed(1)}s / target ${q.target}s</span> ${readyBadge}</div>
      <table class="res"><tr><th></th><th>你</th><th>答案</th></tr>${g.rows.map((r) => `<tr><td>${r.label}</td><td class="${r.ok ? 'ok' : 'bad'}">${esc(r.your)}</td><td>${esc(r.correct)}</td></tr>`).join('')}</table>
      <div class="solution">${CS(q.solutionHtml)}</div>
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
      <div class="muted">Spaced-repetition 隊列：${srq.length} 題（${srq.filter(isDue).length} 題今個 session 到期）</div>
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
    $app.innerHTML = PT.cheatHtml();
  }

  function viewLearn(anchor) {
    setNav('learn'); stopTimer(); run = null;
    $app.innerHTML = PT.learnHtml();
    if (anchor) {
      const el = document.getElementById('L-' + anchor);
      if (el) { el.open = true; setTimeout(() => el.scrollIntoView({ block: 'start' }), 0); return true; }
    }
    return false;
  }

  function viewSettings() {
    setNav('settings'); stopTimer(); run = null;
    $app.innerHTML = `<h1>設定 Settings</h1><div class="panel">
      <label class="setting"><input type="checkbox" id="s4c" ${settings.fourColor ? 'checked' : ''}> 四色牌 4-color deck（可選：♦ 藍、♣ 綠）。預設係傳統兩色：♥♦ 紅、♠♣ 黑</label>
      <label class="setting">計時模式 Timer：<select id="stm"><option value="stopwatch">Stopwatch 正計時（只記錄）</option><option value="countdown">Countdown 倒數（target × 1.5，夠鐘當錯）</option></select></label>
      <label class="setting"><input type="checkbox" id="sdo" ${settings.decisionOnly ? 'checked' : ''}> 4B 只答 call / fold（唔使填 combos）</label>
      <label class="setting"><input type="checkbox" id="slo" ${settings.loose4B ? 'checked' : ''}> 4B 容許 combos ±10%（L4b 估算模式；預設要準確 = L4a）</label>
      <div class="cardsrow" style="margin-top:1rem"><span class="lbl">預覽</span>${['As', 'Kh', 'Qd', 'Jc'].map((c) => cardHtml(c)).join('')}</div></div>`;
    document.getElementById('stm').value = settings.timerMode;
    document.getElementById('s4c').onchange = (e) => { settings.fourColor = e.target.checked; saveSettings(); viewSettings(); };
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

  // ----- tap a range-grid cell → show the hand class big (mobile readability) -----
  let zoomT = null;
  document.addEventListener('click', (e) => {
    const cell = e.target.closest && e.target.closest('.grid13 .cell');
    if (!cell) return;
    document.querySelectorAll('.grid13 .cell.sel').forEach((c) => c.classList.remove('sel'));
    cell.classList.add('sel');
    let z = document.getElementById('cellzoom');
    if (!z) { z = document.createElement('div'); z.id = 'cellzoom'; z.className = 'cellzoom'; z.setAttribute('role', 'status'); document.body.appendChild(z); }
    const cls = cell.textContent, extra = (cell.title || '').slice(cls.length).trim();
    z.innerHTML = `<b>${esc(cls)}</b>${extra ? `<span>${esc(extra)}</span>` : ''}`;
    z.style.display = 'block';
    clearTimeout(zoomT); zoomT = setTimeout(() => { z.style.display = 'none'; }, 1600);
  });

  // ----- router -----
  function route() {
    stopTimer();
    const h = location.hash || '#/';
    let m;
    if ((m = h.match(/^#\/drill\/(\w+)/))) viewDrill(m[1]);
    else if (h.startsWith('#/stats')) viewStats();
    else if ((m = h.match(/^#\/learn(?:\/([\w-]+))?/))) { if (viewLearn(m[1])) return; }
    else if (h.startsWith('#/cheat')) viewCheat();
    else if (h.startsWith('#/settings')) viewSettings();
    else { run = null; viewHome(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
