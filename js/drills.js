/* Drill generators. Each generate(rng, opts) returns a question object:
 * {drill, title, target, board, hero, promptHtml, extraHtml, inputs, actions, grade(resp), solutionHtml, revealHtml, data, answer}
 * or {drill, steps:[question...]} for multi-street drills. Deterministic given rng (seeded) -> replayable. */
(function (G) {
  'use strict';
  const PT = G.PT;
  const M = PT.math;
  const { RANKS, SUIT_SYM } = PT;
  const SUITS = PT.SUITS.split('');
  const ic = (c) => `<span class="ic ${c[1]}">${c[0]}${SUIT_SYM[c[1]]}</span>`;
  const icList = (cards) => cards.map(ic).join('');
  const sic = (s) => `<span class="ic ${s}">${SUIT_SYM[s]}</span>`;
  PT.ic = ic; PT.icList = icList;
  const comboHtml = (cb) => `<span class="combo">${ic(cb[0])}${ic(cb[1])}</span>`;
  const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  const SUIT_KEY = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  /** wrap every "A♥" / lone "♥" in text (not inside tags, not already wrapped) with a coloured span */
  PT.colorSuits = (html) => String(html).replace(/(<[^>]*>)|([2-9TJQKA]?)([♠♥♦♣])/g, (m, tag, r, su, off, str) => {
    if (tag) return tag;
    if (/class="ic [shdc]">$/.test(str.slice(Math.max(0, off - 20), off))) return m;
    return `<span class="ic ${SUIT_KEY[su]}">${r}${su}</span>`;
  });
  /** range string -> html with specific combos (Ad2d) rendered as coloured cards */
  PT.rangeHtml = (str) => String(str).split(',').map((t) => {
    const m = t.match(/^([2-9TJQKA])([shdc])([2-9TJQKA])([shdc])$/);
    return m ? `<span class="spc">${ic(m[1] + m[2])}${ic(m[3] + m[4])}</span>` : t;
  }).map((h, i, a) => i < a.length - 1 ? `<span class="rtok">${h},</span>` : h).join('<wbr>');
  /** the poker player's decision thought chain, used everywhere (drills, solutions, cheat sheet, Learn) */
  const CHAIN = (PT.CHAIN = [
    ['Range', '對手呢條 line 會有乜牌？扣咗 board 同你手牌，數 live combos'],
    ['Value combos', '入面有幾多個 combos 贏你？'],
    ['Bluff combos', '有幾多個 combos 輸俾你？'],
    ['Bluff %', 'bluff ÷ (value + bluff) = 你 call 嘅 equity'],
    ['Required %', 'B ÷ (P + 2B)：call 需要幾多 equity'],
    ['Blockers', '你手牌減咗佢 value 定 bluff？'],
    ['Decision', 'Bluff % > required → call；再按對手類型調整（MDF 只係護欄）'],
  ]);
  const NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
  PT.CHAIN_NUM = NUM;
  const chip = (i) => `<span class="chip">${NUM[i]} ${CHAIN[i][0]}</span>`;
  PT.chainChip = chip;
  const num = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toString();
  const potTxt = (l) => String(l).replace(/\s*\(pot\)/, '') + ' pot';
  const BET_SIZES = [[1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'], [1, '1 (pot)'], [1.25, '1.25'], [1.5, '1.5'], [2, '2']];
  PT.BET_SIZES = BET_SIZES;

  // ---------- grading helpers ----------
  function parseNum(v) {
    if (v === undefined || v === null) return NaN;
    const s = String(v).replace(/[%\s]/g, '').replace(/[−–]/g, '-').replace(',', '.');
    if (s === '' || !/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
    return parseFloat(s);
  }
  PT.parseNum = parseNum;
  function gInt(label, resp, ans) {
    const v = parseNum(resp);
    return { label, your: isNaN(v) ? '—' : String(v), correct: String(ans), ok: v === ans };
  }
  function gPct(label, resp, ansFrac, tol) {
    const v = parseNum(resp), a = ansFrac * 100;
    return { label, your: isNaN(v) ? '—' : v + '%', correct: a.toFixed(1) + '% (±' + tol + ')', ok: !isNaN(v) && Math.abs(v - a) <= tol + 1e-9 };
  }
  function finish(rows) { return { ok: rows.every((r) => r.ok), rows }; }

  // ---------- combo explanation (worked arithmetic) ----------
  function where(card, board, hero) { return board.includes(card) ? 'board' : hero.includes(card) ? 'hero' : null; }
  function unseen(rank, board, hero) {
    const gone = [];
    for (const s of SUITS) { const c = rank + s, w = where(c, board, hero); if (w) gone.push({ c, w }); }
    return { n: 4 - gone.length, gone };
  }
  function goneText(rank, u) {
    if (!u.gone.length) return `未見 ${rank} = 4`;
    return `未見 ${rank} = 4 − ` + u.gone.map((g) => `1 (${ic(g.c)} ${g.w})`).join(' − ') + ` = ${u.n}`;
  }
  /** returns {count, lines:[html]} — arithmetic that a human would do; asserted against enumeration */
  function explainClass(cls, board, hero) {
    cls = PT.normClass(cls);
    const a = cls[0], b = cls[1], suf = cls[2] || '';
    const lines = [];
    let count;
    if (a === b) {
      const u = unseen(a, board, hero);
      count = M.choose2(u.n);
      lines.push(`${goneText(a, u)} → C(${u.n},2) = ${u.n}×${Math.max(u.n - 1, 0)}/2 = <b>${count}</b>`);
    } else {
      const ua = unseen(a, board, hero), ub = unseen(b, board, hero);
      const suitedOk = SUITS.filter((s) => !where(a + s, board, hero) && !where(b + s, board, hero));
      const suitedTxt = SUITS.map((s) => sic(s) + (suitedOk.includes(s) ? '✓' : '✗')).join(' ');
      if (suf === 's') {
        count = suitedOk.length;
        lines.push(`${cls}: 每種花色 1 combo，兩張都未見先算：${suitedTxt} → <b>${count}</b>`);
      } else {
        lines.push(`${goneText(a, ua)}；${goneText(b, ub)}`);
        if (suf === 'o') {
          count = ua.n * ub.n - suitedOk.length;
          lines.push(`a×b = ${ua.n}×${ub.n} = ${ua.n * ub.n}；減 suited ${suitedOk.length} (${suitedTxt}) → offsuit = <b>${count}</b>`);
        } else {
          count = ua.n * ub.n;
          lines.push(`a×b = ${ua.n}×${ub.n} = <b>${count}</b>（suited ${suitedOk.length} + offsuit ${count - suitedOk.length}）`);
        }
      }
    }
    const live = PT.liveCombos(cls, board.concat(hero));
    if (live.length !== count) throw new Error('explainClass mismatch ' + cls);
    return { count, lines, live };
  }
  PT.explainClass = explainClass;
  const liveList = (live) => (live.length ? `<div class="combolist">${live.map(comboHtml).join(' ')}</div>` : '<div class="combolist muted">（冇 combo 剩）</div>');

  function deal(rng, n, exclude) {
    const ex = new Set(exclude || []);
    return PT.shuffle(rng, PT.fullDeck().filter((c) => !ex.has(c))).slice(0, n);
  }
  function randClassName(rng, type, hiRank, loRank) {
    if (type === 'pair') return hiRank + hiRank;
    const [h, l] = RANKS.indexOf(hiRank) > RANKS.indexOf(loRank) ? [hiRank, loRank] : [loRank, hiRank];
    return h + l + (type === 's' ? 's' : type === 'o' ? 'o' : '');
  }
  const typeLabel = (cls) => (cls.length === 2 && cls[0] === cls[1] ? 'pair' : cls[2] === 's' ? 'suited' : cls[2] === 'o' ? 'offsuit' : 'any (s+o)');

  /** choose a target class that touches the board `touch` (0/1/2) times */
  function targetClass(rng, board) {
    const bRanks = [...new Set(board.map((c) => c[0]))];
    const offRanks = RANKS.split('').filter((r) => !bRanks.includes(r));
    const touch = PT.pick(rng, bRanks.length >= 2 ? [0, 1, 1, 2] : [0, 1, 1]);
    let r1, r2;
    if (touch === 0) { [r1, r2] = PT.sample(rng, offRanks, 2); }
    else if (touch === 1) { r1 = PT.pick(rng, bRanks); r2 = PT.pick(rng, offRanks); }
    else { [r1, r2] = PT.sample(rng, bRanks, 2); }
    let type = PT.pick(rng, ['any', 'any', 's', 'o', 'pair']);
    if (type === 'pair' && touch === 2) type = 'any';
    return randClassName(rng, type, r1, r2);
  }

  const D = (PT.drills = {});
  const LEVELS = (PT.LEVELS = [
    { level: 1, name: 'Level 1 · Combo 計數 & card removal', drills: ['1A', '1B', '1C', '1D', '1E'] },
    { level: 2, name: 'Level 2 · Pot odds / required equity / outs / MDF', drills: ['2A', '2B', '2C', '2G', '2M'] },
    { level: 3, name: 'Level 3 · Range 收窄 (v2)', drills: [], soon: true },
    { level: 4, name: 'Level 4 · Value vs bluff / EV', drills: ['4B', '4T', '4E', '4C'] },
    { level: 5, name: 'Level 5 · Shot-clock 實戰 (v2)', drills: [], soon: true },
  ]);

  // ---------------- 1A preflop combos ----------------
  D['1A'] = {
    level: 1, title: '1A 翻牌前 combos (preflop)', desc: '一個或幾個 hand class 有幾多 combos？', target: 3,
    generate(rng) {
      const n = PT.pick(rng, [1, 1, 1, 2, 3, 4]);
      const classes = [];
      while (classes.length < n) {
        const [r1, r2] = [PT.pick(rng, RANKS.split('')), PT.pick(rng, RANKS.split(''))];
        const cls = r1 === r2 ? r1 + r2 : randClassName(rng, PT.pick(rng, ['s', 'o', 'any']), r1, r2);
        if (!classes.includes(cls)) classes.push(cls);
      }
      const parts = classes.map((c) => ({ c, n: PT.combosOfClass(c).length }));
      const ans = parts.reduce((s, p) => s + p.n, 0);
      const target = n === 1 ? 3 : 8;
      return {
        drill: '1A', target, board: [], hero: [],
        promptHtml: n === 1 ? `<b>${classes[0]}</b> 有幾多 combos？` : `對手 range 包括 { <b>${classes.join(', ')}</b> }，總共有幾多個可能嘅 combos？<div class="tip">（佢手上只會有其中一手；未有 board / hero 牌要扣）</div>`,
        inputs: [{ key: 'n', label: 'Combos', kind: 'int' }],
        data: { classes }, answer: { n: ans },
        grade: (r) => finish([gInt('Combos', r.n, ans)]),
        solutionHtml: parts.map((p) => `${p.c} (${typeLabel(p.c)}) = <b>${p.n}</b>`).join('<br>') +
          (n > 1 ? `<br>合計 = ${parts.map((p) => p.n).join(' + ')} = <b>${ans}</b>` : '') +
          '<div class="tip">記住：pair 6 · suited 4 · offsuit 12 · any 16</div>' +
          (n > 1 ? '<div class="tip">同一隻牌（例如 Q♠）可以喺唔同 combos 重複出現，因為對手只會拎住其中一手。只有 board 同你自己手上睇到嘅牌先會扣 combos。</div>' : ''),
      };
    },
  };

  // ---------------- 1B board removal / 1C hero blockers ----------------
  function genRemoval(rng, withHero) {
    const board = deal(rng, 3);
    const cls = targetClass(rng, board);
    let hero = [];
    if (withHero) {
      const share = rng() < 0.5;
      const rest = PT.fullDeck().filter((c) => !board.includes(c));
      if (share) {
        const rel = rest.filter((c) => c[0] === cls[0] || c[0] === cls[1]);
        if (rel.length) {
          const h1 = PT.pick(rng, rel);
          hero = [h1, PT.pick(rng, rest.filter((c) => c !== h1))];
        }
      }
      if (!hero.length) hero = PT.sample(rng, rest, 2);
    }
    const ex = explainClass(cls, board, hero);
    return { board, hero, cls, ex };
  }
  D['1B'] = {
    level: 1, title: '1B Board card removal', desc: 'Flop 上面嘅牌會減少 combos', target: 4,
    generate(rng) {
      const { board, cls, ex } = genRemoval(rng, false);
      return {
        drill: '1B', target: 4, board, hero: [],
        promptHtml: `Board ${icList(board)}：<b>${cls}</b> (${typeLabel(cls)}) 仲有幾多 combos？`,
        inputs: [{ key: 'n', label: 'Combos', kind: 'int' }],
        data: { board, hero: [], cls }, answer: { n: ex.count },
        grade: (r) => finish([gInt('Combos', r.n, ex.count)]),
        solutionHtml: ex.lines.join('<br>') + liveList(ex.live),
      };
    },
  };
  D['1C'] = {
    level: 1, title: '1C Hero blockers', desc: 'Board + 你自己手牌都係 blockers', target: 5,
    generate(rng) {
      const { board, hero, cls, ex } = genRemoval(rng, true);
      return {
        drill: '1C', target: 5, board, hero,
        promptHtml: `Board ${icList(board)}，你手持 ${icList(hero)}：villain 嘅 <b>${cls}</b> (${typeLabel(cls)}) 有幾多 combos？`,
        inputs: [{ key: 'n', label: 'Combos', kind: 'int' }],
        data: { board, hero, cls }, answer: { n: ex.count },
        grade: (r) => finish([gInt('Combos', r.n, ex.count)]),
        solutionHtml: ex.lines.join('<br>') + liveList(ex.live) +
          '<div class="tip">常見錯誤：忘記減自己手牌；set 當 6 combos（其實係 3）。</div>',
      };
    },
  };

  // ---------------- 1D runout tracker (3 steps) ----------------
  D['1D'] = {
    level: 1, title: '1D Runout tracker (flop→turn→river)', desc: '同一個 hand class，每條街重新數', target: 4,
    generate(rng) {
      const flop = deal(rng, 3);
      const cls = targetClass(rng, flop);
      const hero = rng() < 0.5 ? deal(rng, 2, flop) : [];
      const dead = () => flop.concat(hero);
      const nextCard = (used) => {
        const rest = PT.fullDeck().filter((c) => !used.includes(c));
        const hits = rest.filter((c) => c[0] === cls[0] || c[0] === cls[1]);
        return rng() < 0.4 && hits.length ? PT.pick(rng, hits) : PT.pick(rng, rest);
      };
      const turn = nextCard(dead());
      const river = nextCard(dead().concat([turn]));
      const streets = [['Flop', flop], ['Turn', flop.concat([turn])], ['River', flop.concat([turn, river])]];
      const steps = streets.map(([name, board], i) => {
        const ex = explainClass(cls, board, hero);
        const prev = i ? explainClass(cls, streets[i - 1][1], hero).count : null;
        const newCard = i ? board[board.length - 1] : null;
        return {
          drill: '1D', target: 4, board, hero, street: name,
          promptHtml: `<b>${name}</b>${newCard ? '（新牌 ' + ic(newCard) + '）' : ''}：villain 嘅 <b>${cls}</b> (${typeLabel(cls)}) 而家有幾多 combos？` +
            (hero.length ? ` <span class="muted">你手持 ${icList(hero)}</span>` : ''),
          inputs: [{ key: 'n', label: `${name} combos`, kind: 'int' }],
          data: { board, hero, cls }, answer: { n: ex.count },
          grade: (r) => finish([gInt(`${name} combos`, r.n, ex.count)]),
          solutionHtml: (prev !== null ? `上一條街 ${prev} → ` + (newCard[0] === cls[0] || newCard[0] === cls[1] ? `${ic(newCard)} 係相關 rank，要再減。<br>` : `${ic(newCard)} 唔影響 ${cls}，維持。<br>`) : '') +
            ex.lines.join('<br>') + liveList(ex.live),
        };
      });
      return { drill: '1D', steps, data: { flop, turn, river, hero, cls } };
    },
  };

  // ---------------- 1E flush-draw counter ----------------
  D['1E'] = {
    level: 1, title: '1E Flush-draw 計數', desc: 'Two-tone flop：每個同花色 suited class = 1 combo', target: 10,
    generate(rng) {
      const X = PT.pick(rng, SUITS);
      const others = SUITS.filter((s) => s !== X);
      const [r1, r2] = PT.sample(rng, RANKS.split(''), 2);
      const r3 = PT.pick(rng, RANKS.split(''));
      const board = [r1 + X, r2 + X, r3 + PT.pick(rng, others)];
      let hero;
      const rest = PT.fullDeck().filter((c) => !board.includes(c));
      if (rng() < 0.6) { const h1 = PT.pick(rng, rest.filter((c) => c[1] === X)); hero = [h1, PT.pick(rng, rest.filter((c) => c !== h1))]; }
      else hero = PT.sample(rng, rest.filter((c) => c[1] !== X), 2);
      const allSuited = PT.allClasses().filter((c) => c[2] === 's');
      // bias: include classes using board/hero ranks sometimes
      const k = PT.randInt(rng, 5, 12);
      const touchy = allSuited.filter((c) => [...board, ...hero].some((x) => x[1] === X && (x[0] === c[0] || x[0] === c[1])));
      const pickT = PT.sample(rng, touchy, Math.min(touchy.length, PT.randInt(rng, 1, 3)));
      const classes = [...new Set(pickT.concat(PT.sample(rng, allSuited, k)))].slice(0, k);
      classes.sort((p, q) => RANKS.indexOf(q[0]) * 13 + RANKS.indexOf(q[1]) - (RANKS.indexOf(p[0]) * 13 + RANKS.indexOf(p[1])));
      const dead = new Set(board.concat(hero));
      const rows = classes.map((c) => {
        const a = c[0] + X, b = c[1] + X;
        const blk = [a, b].filter((x) => dead.has(x));
        return { c, ok: blk.length === 0, combo: [a, b], why: blk.map((x) => `${ic(x)} ${board.includes(x) ? 'board' : 'hero'}`).join(', ') };
      });
      const ans = rows.filter((r) => r.ok).length;
      return {
        drill: '1E', target: 10, board, hero,
        promptHtml: `Board ${icList(board)}（${sic(X)} two-tone），你手持 ${icList(hero)}。Villain range（只計 suited）：<b>${classes.join(', ')}</b><br>有幾多個 ${sic(X)} <b>flush-draw combos</b>？`,
        inputs: [{ key: 'n', label: 'Flush-draw combos', kind: 'int' }],
        data: { board, hero, classes, suit: X }, answer: { n: ans },
        grade: (r) => finish([gInt('Flush-draw combos', r.n, ans)]),
        solutionHtml: `每個 suited class 最多 1 個 ${sic(X)} combo；如果其中一張 ${sic(X)} 牌喺 board 或你手上就冇咗：<br>` +
          rows.map((r) => `${r.c}: ${r.ok ? '✓ ' + comboHtml(r.combo) : '✗ (' + r.why + ')'}`).join('<br>') +
          `<br>合計 = <b>${ans}</b>`,
      };
    },
  };

  // ---------------- 2A size -> required equity ----------------
  D['2A'] = {
    level: 2, title: '2A 注碼 → required equity', desc: '背熟：½→25%，⅔→28.6%，pot→33.3%', target: 2,
    generate(rng) {
      const [s, label] = PT.pick(rng, BET_SIZES);
      const req = s / (1 + 2 * s);
      return {
        drill: '2A', target: 2, board: [], hero: [],
        promptHtml: `Villain bet <b>${potTxt(label)}</b>。你 call 需要幾多 equity（pot odds）？`,
        inputs: [{ key: 'p', label: 'Required equity %', kind: 'pct' }],
        data: { size: s }, answer: { req },
        grade: (r) => finish([gPct('Required equity', r.p, req, 1)]),
        solutionHtml: `s = ${label} → required = s / (1 + 2s) = ${num(s, 4)} / ${num(1 + 2 * s, 4)} = <b>${pct(req)}</b><br>Odds offered = (1+s):s = ${num((1 + s) / s, 2)} : 1`,
      };
    },
  };

  // ---------------- 2B raw numbers ----------------
  function randPotBet(rng, sizes) {
    const P = PT.randInt(rng, 5, 200);
    const [s] = PT.pick(rng, sizes || BET_SIZES);
    const B = Math.max(1, Math.round(P * s * (0.85 + rng() * 0.3)));
    return { P, B };
  }
  D['2B'] = {
    level: 2, title: '2B Pot / bet 實數 → required equity', desc: 'Call ÷ final pot', target: 6,
    generate(rng) {
      const { P, B } = randPotBet(rng);
      const req = M.reqEquity(P, B);
      return {
        drill: '2B', target: 6, board: [], hero: [],
        promptHtml: `Pot <b>${P}</b>，villain bet <b>${B}</b>。Required equity？`,
        inputs: [{ key: 'p', label: 'Required equity %', kind: 'pct' }],
        data: { P, B }, answer: { req },
        grade: (r) => finish([gPct('Required equity', r.p, req, 2)]),
        solutionHtml: `Required = call / final pot = B / (P + 2B) = ${B} / (${P} + ${2 * B}) = ${B} / ${P + 2 * B} = <b>${pct(req)}</b>` +
          '<div class="tip">常見錯誤：用 B/P 或 B/(P+B)。</div>',
      };
    },
  };

  // ---------------- 2C outs -> equity ----------------
  const OUTS_MODES = {
    flop1: '翻牌圈面對下注（只睇 turn 一張，×2）',
    turn1: 'Turn → river（一張，×2）',
    flop2: '翻牌圈 all-in（睇兩張，×4，>8 outs 要修正）',
  };
  D['2C'] = {
    level: 2, title: '2C Outs → equity', desc: 'Rule of 2 / 4 加修正', target: 4,
    generate(rng) {
      const outs = PT.randInt(rng, 2, 21);
      const mode = PT.pick(rng, ['flop1', 'turn1', 'flop2', 'flop2']);
      const eq = M.outsEquity(outs, mode);
      const rule = M.outsRule(outs, mode);
      const exact = mode === 'flop1' ? `${outs}/47` : mode === 'turn1' ? `${outs}/46` : `1 − C(${47 - outs},2)/C(47,2) = 1 − ${M.choose2(47 - outs)}/1081`;
      return {
        drill: '2C', target: 4, board: [], hero: [],
        promptHtml: `<b>${outs} outs</b>，${OUTS_MODES[mode]}。Equity 大約幾多？`,
        inputs: [{ key: 'p', label: 'Equity %', kind: 'pct' }],
        data: { outs, mode }, answer: { eq },
        grade: (r) => finish([gPct('Equity', r.p, eq, 2)]),
        solutionHtml: `速算：${rule.text}<br>精確：${exact} = <b>${pct(eq)}</b>（速算誤差 ${(rule.est - eq * 100).toFixed(1)} pts）` +
          (mode === 'flop2' && outs > 8 ? '<div class="tip">×4 喺大 draw 會高估：用 4x − (x − 8)。</div>' : '') +
          (mode === 'flop1' ? '<div class="tip">面對 flop bet 而之後仲有下注，唔好用 ×4。</div>' : ''),
      };
    },
  };

  // ---------------- 2G MDF / alpha / bluff share (curriculum 4A ratio recall) ----------------
  D['2G'] = {
    level: 2, title: '2G MDF / alpha / bluff:value', desc: 'MDF = P/(P+B)，alpha = B/(P+B)，bluff% = B/(P+2B)', target: 3,
    generate(rng) {
      const raw = rng() < 0.3;
      let P, B, label;
      if (raw) ({ P, B } = randPotBet(rng));
      else { const [s, l] = PT.pick(rng, BET_SIZES); P = 1; B = s; label = l; }
      const what = PT.pick(rng, ['mdf', 'alpha', 'bluff']);
      const ans = what === 'mdf' ? M.mdf(P, B) : what === 'alpha' ? M.alpha(P, B) : M.bluffShare(P, B);
      const tol = raw ? 2 : 1;
      const q = { mdf: '你嘅 <b>MDF</b>（最少要 defend 幾多 %）', alpha: '0-equity bluff 要幾多 % fold 先 breakeven（<b>alpha</b>）', bluff: '平衡 river range 入面 <b>bluff %</b>' }[what];
      const PB = raw ? `P=${P}, B=${B}` : `P=1, B=${num(B, 4)} (${potTxt(label)})`;
      const formula = {
        mdf: `MDF = P / (P + B) = ${raw ? P + ' / ' + (P + B) : '1 / ' + num(1 + B, 4)}`,
        alpha: `alpha = B / (P + B) = ${raw ? B + ' / ' + (P + B) : num(B, 4) + ' / ' + num(1 + B, 4)}`,
        bluff: `bluff% = B / (P + 2B) = ${raw ? B + ' / ' + (P + 2 * B) : num(B, 4) + ' / ' + num(1 + 2 * B, 4)}`,
      }[what];
      return {
        drill: '2G', target: 3, board: [], hero: [],
        promptHtml: raw ? `River：pot <b>${P}</b>，villain bet <b>${B}</b>。${q}？` : `River：villain bet <b>${potTxt(label)}</b>。${q}？`,
        inputs: [{ key: 'p', label: what === 'mdf' ? 'MDF %' : what === 'alpha' ? 'Alpha %' : 'Bluff %', kind: 'pct' }],
        data: { P, B, what }, answer: { v: ans },
        grade: (r) => finish([gPct(what.toUpperCase(), r.p, ans, tol)]),
        solutionHtml: `${PB}<br>${formula} = <b>${pct(ans)}</b><br>` +
          `（MDF ${pct(M.mdf(P, B))} · alpha ${pct(M.alpha(P, B))} · bluff ${pct(M.bluffShare(P, B))} → bluff:value = 1 : ${num(M.valuePerBluff(P, B), 2)}）` +
          `<div class="plain"><b>白話：</b>${{ mdf: `對手落注之後 pot 有 ${raw ? P + B : 'P + B'}。你最少要守住「原本 pot ÷ 呢個數」咁多 %，佢亂咁 bluff 先唔會自動賺錢。`, alpha: `對手冒 ${raw ? B : 'B'} 去贏 ${raw ? P : 'P'}。佢個 bluff 要你 fold 多過「冒險 ÷ (冒險 + 獎品)」咁多 % 先有錢賺。`, bluff: `你 call 完 final pot = P + 2B。平衡嘅話，對手 betting range 入面 bluff 佔嘅 %，啱啱等於你 call 需要嘅 equity。` }[what]}</div>` +
          '<div class="tip">MDF 係防止被 over-bluff 嘅參考，唔係硬性規則；對住 under-bluff 嘅人要 fold 多啲。</div>',
      };
    },
  };


  // ---------------- 2M MDF / alpha / bluff% all at once (layman worked solution) ----------------
  D['2M'] = {
    level: 2, title: '2M 三兄弟：alpha · MDF · bluff% 一次過', desc: '同一個注，三個角度一齊計', target: 15,
    generate(rng) {
      const { P, B } = randPotBet(rng, BET_SIZES.filter(([x]) => x >= 1 / 3));
      const a = M.alpha(P, B), m = M.mdf(P, B), b = M.bluffShare(P, B);
      return {
        drill: '2M', target: 15, board: [], hero: [],
        promptHtml: `River：pot <b>${P}</b>，對手 bet <b>${B}</b>。計：<br>• <b>Alpha</b>：佢個 bluff 要你 fold 幾多 %？<br>• <b>MDF</b>：你最少要守幾多 %？<br>• <b>Bluff %</b>：平衡嘅話佢 betting range 最多幾多 % 係 bluff？`,
        inputs: [{ key: 'a', label: 'Alpha %', kind: 'pct' }, { key: 'm', label: 'MDF %', kind: 'pct' }, { key: 'b', label: 'Bluff %', kind: 'pct' }],
        data: { P, B }, answer: { alpha: a, mdf: m, bluff: b },
        grade: (r) => finish([gPct('Alpha', r.a, a, 2), gPct('MDF', r.m, m, 2), gPct('Bluff %', r.b, b, 2)]),
        solutionHtml: `<ol class="steps"><li>對手落注之後 pot = P + B = ${P} + ${B} = ${P + B}；你 call 完 final pot = P + 2B = ${P + 2 * B}。</li>
          <li><b>Alpha</b> = B ÷ (P + B) = ${B} ÷ ${P + B} = <b>${pct(a)}</b><br><span class="plain">白話：佢冒 ${B} 去贏 ${P}。你 fold 多過 ${pct(a, 0)}，佢任何兩張牌 bluff 都賺。</span></li>
          <li><b>MDF</b> = P ÷ (P + B) = ${P} ÷ ${P + B} = <b>${pct(m)}</b>（= 100% − alpha）<br><span class="plain">白話：你 100 手入面最少要繼續大約 ${Math.round(m * 100)} 手，佢亂 bluff 先唔會自動賺。</span></li>
          <li><b>Bluff %</b> = B ÷ (P + 2B) = ${B} ÷ ${P + 2 * B} = <b>${pct(b)}</b>（= 你 call 嘅 required equity）<br><span class="plain">白話：佢 bet 嘅牌入面 bluff 多過 ${pct(b, 0)}，你嘅 bluff-catcher call 就賺；少過就 fold。Bluff : value = ${B} : ${P + B} = 1 : ${num((P + B) / B, 2)}。</span></li></ol>
          <div class="tip">記法：alpha 睇「佢 bluff」、MDF 睇「你守」、bluff% 睇「佢 range 結構」。三個都只係由 P 同 B 計出嚟。</div>`,
      };
    },
  };


  function spotPrompt(sp) {
    return `River ${icList(sp.board)}，你手持 ${icList(sp.hero)}。Pot <b>${sp.P}</b>，villain bet <b>${sp.B}</b>（≈${potTxt(sp.sLabel)}）。<br>Villain betting range：<code class="range">${PT.rangeHtml(sp.rangeStr)}</code>`;
  }
  /** the 7-step thought chain solution for a river spot: returns 7 html parts */
  function chainParts(sp) {
    const byCat = (res) => {
      const groups = {};
      for (const r of sp.rows.filter((x) => x.res === res)) {
        const key = res === 'bluff' ? (r.draw ? 'Missed ' + r.draw : PT.CAT_NAMES[r.cat]) : PT.CAT_NAMES[r.cat];
        (groups[key] = groups[key] || {})[r.cls] = ((groups[key] || {})[r.cls] || []).concat([r.combo]);
      }
      return Object.entries(groups).map(([k, clsMap]) => {
        const n = Object.values(clsMap).reduce((t, a) => t + a.length, 0);
        return `<div class="grp"><b>${k}</b> — ${n}<br>` + Object.entries(clsMap).map(([cls, cbs]) => `<span class="clsrow">${cls} ×${cbs.length}: ${cbs.map(comboHtml).join(' ')}</span>`).join('<br>') + '</div>';
      }).join('');
    };
    const N = sp.V + sp.Bl + sp.T;
    const e = sp.ev.equity, decide = sp.ev.ev > 0 ? 'call' : 'fold';
    const perCls = {};
    for (const r of sp.rows) perCls[r.cls] = (perCls[r.cls] || 0) + 1;
    const mdf = M.mdf(sp.P, sp.B);
    const blkTxt = sp.blkV > sp.blkB ? '好嘅 blocker：你減咗佢 value，佢剩低嘅牌 bluff 比例高咗 → 對 call 有利。' : sp.blkB > sp.blkV ? '壞嘅 blocker：你減咗佢 bluff → 對 call 不利。' : '冇明顯偏向。';
    return [
      `<div class="cstep"><h4>${chip(0)}</h4>扣咗 board 同你手牌，range 剩 <b>${N}</b> 個 live combos：<div class="muted">${Object.entries(perCls).map(([c, n]) => `${c} ${n}`).join(' · ')}</div></div>`,
      `<div class="cstep"><h4>${chip(1)}（贏你）= ${sp.V}</h4>${byCat('value') || '<div class="muted">冇</div>'}</div>`,
      `<div class="cstep"><h4>${chip(2)}（輸俾你）= ${sp.Bl}</h4>${byCat('bluff')}${sp.T ? `<div><b>Chop（打和）= ${sp.T}</b>${byCat('chop')}</div>` : ''}</div>`,
      `<div class="cstep"><h4>${chip(3)}</h4>Bluff % = ${sp.Bl} ÷ ${N} = <b>${pct(sp.Bl / N)}</b>${sp.T ? `（連 chop 計 equity = (${sp.Bl} + ½×${sp.T}) ÷ ${N} = ${pct(e)}）` : ''}<br><span class="plain">白話：你嘅牌只贏佢 bluff，所以呢個 % 就係你 call 嘅 equity。</span></div>`,
      `<div class="cstep"><h4>${chip(4)}</h4>Required = B ÷ (P + 2B) = ${sp.B} ÷ ${sp.P + 2 * sp.B} = <b>${pct(sp.req)}</b><br>平衡嘅話 bluff 上限 ≈ value × B ÷ (P + B) = ${sp.V} × ${sp.B} ÷ ${sp.P + sp.B} = ${num((sp.V * sp.B) / (sp.P + sp.B), 1)} combos</div>`,
      `<div class="cstep"><h4>${chip(5)}</h4>你手牌 ${icList(sp.hero)} 移除咗 range 入面 <b>${sp.blkV}</b> 個 value combos 同 <b>${sp.blkB}</b> 個 bluff combos。${blkTxt}</div>`,
      `<div class="cstep"><h4>${chip(6)}</h4>${pct(e)} ${e > sp.req ? '>' : '<'} ${pct(sp.req)} → <b class="dec ${decide}">${decide.toUpperCase()}</b><br>` +
        `EV(call) = e × (P + B) − (1 − e) × B = ${num(e, 3)} × ${sp.P + sp.B} − ${num(1 - e, 3)} × ${sp.B} = <b>${num(sp.ev.ev, 2)}</b>bb<br>` +
        `快算：(e − required) × final pot = (${num(e, 3)} − ${num(sp.req, 3)}) × ${sp.P + 2 * sp.B} ≈ ${num((e - sp.req) * (sp.P + 2 * sp.B), 2)}<br>` +
        `<span class="muted">MDF = ${sp.P} ÷ ${sp.P + sp.B} = ${pct(mdf)} 只係護欄；真正決定睇佢實際 bluff %。</span></div>`,
    ];
  }

  // ---------------- 4B river value vs bluff ----------------
  const PLAUSIBLE = '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,96s+,85s+,74s+,63s+,53s+,43s,A8o+,KTo+,QTo+,JTo,T9o';
  PT.PLAUSIBLE = PLAUSIBLE;
  const plausibleClasses = PT.parseRange(PLAUSIBLE).classes;
  const RIVER_SIZES = BET_SIZES.filter(([s]) => s >= 0.5);

  /** did this combo have a straight/flush draw on flop or turn that it did not need the board for? */
  function drawType(combo, board5, deadForDraw) {
    let fl = false, st = false;
    for (const n of [3, 4]) {
      const b = board5.slice(0, n);
      const cur = PT.evaluate(combo.concat(b)).cat;
      if (cur >= 4) continue;
      for (const x of PT.fullDeck()) {
        if (b.includes(x) || combo.includes(x) || deadForDraw.has(x)) continue;
        const e = PT.evaluate(combo.concat(b, [x])).cat;
        if (e === 5 || e === 8) fl = true;
        else if (e === 4) st = true;
      }
    }
    return fl && st ? 'combo draw' : fl ? 'flush draw' : st ? 'straight draw' : null;
  }

  function gen4BSpot(rng) {
    for (let tries = 0; tries < 400; tries++) {
      const board = deal(rng, 5);
      const bScore = PT.evaluate(board).score;
      const boardSet = new Set(board);
      // hero: a bluff-catcher (one pair / two pair that uses a hole card)
      const heroCands = [];
      for (const cls of plausibleClasses) for (const cb of PT.combosOfClass(cls)) {
        if (boardSet.has(cb[0]) || boardSet.has(cb[1])) continue;
        const e = PT.evaluate(cb.concat(board));
        if ((e.cat === 1 || e.cat === 2) && e.score > bScore) heroCands.push(cb);
      }
      if (heroCands.length < 5) continue;
      const hero = PT.pick(rng, heroCands);
      const hScore = PT.evaluate(hero.concat(board)).score;
      const dead = new Set(board.concat(hero));
      const valueCands = [], bluffClassCands = [], fdCombos = [];
      for (const cls of plausibleClasses) {
        const live = PT.liveCombos(cls, dead);
        if (!live.length) continue;
        let w = 0, l = 0, t = 0;
        const res = live.map((cb) => { const s = PT.evaluate(cb.concat(board)).score; const r = s > hScore ? 'w' : s < hScore ? 'l' : 't'; if (r === 'w') w++; else if (r === 'l') l++; else t++; return r; });
        if (w === live.length) valueCands.push(cls);
        else if (l === live.length) {
          const types = live.map((cb) => drawType(cb, board, boardSet));
          if (types.every(Boolean) && cls[2] !== 'o' && cls[0] !== cls[1]) bluffClassCands.push(cls);
          else live.forEach((cb, i) => { if (types[i] === 'flush draw' || types[i] === 'combo draw') if (cb[0][1] === cb[1][1]) fdCombos.push(cb); });
        }
        void res; void t;
      }
      if (valueCands.length < 2) continue;
      // pick value classes until 12..40 live combos
      let value = [], vN = 0;
      const vTarget = PT.randInt(rng, 12, 40);
      for (const c of PT.shuffle(rng, valueCands)) {
        const n = PT.liveCombos(c, dead).length;
        if (vN + n > 45) continue;
        value.push(c); vN += n;
        if (vN >= vTarget) break;
      }
      if (vN < 8 || value.length < 2) continue;
      const [s, sLabel] = PT.pick(rng, RIVER_SIZES);
      const P = PT.randInt(rng, 10, 150);
      const B = Math.max(1, Math.round(P * s));
      const req = M.reqEquity(P, B);
      const delta = (0.04 + rng() * 0.12) * (rng() < 0.5 ? -1 : 1);
      const share = Math.min(0.7, Math.max(0.05, req + delta));
      const bTarget = Math.round((vN * share) / (1 - share));
      const units = PT.shuffle(rng, bluffClassCands.map((c) => ({ cls: c, n: PT.liveCombos(c, dead).length }))
        .concat(fdCombos.map((cb) => ({ combo: cb, n: 1 }))));
      let bN = 0; const bluffClasses = [], bluffCombos = [];
      for (const u of units) {
        if (bN >= bTarget) break;
        if (bN + u.n > bTarget + 3) continue;
        if (u.cls) bluffClasses.push(u.cls); else if (!bluffClasses.includes(PT.classOf(u.combo[0], u.combo[1]))) bluffCombos.push(u.combo);
        bN += u.n;
      }
      // dedupe specific combos whose class got included later
      const bc2 = bluffCombos.filter((cb) => !bluffClasses.includes(PT.classOf(cb[0], cb[1])));
      const allClasses = value.concat(bluffClasses);
      const rangeStr = [PT.formatRange(allClasses)].concat(bc2.map((cb) => cb[0] + cb[1])).filter(Boolean).join(',');
      const parsed = PT.parseRange(rangeStr);
      // exact classification of every live combo
      const rows = [];
      let V = 0, Bl = 0, T = 0;
      for (const cb of parsed.combos) {
        if (dead.has(cb[0]) || dead.has(cb[1])) continue;
        const e = PT.evaluate(cb.concat(board));
        const r = e.score > hScore ? 'value' : e.score < hScore ? 'bluff' : 'chop';
        if (r === 'value') V++; else if (r === 'bluff') Bl++; else T++;
        rows.push({ combo: cb, cls: PT.classOf(cb[0], cb[1]), res: r, cat: e.cat, draw: r === 'bluff' ? drawType(cb, board, boardSet) : null });
      }
      if (Bl < 2) continue;
      const ev = M.evCall(P, B, V, Bl, T);
      if (Math.abs(ev.equity - req) < 0.025) continue; // avoid razor-thin spots
      // blockers: range combos (not on board) that hero's cards remove
      const heroSet = new Set(hero);
      let blkV = 0, blkB = 0;
      for (const cb of parsed.combos) {
        if (boardSet.has(cb[0]) || boardSet.has(cb[1])) continue;
        if (!heroSet.has(cb[0]) && !heroSet.has(cb[1])) continue;
        const cls = PT.classOf(cb[0], cb[1]);
        if (value.includes(cls)) blkV++; else blkB++;
      }
      return { board, hero, P, B, sLabel, rangeStr, rows, V, Bl, T, ev, req, blkV, blkB, valueClasses: value, bluffClasses, bluffCombos: bc2 };
    }
    throw new Error('4B generator failed');
  }
  PT.gen4BSpot = gen4BSpot;

  function gridHtml(rangeStr, rows, reveal) {
    const parsed = PT.parseRange(rangeStr);
    const inClass = new Set(parsed.classes);
    const partial = new Set(parsed.combos.map((cb) => PT.classOf(cb[0], cb[1])).filter((c) => !inClass.has(c)));
    const agg = {};
    if (reveal) for (const r of rows) { const a = (agg[r.cls] = agg[r.cls] || { value: 0, bluff: 0, chop: 0 }); a[r.res]++; }
    let h = '<div class="grid13">';
    for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
      const c = PT.gridClass(i, j);
      let cl = 'cell';
      let tip = c;
      if (inClass.has(c) || partial.has(c)) {
        cl += inClass.has(c) ? ' in' : ' part';
        if (reveal) {
          const a = agg[c];
          if (!a) cl += ' dead'; else if (a.value && !a.bluff && !a.chop) cl += ' val'; else if (a.bluff && !a.value && !a.chop) cl += ' blf'; else cl += ' mix';
          if (a) tip += ` V${a.value} B${a.bluff}${a.chop ? ' C' + a.chop : ''}`; else tip += ' (全部被 block)';
        }
      }
      h += `<div class="${cl}" title="${tip}">${c}</div>`;
    }
    return h + '</div>' + (reveal ? '<div class="legend"><span class="cell val">value</span><span class="cell blf">bluff</span><span class="cell mix">mixed</span><span class="cell in dead">blocked</span></div>' : '<div class="legend"><span class="cell in">in range</span><span class="cell part">部分 combos</span></div>');
  }
  PT.gridHtml = gridHtml;

  D['4B'] = {
    level: 4, title: '4B River：value vs bluff → call / fold', desc: '數 villain value / bluff combos，再決定', target: 60,
    generate(rng, opts) {
      opts = opts || {};
      const sp = gen4BSpot(rng);
      const decide = sp.ev.ev > 0 ? 'call' : 'fold';
      const tolPct = opts.loose ? 0.1 : 0;
      const gCount = (label, resp, ans) => {
        const v = parseNum(resp);
        const tol = Math.round(ans * tolPct);
        return { label, your: isNaN(v) ? '—' : String(v), correct: String(ans) + (tol ? ` (±${tol})` : ''), ok: !isNaN(v) && Math.abs(v - ans) <= tol };
      };
      const parts = chainParts(sp);
      const sol = parts.join('');
      const e = sp.ev.equity;
      return {
        drill: '4B', target: 60, board: sp.board, hero: sp.hero,
        promptHtml: spotPrompt(sp) + `<br>跟住 7 步諗：數 ② value / ③ bluff combos（已計 board 同你嘅 blockers），然後 ⑦ call 定 fold？`,
        extraHtml: gridHtml(sp.rangeStr, sp.rows, false),
        revealHtml: gridHtml(sp.rangeStr, sp.rows, true),
        inputs: opts.decisionOnly ? [] : [{ key: 'v', label: 'Value combos', kind: 'int' }, { key: 'b', label: 'Bluff combos', kind: 'int' }],
        actions: ['call', 'fold'],
        data: { board: sp.board, hero: sp.hero, P: sp.P, B: sp.B, rangeStr: sp.rangeStr },
        answer: { v: sp.V, b: sp.Bl, chop: sp.T, decision: decide, ev: sp.ev.ev, req: sp.req, equity: e },
        grade: (r) => {
          const rows = [];
          if (!opts.decisionOnly) { rows.push(gCount('Value combos', r.v, sp.V)); rows.push(gCount('Bluff combos', r.b, sp.Bl)); }
          rows.push({ label: 'Decision', your: r.action || '—', correct: decide, ok: r.action === decide });
          return finish(rows);
        },
        solutionHtml: sol,
      };
    },
  };


  // ---------------- 4T thought-chain river drill (7 graded steps) ----------------
  const T_TARGETS = [15, 25, 20, 8, 5, 15, 5];
  D['4T'] = {
    level: 4, title: '4T 思路鏈：River 7 步', desc: '① range → ② value → ③ bluff → ④ bluff% → ⑤ required → ⑥ blockers → ⑦ decision', target: 15,
    generate(rng) {
      const sp = gen4BSpot(rng);
      const parts = chainParts(sp);
      const N = sp.V + sp.Bl + sp.T, e = sp.ev.equity, decide = sp.ev.ev > 0 ? 'call' : 'fold';
      const truth = [`① ${N} live`, `② value ${sp.V}`, `③ bluff ${sp.Bl}${sp.T ? ` (chop ${sp.T})` : ''}`, `④ ${pct(e)}`, `⑤ ${pct(sp.req)}`, `⑥ block V${sp.blkV} / B${sp.blkB}`];
      const data = { board: sp.board, hero: sp.hero, P: sp.P, B: sp.B, rangeStr: sp.rangeStr, valueClasses: sp.valueClasses };
      const Q = [
        { q: '扣咗 board 同你手牌之後，range 仲有幾多個 <b>live combos</b>？', inputs: [{ key: 'n', label: 'Live combos', kind: 'int' }], answer: { n: N }, grade: (r) => finish([gInt('① Live combos', r.n, N)]) },
        { q: '入面有幾多個 combos <b>贏你</b>（value）？', inputs: [{ key: 'n', label: 'Value combos', kind: 'int' }], answer: { n: sp.V }, grade: (r) => finish([gInt('② Value', r.n, sp.V)]) },
        { q: '有幾多個 combos <b>輸俾你</b>（bluff）？', inputs: [{ key: 'n', label: 'Bluff combos', kind: 'int' }], answer: { n: sp.Bl }, grade: (r) => finish([gInt('③ Bluff', r.n, sp.Bl)]) },
        { q: 'Bluff 佔幾多 %（= 你 call 嘅 equity）？', inputs: [{ key: 'p', label: 'Bluff %', kind: 'pct' }], answer: { p: e }, grade: (r) => finish([gPct('④ Bluff %', r.p, e, 1)]) },
        { q: 'Call 需要幾多 equity（required %）？', inputs: [{ key: 'p', label: 'Required %', kind: 'pct' }], answer: { p: sp.req }, grade: (r) => finish([gPct('⑤ Required %', r.p, sp.req, 1)]) },
        { q: '你手牌移除咗 range 入面幾多個 <b>value</b> combos 同幾多個 <b>bluff</b> combos？', inputs: [{ key: 'v', label: 'Blocked value', kind: 'int' }, { key: 'b', label: 'Blocked bluff', kind: 'int' }], answer: { v: sp.blkV, b: sp.blkB }, grade: (r) => finish([gInt('⑥ Blocked value', r.v, sp.blkV), gInt('⑥ Blocked bluff', r.b, sp.blkB)]) },
        { q: '<b>Call 定 fold？</b>', inputs: [], actions: ['call', 'fold'], answer: { decision: decide }, grade: (r) => finish([{ label: '⑦ Decision', your: r.action || '—', correct: decide, ok: r.action === decide }]) },
      ];
      const steps = Q.map((x, i) => ({
        drill: '4T', target: T_TARGETS[i], board: sp.board, hero: sp.hero,
        promptHtml: spotPrompt(sp) + `<div class="chainbar">${NUM.map((n, j) => `<span class="${j < i ? 'done' : j === i ? 'now' : ''}">${n}</span>`).join('')}</div>` +
          (i ? `<div class="known">已知：${truth.slice(0, i).join(' · ')}</div>` : '') + `<div class="stepq">${chip(i)} ${x.q}</div>`,
        extraHtml: gridHtml(sp.rangeStr, sp.rows, i >= 3),
        revealHtml: i === 2 ? gridHtml(sp.rangeStr, sp.rows, true) : undefined,
        inputs: x.inputs, actions: x.actions, data: Object.assign({ step: i }, data), answer: x.answer, grade: x.grade,
        solutionHtml: parts[i],
      }));
      return { drill: '4T', steps, data };
    },
  };

  // ---------------- 4E MDF exploit drill (curriculum 4F) ----------------
  const PROFILES = {
    nit: { name: '🧊 Nit／保守玩家', desc: 'river 大注好少 bluff（低級別好常見）', f: (rng) => 0.25 + rng() * 0.4 },
    reg: { name: '🎯 大致平衡嘅 reg', desc: 'bluff 頻率接近理論值，但略有偏差', f: (rng) => (rng() < 0.5 ? 0.78 + rng() * 0.14 : 1.08 + rng() * 0.14) },
    maniac: { name: '🔥 Maniac／好鍾意 bluff', desc: '乜都 bet，bluff 好多', f: (rng) => 1.4 + rng() * 0.8 },
  };
  D['4E'] = {
    level: 4, title: '4E MDF exploit：對手類型', desc: 'MDF 係護欄：對手 bluff 少就 fold 多，bluff 多就 call 多', target: 12,
    generate(rng) {
      for (let k = 0; k < 100; k++) {
        const P = PT.randInt(rng, 10, 150);
        const [s, sLabel] = PT.pick(rng, RIVER_SIZES);
        const B = Math.max(1, Math.round(P * s));
        const req = M.reqEquity(P, B), mdf = M.mdf(P, B);
        const key = PT.pick(rng, ['nit', 'nit', 'reg', 'maniac']);
        const X = Math.min(75, Math.max(2, Math.round(req * 100 * PROFILES[key].f(rng))));
        if (Math.abs(X - req * 100) < 2) continue;
        const b = X / 100, decide = b > req ? 'call' : 'fold';
        const ev = b * (P + B) - (1 - b) * B;
        const pr = PROFILES[key];
        return {
          drill: '4E', target: 12, board: [], hero: [],
          promptHtml: `River：pot <b>${P}</b>，對手 bet <b>${B}</b>（≈${potTxt(sLabel)}）。<br>對手類型：<b>${pr.name}</b>（${pr.desc}）。<br>你嘅紀錄顯示：佢呢種 bet 入面大約 <b>${X}%</b> 係 bluff。你手上係 bluff-catcher（贏晒佢 bluff、輸晒佢 value）。<br>• MDF 係幾多？　• Call 定 fold？`,
          inputs: [{ key: 'm', label: 'MDF %', kind: 'pct' }], actions: ['call', 'fold'],
          data: { P, B, X, profile: key }, answer: { mdf, decision: decide, ev, req },
          grade: (r) => finish([gPct('MDF', r.m, mdf, 2), { label: '⑦ Decision', your: r.action || '—', correct: decide, ok: r.action === decide }]),
          solutionHtml: `<ol class="steps"><li>MDF = P ÷ (P + B) = ${P} ÷ ${P + B} = <b>${pct(mdf)}</b>：<span class="plain">如果對手 bluff 得啱啱好，你要守住咁多。</span></li>
            <li>${chip(4)} = B ÷ (P + 2B) = ${B} ÷ ${P + 2 * B} = <b>${pct(req)}</b>：平衡 range 入面 bluff 應該係 ${pct(req)}。</li>
            <li>${chip(3)} = 對手實際 <b>${X}%</b>（你嘅 bluff-catcher 嘅 equity）。</li>
            <li>${chip(6)}：${X}% ${b > req ? '>' : '<'} ${pct(req)} → <b class="dec ${decide}">${decide.toUpperCase()}</b>。EV(call) = ${num(b, 2)} × ${P + B} − ${num(1 - b, 2)} × ${B} = <b>${num(ev, 2)}</b>bb</li></ol>
            <div class="plain"><b>白話：</b>${b > req ? `佢 bluff 多過平衡（${X}% > ${pct(req, 0)}）→ 你嘅 bluff-catcher call 有錢賺，甚至可以守多過 MDF。` : `佢 bluff 少過平衡（${X}% < ${pct(req, 0)}）→ 你 call 嘅時候大部分撞正 value，照 MDF 守會蝕錢 → 應該守少過 MDF。`}</div>
            <div class="tip">MDF 係護欄唔係規則：佢只係假設對手 bluff 得啱啱好。真正決定永遠睇 ④ 實際 bluff % vs ⑤ required %。</div>`,
        };
      }
      throw new Error('4E generator failed');
    },
  };

  // ---------------- 4C EV(call) ----------------
  D['4C'] = {
    level: 4, title: '4C EV(call) 快算', desc: 'EV = (equity − required) × final pot', target: 10,
    generate(rng) {
      const P = PT.randInt(rng, 10, 150);
      const [s] = PT.pick(rng, RIVER_SIZES);
      const B = Math.max(1, Math.round(P * s));
      const b = PT.randInt(rng, 15, 55) / 100;
      const ev = b * (P + B) - (1 - b) * B;
      const req = M.reqEquity(P, B);
      const tolAbs = Math.max(0.15 * Math.abs(ev), 0.5);
      return {
        drill: '4C', target: 10, board: [], hero: [],
        promptHtml: `River：villain bluff share <b>${Math.round(b * 100)}%</b>（你嘅 bluff-catcher 淨係贏 bluff）。Pot <b>${P}</b>，bet <b>${B}</b>。Call 嘅 EV 係幾多 bb？`,
        inputs: [{ key: 'ev', label: 'EV (bb)', kind: 'num' }],
        data: { P, B, b }, answer: { ev },
        grade: (r) => {
          const v = parseNum(r.ev);
          const ok = !isNaN(v) && Math.sign(v) === Math.sign(ev) && Math.abs(v - ev) <= tolAbs + 1e-9;
          return finish([{ label: 'EV', your: isNaN(v) ? '—' : String(v), correct: `${num(ev, 2)} (±${num(tolAbs, 2)}, 正負號要啱)`, ok }]);
        },
        solutionHtml: `精確：EV = b×(P+B) − (1−b)×B = ${b}×${P + B} − ${num(1 - b, 2)}×${B} = <b>${num(ev, 2)}</b><br>` +
          `快算：required = ${B}/${P + 2 * B} = ${pct(req)}；EV = (${pct(b, 0)} − ${pct(req)}) × ${P + 2 * B} = ${num((b - req) * (P + 2 * B), 2)}`,
      };
    },
  };

  PT.drillList = () => LEVELS.flatMap((l) => l.drills);
})(typeof globalThis !== 'undefined' ? globalThis : this);
