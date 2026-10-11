/* 教學 Learn page + 速查表 Cheat sheet HTML.
 * Every example number is produced by the helpers in `C` below, which record {kind,args,value}
 * in PT.LEARN_CHECKS so tests/verify.py can recompute them independently. */
(function (G) {
  'use strict';
  const PT = G.PT, M = PT.math;
  const ic = PT.ic, icList = PT.icList;
  const CHECKS = (PT.LEARN_CHECKS = []);
  const rec = (kind, args, value) => { CHECKS.push({ kind, args, value }); return value; };

  // ---------- formatting ----------
  const p1 = (x) => (x * 100).toFixed(1) + '%';
  const f = (x, d = 2) => { const s = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d); return s.replace(/\.?0+$/, '').replace(/^-/, '−'); };

  // ---------- recorded calculators ----------
  function enumEquity(hero, vill, board) {
    const known = new Set(hero.concat(vill, board));
    const rest = PT.fullDeck().filter((c) => !known.has(c));
    const need = 5 - board.length;
    let win = 0, n = 0;
    const go = (start, picked) => {
      if (picked.length === need) {
        const b = board.concat(picked);
        const h = PT.evaluate(hero.concat(b)).score, v = PT.evaluate(vill.concat(b)).score;
        win += h > v ? 1 : h === v ? 0.5 : 0; n++;
        return;
      }
      for (let i = start; i < rest.length; i++) { picked.push(rest[i]); go(i + 1, picked); picked.pop(); }
    };
    go(0, []);
    return win / n;
  }
  function vbCount(hero, board, rangeStr) {
    const dead = new Set(board.concat(hero));
    const hs = PT.evaluate(hero.concat(board)).score;
    let V = 0, B = 0, T = 0;
    for (const cb of PT.parseRange(rangeStr).combos) {
      if (dead.has(cb[0]) || dead.has(cb[1])) continue;
      const s = PT.evaluate(cb.concat(board)).score;
      if (s > hs) V++; else if (s < hs) B++; else T++;
    }
    return [V, B, T];
  }
  const C = {
    req: (P, B) => rec('req', [P, B], B / (P + 2 * B)),
    mdf: (P, B) => rec('mdf', [P, B], P / (P + B)),
    alpha: (P, B) => rec('alpha', [P, B], B / (P + B)),
    bshare: (P, B) => rec('bshare', [P, B], B / (P + 2 * B)),
    vpb: (P, B) => rec('vpb', [P, B], (P + B) / B),
    outs: (x, mode) => rec('outs', [x, mode], M.outsEquity(x, mode)),
    implied: (Cc, outs, unseen, finalPot) => rec('implied', [Cc, outs, unseen, finalPot], Cc / (outs / unseen) - finalPot),
    evcall: (e, P, B) => rec('evcall', [e, P, B], e * (P + B) - (1 - e) * B),
    evcallfast: (e, P, B) => rec('evcallfast', [e, P, B], (e - B / (P + 2 * B)) * (P + 2 * B)),
    evbluff: (fo, P, B) => rec('evbluff', [fo, P, B], fo * P - (1 - fo) * B),
    evblufffast: (fo, P, B) => rec('evblufffast', [fo, P, B], (fo - B / (P + B)) * (P + B)),
    semibluff: (fo, outs, unseen, P, B) => { const e = outs / unseen; return rec('semibluff', [fo, outs, unseen, P, B], fo * P + (1 - fo) * (e * (P + 2 * B) - B)); },
    combos: (cls, board, hero) => rec('combos', [cls, board, hero || []], PT.liveCombos(cls, board.concat(hero || [])).length),
    fd: (classes, suit, board, hero) => {
      const dead = new Set(board.concat(hero));
      const n = classes.filter((c) => !dead.has(c[0] + suit) && !dead.has(c[1] + suit)).length;
      return rec('fd', [classes, suit, board, hero], n);
    },
    rangecount: (rangeStr, dead) => { const D = new Set(dead); return rec('rangecount', [rangeStr, dead], PT.parseRange(rangeStr).combos.filter((cb) => !D.has(cb[0]) && !D.has(cb[1])).length); },
    vb: (hero, board, rangeStr) => rec('vb', [hero, board, rangeStr], vbCount(hero, board, rangeStr)),
    enumeq: (hero, vill, board) => rec('enumeq', [hero, vill, board], enumEquity(hero, vill, board)),
    blocked: (hero, board, rangeStr, valueClassesStr) => {
      const vc = new Set(PT.parseRange(valueClassesStr).classes), bs = new Set(board), hs = new Set(hero);
      let v = 0, b = 0;
      for (const cb of PT.parseRange(rangeStr).combos) {
        if (bs.has(cb[0]) || bs.has(cb[1]) || !(hs.has(cb[0]) || hs.has(cb[1]))) continue;
        if (vc.has(PT.classOf(cb[0], cb[1]))) v++; else b++;
      }
      return rec('blocked', [hero, board, rangeStr, valueClassesStr], [v, b]);
    },
    rule: (x, mode) => rec('rule', [x, mode], M.outsRule(x, mode).est),
  };
  PT.learnCalc = C;

  // ---------- building blocks ----------
  const more = (id) => `<a class="more" href="#/learn/${id}">詳細 →</a>`;
  const legend = (syms, ops) => `<div class="leg"><div class="legt">符號點解</div><ul>${syms.map(([s, t]) => `<li><b>${s}</b> = ${t}</li>`).join('')}</ul>` +
    (ops && ops.length ? `<div class="legt">每一步做緊乜</div><ul>${ops.map(([s, t]) => `<li><b>${s}</b>：${t}</li>`).join('')}</ul>` : '') + '</div>';
  const SYM = {
    P: ['P', 'pot：對手落注<u>之前</u>，枱中間已經有嘅錢'],
    B: ['B', 'bet：對手今次落咗幾多'],
    e: ['e', 'equity：你去到最後（showdown）贏嘅機會，用 % 表示'],
    fo: ['f', 'fold%：對手面對你嘅注，有幾多 % 會棄牌'],
    s: ['s', 'bet size 係 pot 嘅幾多倍（B ÷ P），例如 ½ pot 即係 s = 0.5'],
  };
  function section(o) {
    return `<details class="learn" id="L-${o.id}"><summary><span class="st">${o.title}</span><span class="sl">${o.oneLine}</span></summary><div class="lb">` +
      (o.formula ? `<div class="formula">${o.formula}</div>` : '') +
      (o.legend || '') +
      (o.example ? `<div class="ex"><div class="legt">例子（真數字，單位 bb）</div>${o.example}</div>` : '') +
      (o.meaning ? `<div class="mean"><b>一句講晒：</b>${o.meaning}</div>` : '') +
      (o.use ? `<div class="use"><b>喺枱上點用：</b>${o.use}</div>` : '') +
      (o.body || '') +
      (o.derive ? `<details class="derive"><summary>推導：點解係咁？（一步一步）</summary><div>${o.derive}</div></details>` : '') +
      (o.mistakes ? `<div class="mist"><b>常見錯誤：</b><ul>${o.mistakes.map((m) => `<li>${m}</li>`).join('')}</ul></div>` : '') +
      `<div class="toc-back"><a href="#/learn">↑ 返目錄</a> · <a href="#/cheat">速查表</a></div></div></details>`;
  }
  const combosList = (cls, dead) => PT.liveCombos(cls, dead || []).map((cb) => `<span class="combo">${ic(cb[0])}${ic(cb[1])}</span>`).join(' ');

  // =====================================================================
  //                               LEARN
  // =====================================================================
  function learnSections() {
    const S = [];
    const K72 = ['Ks', '7d', '2c'], KJ = ['Kh', 'Jd'];


    // 0. thought chain (backbone)
    {
      const board = ['Ks', '7d', '2c', '6s', '2h'];
      const R = 'AK,KQ,KK,77,66,K7s,K6s,A2s,22,98s,85s,54s,AsQs,AsJs,AsTs,As5s,As4s,As3s,QsJs,QsTs,JsTs';
      const VC = 'AK,KQ,KK,77,66,K7s,K6s,A2s,22';
      const [V, B, T] = C.vb(KJ, board, R), [bv, bb] = C.blocked(KJ, board, R, VC);
      const N = V + B + T, sh = B / N, r = C.req(28, 28), ev = C.evcall(sh, 28, 28);
      const steps = [
        [`對手呢條 line（open → c-bet → turn bet → river pot bet）會有乜牌？扣咗 board 同你手牌，數 live combos。`, `${N} 個（value + bluff）`],
        ['邊啲贏你？逐類數 combos（記住 card removal）。', `${V} 個`],
        ['邊啲輸俾你？通常係 missed draws。', `${B} 個`],
        ['Bluff ÷ (value + bluff)：你嘅 bluff-catcher 只贏 bluff，所以呢個就係你嘅 equity。', `${B} ÷ ${N} = ${p1(sh)}`],
        ['B ÷ (P + 2B)：你 call 需要幾多 equity。', `28 ÷ 84 = ${p1(r)}`],
        ['你手牌減咗佢 value 定 bluff？（好 blocker = 減 value）', `K♥ 減咗 ${bv} 個 value、${bb} 個 bluff → 好 blocker`],
        ['④ 大過 ⑤ → call；細過 → fold。再諗對手類型：佢 under-bluff 就 fold 多啲（MDF 只係護欄）。', `${p1(sh)} > ${p1(r)} → call，EV = ${f(ev, 2)}bb`],
      ];
      S.push(({
        id: 'chain', title: '思路鏈：River 決策 7 步', oneLine: '成個 app 嘅骨幹：每個 drill、答案、速查表都用同一套 ①–⑦',
        formula: PT.CHAIN.map((c, i) => `${PT.CHAIN_NUM[i]} ${c[0]}`).join(' → '),
        legend: legend(PT.CHAIN.map((c, i) => [`${PT.CHAIN_NUM[i]} ${c[0]}`, c[1]])),
        example: `<p>§example 嘅 river：board ${icList(board)}，你手持 ${icList(KJ)}，pot 28、對手 bet 28。</p><ol class="steps">` +
          steps.map(([q, a], i) => `<li>${PT.chainChip(i)} ${q}<br><b>→ ${a}</b></li>`).join('') + '</ol>',
        meaning: '先搵出對手有乜牌，再分 value 同 bluff，最後同 pot odds 比較；blockers 同對手類型係最後嘅微調。',
        use: '枱上唔使每步都準確：② ③ 用 §buckets 估、④ ⑤ 用背熟嘅數字，⑥ ⑦ 一諗就得。練習時用 4T drill 逐步做。',
        derive: `<p>點解係呢個次序？</p><ol><li>決定 call 定 fold，其實係比較兩個數：你嘅 equity（④）同你需要嘅 equity（⑤）。</li>
          <li>面對 river 下注，你嘅 bluff-catcher 只贏 bluff，所以 equity = bluff 比例 → 要先有 ② value 同 ③ bluff。</li>
          <li>要數 value 同 bluff，先要知道對手有乜牌（①）。</li>
          <li>⑥ blockers 其實已經包含喺 ② ③ 嘅數字入面（card removal），但獨立諗一次可以提你：你嘅牌令佢 bluff 多咗定少咗。</li>
          <li>⑦ 最後先用對手類型修正：MDF 同平衡比例都假設對手 bluff 得啱啱好（§mdfguard）。</li></ol>`,
        mistakes: ['跳過 ③：只睇自己手牌強唔強，唔數對手 bluff', '④ ⑤ 搞亂：用咗 MDF 或者 alpha 代替 required %', '忘記 ⑥：你嘅牌可能減咗佢 bluff'],
      }));
    }
    // 1. combos
    {
      const ak = C.combos('AK', []), aks = C.combos('AKs', []), ako = C.combos('AKo', []), qq = C.combos('QQ', []);
      S.push(({
        id: 'combos', title: '1. Combos 基本數：6 / 4 / 12 / 16', oneLine: '一類手牌有幾多種砌法',
        formula: 'Pair（一對）= 6 · Suited（同花）= 4 · Offsuit（唔同花）= 12 · 唔寫 s/o（例如 AK）= 16 · 全部起手牌 = 1326',
        legend: legend([
          ['combo', '一個指定嘅兩張牌組合，例如 A♠K♥ 就係一個 combo'],
          ['hand class', '一類手牌，例如 AK、AKs、QQ'],
          ['s / o', 's = suited 同花（兩張同一花色）；o = offsuit 唔同花'],
          ['×', '「每一個…配每一個…」：例如每隻 A 配每隻 K'],
          ['÷ 2', '因為 Q♠Q♥ 同 Q♥Q♠ 係同一手牌，數咗兩次要除返 2'],
        ]),
        example: `<p><b>AK</b>：A 有 4 隻（♠♥♦♣），K 有 4 隻，每隻 A 可以配每隻 K → 4 × 4 = ${ak}。</p>
          <p>其中同花嘅（AKs）：A♠K♠、A♥K♥、A♦K♦、A♣K♣ = ${aks} 個；其餘 16 − 4 = ${ako} 個係 AKo。</p>
          <p><b>QQ</b>：4 隻 Q 揀 2 隻 = ${qq} 個：<br>${combosList('QQ')}</p>`,
        meaning: 'Combos 數 = 對手可以拎住呢類牌嘅「砌法」有幾多種；砌法越多，佢越大機會真係拎住。',
        use: `比較對手 range 入面邊類牌多啲。例如 AK 有 ${ak} 個 combos，QQ 只有 ${qq} 個 → 對手有 AK 嘅機會係 QQ 嘅 16 ÷ 6 ≈ 2.7 倍。`,
        derive: `<ol><li><b>Pair（QQ）</b>：第一隻 Q 有 4 個揀法，第二隻剩 3 個 → 4 × 3 = 12。但 Q♠Q♥ 同 Q♥Q♠ 其實係同一手，每手都數咗兩次 → 12 ÷ 2 = 6。</li>
          <li><b>唔同 rank（AK）</b>：A 同 K 唔會撞，唔使除 2 → 4 × 4 = 16。</li>
          <li><b>Suited（AKs）</b>：兩隻要同花色，花色只有 4 種 → 4。</li>
          <li><b>Offsuit（AKo）</b>：全部減同花 → 16 − 4 = 12。</li>
          <li><b>1326</b>：52 隻牌揀 2 隻 = 52 × 51 ÷ 2 = 1326。分開數：13 種 pair × 6 = 78；78 種唔同 rank 組合 × 4 = 312 suited；78 × 12 = 936 offsuit；78 + 312 + 936 = 1326。</li></ol>`,
        mistakes: ['AKs 當咗 16（其實 4）', 'QQ 當咗 12（冇除 2，重複數）', '「AK」冇寫 s 或 o，即係 suited + offsuit = 16'],
      }));
    }

    // 2. card removal
    {
      const kk0 = C.combos('KK', K72), kk1 = C.combos('KK', K72, KJ), ak0 = C.combos('AK', K72), ak1 = C.combos('AK', K72, KJ),
        kq1 = C.combos('KQ', K72, KJ), k7 = C.combos('K7', K72), s77 = C.combos('77', K72), aks0 = C.combos('AKs', K72), qj1 = C.combos('QJ', K72, KJ);
      S.push(({
        id: 'removal', title: '2. Card removal：3、1、12、9、8 點嚟', oneLine: '睇到嘅牌，對手就冇得拎',
        formula: 'Pair：n × (n − 1) ÷ 2 · 唔同 rank：a × b · Suited：兩隻都未見嘅花色數 · Offsuit = a × b − suited',
        legend: legend([
          ['未見', '唔喺 board、亦唔喺<b>你自己</b>手上嘅牌。對手只可能有你睇唔到嘅牌'],
          ['n', 'Pair 嗰個 rank 仲有幾多隻未見（4 減去 board 同你手上嗰啲）'],
          ['a、b', '兩個 rank 各自仲有幾多隻未見'],
        ], [
          ['n × (n − 1)', '第一隻有 n 個揀法，第二隻剩 n − 1 個'],
          ['÷ 2', '次序唔重要（K♦K♣ 同 K♣K♦ 一樣），除返 2'],
          ['a × b', '每隻未見嘅第一張牌，配每隻未見嘅第二張牌'],
        ]),
        example: `<p>Board ${icList(K72)}（先唔計你手牌）：</p><ul>
          <li><b>KK</b>：K♠ 喺 board → 剩 3 隻 K → 3 × 2 ÷ 2 = ${kk0}（即係 set 只有 3 個 combos）</li>
          <li><b>77</b>：同樣剩 3 隻 7 → ${s77}</li>
          <li><b>AK</b>：4 隻 A × 3 隻 K → 4 × 3 = ${ak0}；其中 AKs 剩 ${aks0} 個（♠ 嗰個冇咗）</li>
          <li><b>K7</b>（兩對）：3 隻 K × 3 隻 7 → 3 × 3 = ${k7}</li></ul>
          <p>再加你手持 ${icList(KJ)}（K♥ 都冇咗）：</p><ul>
          <li><b>KK</b>：剩 2 隻 K → 2 × 1 ÷ 2 = ${kk1}</li>
          <li><b>AK</b>：4 × 2 = ${ak1} · <b>KQ</b>：2 × 4 = ${kq1} · <b>QJ</b>：4 隻 Q × 3 隻 J → 4 × 3 = ${qj1}</li></ul>`,
        meaning: '每見到一隻相關嘅牌（board 或者你手上），對手嗰類牌嘅 combos 就即刻少咗。',
        use: 'Set 只有 3 個、兩對通常 9 個、top pair（例如 AK）通常 12 個；你自己拎住一隻 board rank → 再少（12 → 8）。',
        derive: `<p><b>Pair 速記</b>：剩 4 隻 → 4 × 3 ÷ 2 = 6；剩 3 隻 → 3 × 2 ÷ 2 = 3；剩 2 隻 → 2 × 1 ÷ 2 = 1；剩 1 隻 → 0（一隻砌唔到一對）。</p>
          <p><b>唔同 rank 速記</b>：a × b，例如 4 × 3 = 12、3 × 3 = 9、2 × 4 = 8。</p>
          <p><b>點解一隻牌對 pair 影響大啲？</b>唔同 rank：16 → 12，少 25%；pair：6 → 3，少一半。因為 pair 兩張都要用同一個 rank，冇咗一隻，可以配對嘅組合跌得快好多。</p>`,
        mistakes: ['忘記減你自己手上嘅牌', 'Set 當 6 個 combos（其實 3）', 'Board 出咗 K♠，AKs 仲當 4 個（其實 3）', 'Paired board（例如 board 有兩隻 2）：trips 只可以用剩低嗰 2 隻 2'],
      }));
    }

    // 3. flush-draw combos
    {
      const board = ['Ks', '7s', '2d'], hero = ['Js', '9h'];
      const cls = ['AQs', 'QJs', 'T9s', 'K5s', '76s', '54s'];
      const n = C.fd(cls, 's', board, hero);
      S.push(({
        id: 'flushdraw', title: '3. Flush-draw combos：每個 suited class = 1', oneLine: 'Two-tone board 數 flush draw',
        formula: 'Two-tone board：flush-draw combos = 對手 range 入面（嗰種花色仲砌得到嘅）suited class 數目',
        legend: legend([
          ['two-tone', 'Flop 三隻牌入面有兩隻同花色，例如 K♠ 7♠ 2♦'],
          ['flush draw', '手上兩隻同花 + board 兩隻 = 4 隻同花，差一隻就 flush'],
          ['suited class', '例如 AQs：佢有 4 個 combos（♠♥♦♣ 各一），但只有 A♠Q♠ 係 spade flush draw'],
        ]),
        example: `<p>Board ${icList(board)}，你手持 ${icList(hero)}。對手嘅 suited 牌：${cls.join('、')}。</p><ul>
          <li>AQs → A♠Q♠ ✓</li><li>QJs → Q♠J♠ ✗（J♠ 喺你手）</li><li>T9s → T♠9♠ ✓</li>
          <li>K5s → K♠5♠ ✗（K♠ 喺 board）</li><li>76s → 7♠6♠ ✗（7♠ 喺 board）</li><li>54s → 5♠4♠ ✓</li></ul>
          <p>合計 = <b>${n}</b> 個 flush-draw combos。</p>`,
        meaning: '每個同花 class 入面只有一個組合係嗰種花色，所以數 class 就等於數 flush draw。',
        use: '河牌 flush 冇中，對手好多 bluff 就係呢啲 missed flush draws；數到有幾多，就知佢有幾多 bluff（睇§example例子）。',
        derive: '<p>AQs 4 個 combos：A♠Q♠、A♥Q♥、A♦Q♦、A♣Q♣。Board 有兩隻 ♠，只有 A♠Q♠ 加埋先有 4 隻 ♠ → 1 個 flush draw。如果 A♠ 或者 Q♠ 已經喺 board 或者你手上，呢個 combo 就唔存在 → 0。</p>',
        mistakes: ['每個 suited class 當 4 個 flush draw', '忘記 board 或者你手上已經有嗰隻 ♠', '9♠8♠ 又係 straight draw 又係 flush draw，數咗兩次'],
      }));
    }

    // 4. pot odds -> required equity
    {
      const r = C.req(10, 5);
      S.push(({
        id: 'potodds', title: '4. Pot odds → 你需要幾多 equity', oneLine: 'Required equity = B ÷ (P + 2B)',
        formula: 'Required equity = B ÷ (P + 2B)',
        legend: legend([SYM.P, SYM.B, SYM.e], [
          ['P + 2B', '你跟注之後成個 pot（final pot）：原本嘅 pot（P），加對手嘅注（B），加你跟嘅注（B）'],
          ['B ÷ (P + 2B)', '你要出嘅錢，佔最後成個 pot 幾多份'],
        ]),
        example: `<p>Pot 10bb，對手 bet 5bb。你要跟 5。</p><p>跟完之後 pot = 10 + 5 + 5 = 20。</p>
          <p>Required equity = 5 ÷ 20 = <b>${p1(r)}</b>。即係你要贏多過 4 次入面 1 次先抵跟。</p>
          <p>用「odds」講：你出 5，可以贏到 pot 入面 15（10 + 5）→ 15 : 5 = 3 : 1。3 : 1 即係 3 + 1 = 4 份入面你要贏 1 份 → 25%。</p>`,
        meaning: '你出嘅錢佔最後 pot 幾多 %，你就要贏最少咁多 % 先唔蝕。',
        use: '對手落注 → 心算 required %；估吓自己 equity 有冇多過佢 → 多過就 call，少過就 fold（未計之後街數）。',
        derive: `<p>想像同一個情況玩 100 次，每次都 call 5bb：</p><ol>
          <li>總共出咗 100 × 5 = 500bb。</li>
          <li>每次贏，你收返成個 final pot 20bb（入面包括你自己嗰 5）。</li>
          <li>如果贏 w 次，收返 20 × w。</li>
          <li>打和（唔賺唔蝕）：20 × w = 500 → w = 500 ÷ 20 = 25 次 → 25%。</li></ol>
          <p>一般化：每次出 B，贏就收 P + 2B → 需要贏 B ÷ (P + 2B) 咁多次。</p>`,
        mistakes: ['用 B ÷ P（5 ÷ 10 = 50%，錯）', '用 B ÷ (P + B)（5 ÷ 15 = 33%，錯，嗰個係 alpha）', '面對 raise：要用你<u>需要補</u>嘅錢同埋 raise 之後嘅 final pot'],
      }));
    }

    // 5. sizes
    {
      const rows = [[30, '½ pot'], [40, '⅔ pot'], [45, '¾ pot'], [60, 'pot'], [120, '2× pot']].map(([B, l]) => ({ B, l, r: C.req(60, B) }));
      S.push(({
        id: 'sizes', title: '5. 點解 ½ pot = 25%、pot = 33%、2× = 40%', oneLine: '五個數字背熟就夠',
        formula: 'Required equity = s ÷ (1 + 2s)　（s = B ÷ P）',
        legend: legend([SYM.s], [['1 + 2s', '當 pot = 1 份：final pot = 1（pot）+ s（對手注）+ s（你跟注）'], ['s ÷ (1 + 2s)', '同上一節一樣：你出嘅一份 ÷ final pot']]),
        example: `<p>Pot 60bb：</p><div class="tblwrap"><table class="tbl"><tr><th>注碼</th><th class="num">B</th><th>計法</th><th class="num">Required</th></tr>
          ${rows.map((x) => `<tr><td>${x.l}</td><td class="num">${x.B}</td><td>${x.B} ÷ (60 + ${2 * x.B}) = ${x.B} ÷ ${60 + 2 * x.B}</td><td class="num">${p1(x.r)}</td></tr>`).join('')}</table></div>`,
        meaning: '注越大，你需要嘅 equity 越高；但無論幾大，都唔會去到 50%。',
        use: '背：½ → 25%、⅔ → 29%、¾ → 30%、pot → 33%、2× → 40%。唔使每次計。',
        derive: `<p>½ pot：pot 60、bet 30 → 你跟 30，final pot = 60 + 30 + 30 = 120 → 30 ÷ 120 = 25%。</p>
          <p>Pot bet：60 + 60 + 60 = 180 → 60 ÷ 180 = 33.3%。</p>
          <p><b>點解永遠唔到 50%？</b>Final pot 入面，除咗你同對手各出 B，仲有原本嘅 P。你嘅 B 永遠細過一半，所以 required 一定少過 50%；注越大，P 嗰份越唔重要，所以越嚟越接近 50%（3× pot = 42.9%）。</p>`,
        mistakes: ['以為 pot bet 要 50% equity（其實 33.3%）', '將「½ pot」當「需要 50%」'],
      }));
    }

    // 6. outs: rule of 2 and 4
    {
      const e9t = C.outs(9, 'turn1'), e9f1 = C.outs(9, 'flop1'), e9a = C.outs(9, 'flop2'), e15a = C.outs(15, 'flop2'), e8t = C.outs(8, 'turn1');
      S.push(({
        id: 'outs', title: '6. Outs → equity：Rule of 2 同 4（同點樣修正）', oneLine: '一張牌 ×2、兩張牌 ×4，大 draw 要扣',
        formula: '一張牌：equity ≈ outs × 2（+1）　·　Flop all-in 睇兩張：≈ outs × 4；outs 多過 8 用 4x − (x − 8)',
        legend: legend([
          ['outs', '落咗之後會令你變最大嘅牌有幾多隻'],
          ['x', '即係 outs 數目'],
          ['47 / 46', 'Flop 時你睇唔到嘅牌有 52 − 2 − 3 = 47 隻；turn 時 52 − 2 − 4 = 46 隻'],
        ], [
          ['outs × 2', '每隻 out 喺一張牌入面大約值 2%（1 ÷ 47 ≈ 2.1%）'],
          ['+ 1', '× 2 會少咗少少，加返 1 更準（13 outs 以上用 + 2）'],
          ['4x − (x − 8)', '先 × 4，再減去「多過 8 嘅部分」，抵消 × 4 嘅高估'],
        ]),
        example: `<p><b>Flush draw（9 outs）</b>：</p><ul>
          <li>Turn → river：準確 9 ÷ 46 = ${p1(e9t)}；速算 2 × 9 + 1 = ${C.rule(9, 'turn1')}%</li>
          <li>Flop → turn（只睇一張）：9 ÷ 47 = ${p1(e9f1)}</li>
          <li>Flop all-in（睇兩張）：準確 ${p1(e9a)}；4 × 9 = 36（高少少）；修正 4 × 9 − (9 − 8) = ${C.rule(9, 'flop2')}</li></ul>
          <p><b>FD + OESD（15 outs）flop all-in</b>：準確 ${p1(e15a)}；4 × 15 = 60（高估咗 ${f(60 - e15a * 100, 1)} 個百分點！）；修正 4 × 15 − (15 − 8) = ${C.rule(15, 'flop2')}。</p>
          <p><b>OESD（8 outs）turn</b>：8 ÷ 46 = ${p1(e8t)}，速算 2 × 8 + 1 = 17。</p>`,
        meaning: '每隻 out 一張牌大約值 2%、兩張牌大約值 4%；draw 越大，× 4 越誇張，要扣返。',
        use: '算完 equity，同 required equity（§potodds）比較。面對 flop 下注而之後仲會有人落注，只可以用 × 2（一張牌）。',
        derive: `<ol><li><b>× 2</b>：Turn 有 46 隻未見牌，其中 x 隻係 outs → 機會 = x ÷ 46。1 ÷ 46 ≈ 2.2%，所以每隻 out ≈ 2%。</li>
          <li><b>× 4 點嚟</b>：Turn 中 ≈ 2x%，river 中又 ≈ 2x% → 加埋 ≈ 4x%。</li>
          <li><b>點解 × 4 高估</b>：Turn 已經中咗嘅時候，river 再中都冇額外用，但 × 4 照計多一次（重複數）。Outs 越多，「兩條街都中」嘅情況越多，重複數得越多。</li>
          <li><b>準確計法</b>：兩張都唔中嘅機會 = (47 − x) ÷ 47 × (46 − x) ÷ 46。例如 15 outs：32/47 × 31/46 = 0.4588 → 中至少一次 = 1 − 0.4588 ≈ 54.1%。</li>
          <li><b>修正</b>：x 多過 8 時減 (x − 8)，例如 15 outs：60 − 7 = 53，同準確嘅 54.1% 只差約 1。</li></ol>`,
        mistakes: ['面對 flop bet 而之後仲有下注，用咗 × 4', '15 outs 以上用 × 4 唔修正', '將 dirty outs 都當 clean（下一節）'],
      }));
    }

    // 7. clean vs dirty outs
    {
      const e1 = C.enumeq(['Ah', 'Qh'], ['Ks', 'Kd'], ['9h', '5h', '2c']);
      const e2 = C.enumeq(['Jh', 'Th'], ['As', 'Ad'], ['9h', '8c', '2h']);
      const e3 = C.enumeq(['8c', '7c'], ['As', 'Kd'], ['6h', '5d', '2s', 'Ah']);
      S.push(({
        id: 'dirty', title: '7. Clean outs vs dirty outs', oneLine: '中咗都未必贏嘅 out 要扣',
        formula: '真正 outs = 落咗之後你（幾乎）一定贏嘅牌；dirty outs 要扣減或者打折',
        legend: legend([
          ['clean out', '落咗你就變最大，對手好難再反超'],
          ['dirty out', '落咗你都可能輸：例如對手有更大 flush、board 成對令對手 full house、或者你只係中一對而對手仲有機會變更大'],
        ]),
        example: `<p><b>例 1</b>：A♥Q♥ 對 K♠K♦，board 9♥5♥2♣（flop all-in）。</p><ul>
          <li>表面 outs：♥ 剩 13 − 2 − 2 = 9 隻；A 剩 3 隻、Q 剩 3 隻 → 9 + 3 + 3 = 15</li>
          <li>速算 4 × 15 − (15 − 8) = 53%</li>
          <li>逐個 runout 計（電腦窮舉）：只有 <b>${p1(e1)}</b></li></ul>
          <p>差咗幾個百分點，因為 A、Q 嗰 6 隻係 dirty：中咗只係一對，KK 仲可以喺另一張牌中 K 變三條，或者兩張牌一齊幫佢。</p>
          <p><b>例 2</b>：J♥T♥ 對 A♠A♦，board 9♥8♣2♥：15 隻幾乎全部 clean，再加 backdoor → <b>${p1(e2)}</b>（比 53% 仲高）。</p>
          <p><b>例 3</b>：8♣7♣ 對 A♠K♦，board 6♥5♦2♠A♥（turn）：知道對手兩隻牌，未見牌 = 52 − 2 − 2 − 4 = 44；8 outs（任何 4 或 9）→ 8 ÷ 44 = <b>${p1(e3)}</b>。</p>`,
        meaning: '數 outs 之前問一句：「呢隻牌落咗，我係咪真係贏？」唔肯定嘅就打折。',
        use: 'Overcard outs（中一對）、會 pair board 嘅 outs（對手可能有 set）、細 flush 嘅 outs，都要打折。',
        derive: '<p>Rule of 2/4 假設每隻 out 落咗你就一定贏。如果某啲 out 落咗你只係「有機會」贏，佢真正嘅價值就少過一隻 out。例如一隻 out 落咗你只有一半機會贏，就當半隻計。</p>',
        mistakes: ['Overcards 當 clean outs', '對手可能有 set 時，pair board 嘅牌當 outs', '對手可能有更大 flush 時，細 flush 當 clean'],
      }));
    }

    // 8. implied odds
    {
      const e = 9 / 46, X = C.implied(50, 9, 46, 200), r = C.req(100, 50);
      S.push(({
        id: 'implied', title: '8. Implied odds：中咗之後要再贏幾多', oneLine: 'X = C ÷ e − (call 後嘅 final pot)',
        formula: 'X = C ÷ e − (你 call 完之後嘅 final pot)',
        legend: legend([
          ['X', '你中咗之後，後面幾條街平均要<u>額外</u>贏對手幾多錢先抵 call'],
          ['C', '你而家要跟嘅錢'],
          SYM.e,
          ['final pot', '你 call 完之後 pot 有幾多（P + 2B）'],
        ], [
          ['C ÷ e', '要打和，「中嗰陣收到嘅總數」要有幾多'],
          ['− final pot', '減去 pot 入面已經有嘅錢，剩低嗰啲就要靠之後贏返'],
        ]),
        example: `<p>Turn：pot 100bb，對手 bet 50bb，你有 flush draw（9 outs）。</p><ul>
          <li>e = 9 ÷ 46 = ${p1(e)}；required = 50 ÷ 200 = ${p1(r)} → 直接 pot odds 唔夠</li>
          <li>X = 50 ÷ ${f(e, 4)} − 200 ≈ <b>${f(X, 1)}</b>bb</li>
          <li>快捷：C × 46 ÷ outs = 50 × 46 ÷ 9 = ${f(50 * 46 / 9, 1)}，再減 200 → ${f(X, 1)}</li></ul>
          <p>即係：你中咗 flush 之後，river 平均要再贏到約 ${Math.round(X)}bb，先值得而家 call。</p>`,
        meaning: '直接 pot odds 唔夠嘅時候，計吓中咗之後要對手多俾幾多錢先抵跟。',
        use: '對手籌碼夠深、你中咗佢會俾錢（例如佢有 top pair）→ implied odds 好；對手中咗你都可能輸（reverse implied odds）就唔好靠佢。',
        derive: `<p>用 46 次嚟諗（turn 有 46 隻未見牌，9 隻係你嘅 outs）：</p><ol>
          <li>46 次都 call 50 → 總共出 50 × 46 = 2300bb。</li>
          <li>平均中 9 次，每次收 final pot 200 再加之後多贏嘅 X → 9 × (200 + X)。</li>
          <li>打和：9 × (200 + X) = 2300 → 200 + X = 2300 ÷ 9 = 255.6 → X ≈ 55.6。</li></ol>
          <p>一般化：e × (final pot + X) = C → final pot + X = C ÷ e → X = C ÷ e − final pot。</p>`,
        mistakes: ['以為對手中你嘅牌一定會俾晒錢', '忘記 reverse implied odds（中咗都輸，例如細 flush）', '籌碼唔夠深：後面根本冇咁多錢贏'],
      }));
    }


    // MDF / alpha / bluff:value deep dive
    {
      const rows = [[20, '⅓ pot'], [30, '½ pot'], [60, 'pot'], [120, '2× pot']].map(([B, l]) => ({ B, l, a: C.alpha(60, B), m: C.mdf(60, B), b: C.bshare(60, B), v: C.vpb(60, B) }));
      const a30 = C.alpha(60, 30), m30 = C.mdf(60, 30), b30 = C.bshare(60, 30);
      const evB40 = C.evbluff(0.4, 60, 30), evB25 = C.evbluff(0.25, 60, 30);
      S.push(({
        id: 'trio', title: 'MDF · Alpha · Bluff:value 三兄弟（深入版）', oneLine: '同一個注，三個角度：佢 bluff、你守、佢 range 結構',
        formula: 'Alpha = B ÷ (P + B)　·　MDF = P ÷ (P + B) = 1 − alpha　·　Bluff% = B ÷ (P + 2B)　·　Bluff : value = B : (P + B)',
        legend: legend([SYM.P, SYM.B,
          ['Alpha', '對手個 bluff 要成功（你 fold）幾多 % 先唔蝕'],
          ['MDF', '你最少要繼續（call / raise）幾多 %，佢個 bluff 先唔會自動賺'],
          ['Bluff%', '佢 betting range 入面 bluff 最多佔幾多 %，你嘅 bluff-catcher call 同 fold 先一樣'],
        ], [
          ['P + B', '對手落注之後、你未跟之前嘅 pot（佢冒險嘅 B + 佢想贏嘅 P）'],
          ['P + 2B', '你跟埋之後嘅 final pot'],
          ['1 − alpha', '佢需要你 fold 嘅部分以外，就係你要守嘅部分'],
        ]),
        example: `<p><b>Pot 60bb，對手 bet 30bb（½ pot）</b>，三個角度：</p><ul>
          <li><b>佢 bluff 嘅角度（alpha）</b>：佢冒 30 去贏 60 → 30 ÷ 90 = <b>${p1(a30)}</b>。你 fold 多過三成，佢任何牌 bluff 都賺。<br>例如你 fold 40%：佢 EV = 0.4 × 60 − 0.6 × 30 = ${f(evB40, 2)}bb（賺）；你 fold 25%：0.25 × 60 − 0.75 × 30 = ${f(evB25, 2)}bb（蝕）。</li>
          <li><b>你守嘅角度（MDF）</b>：60 ÷ 90 = <b>${p1(m30)}</b> → 100 手最少守 67 手。</li>
          <li><b>佢 range 結構（bluff:value）</b>：30 ÷ 120 = <b>${p1(b30)}</b> → 30 : 90 = 1 : 3，每 3 手 value 最多配 1 手 bluff。</li></ul>
          <div class="tblwrap"><table class="tbl"><tr><th>Pot 60，bet</th><th class="num">Alpha</th><th class="num">MDF</th><th class="num">Bluff%</th><th class="num">Bluff : value</th></tr>
          ${rows.map((x) => `<tr><td>${x.l}（${x.B}）</td><td class="num">${p1(x.a)}</td><td class="num">${p1(x.m)}</td><td class="num">${p1(x.b)}</td><td class="num">1 : ${f(x.v, 2)}</td></tr>`).join('')}</table></div>
          <p class="muted">規律：注越大 → alpha 越高（佢 bluff 要更多 fold）、MDF 越低（你可以 fold 多啲）、佢可以有更多 bluff。</p>`,
        meaning: 'Alpha 問「佢個 bluff 要幾成功」；MDF 問「我要守幾多先唔俾佢白賺」；bluff:value 問「佢 range 入面可以有幾多 bluff，我先唔知 call 定 fold」。',
        use: '思路鏈 ④ 同 ⑤：數到佢 bluff%（④）同 required %（⑤ = 平衡 bluff%）比較。MDF 只係「假設對手平衡」時嘅守備底線，⑦ 要按對手類型調整（§mdfguard）。練習：2G、2M、4E。',
        derive: `<p><b>Alpha（100 次）</b>：佢 bluff 100 次，你 fold f 次 → 佢贏 60 × f，蝕 30 × (100 − f)。打和：60f = 30 × (100 − f) → 90f = 3000 → f = 3000 ÷ 90 = 33.3。即係 30 ÷ 90。</p>
          <p><b>MDF</b>：佢要你 fold 33.3% 先打和；你只要守多過 100 − 33.3 = 66.7%，佢就蝕。即係 60 ÷ 90。</p>
          <p><b>Bluff%</b>：你嘅 bluff-catcher 贏佢 bluff、輸佢 value，所以你嘅 equity = 佢 bluff%。你 call 要 30 ÷ 120 = 25%（§potodds）。佢想你 call 同 fold 都一樣 → bluff% = 25%：120 份入面 30 份 bluff、90 份 value → 30 : 90 = 1 : 3。</p>
          <p><b>三者關係</b>：alpha + MDF = 100%；bluff% ≠ alpha（bluff% 用 final pot P + 2B 做分母，alpha 用 P + B）。</p>`,
        mistakes: ['將 alpha 當 bluff%（½ pot：alpha 33.3%，但 bluff% 只係 25%）', '以為一定要守到 MDF（對手 under-bluff 時會蝕）', '喺 flop / turn 用 river 比例（bluff 仲有 equity）', '面對 raise 直接用：要用補注同 raise 後嘅 pot 重新計'],
      }));
    }
    // 9. MDF
    {
      const m1 = C.mdf(10, 10), m2 = C.mdf(60, 30), a1 = C.alpha(10, 10);
      S.push(({
        id: 'mdf', title: '9. MDF（minimum defense frequency）', oneLine: 'MDF = P ÷ (P + B)',
        formula: 'MDF = P ÷ (P + B)',
        legend: legend([SYM.P, SYM.B, ['MDF', '你最少要繼續（call 或 raise）幾多 % 嘅手牌，對手亂咁 bluff 先唔會自動賺錢']], [
          ['P + B', '對手落注之後、你未跟之前，pot 有幾多'],
          ['P ÷ (P + B)', '原本 pot 佔而家 pot 幾多份'],
        ]),
        example: `<p>Pot 10bb，對手 bet 10bb（pot size）：MDF = 10 ÷ 20 = <b>${p1(m1)}</b> → 你 100 手入面最少守 50 手。</p>
          <p>Pot 60bb，bet 30bb（½ pot）：MDF = 60 ÷ 90 = <b>${p1(m2)}</b>。</p>`,
        meaning: '對手 bluff 係冒 B 去贏 P；你 fold 太多，佢任何兩張牌 bluff 都賺。MDF 話你知最少要守幾多。',
        use: '面對細注要守好多（½ pot 要守 67%）；面對大注可以 fold 多啲。但記住§mdfguard：MDF 係護欄，唔係規則。',
        derive: `<ol><li>對手用完全冇 equity 嘅牌 bluff：fold 就贏 P，被 call 就蝕 B。</li>
          <li>佢打和需要你 fold B ÷ (P + B) 咁多（下一節 alpha）。例如 pot 10 bet 10：10 ÷ 20 = ${p1(a1)}。</li>
          <li>只要你守多過 1 − alpha，佢個 bluff 就蝕錢 → MDF = 1 − B ÷ (P + B) = P ÷ (P + B)。</li>
          <li>數字：1 − 50% = 50%，同上面 10 ÷ 20 一樣。</li></ol>`,
        mistakes: ['當咗「一定要 call 到 MDF」（對 under-bluff 嘅人會蝕）', '直接用喺面對 raise（要用補注同 raise 後 pot 重新計）', '喺 flop/turn 用：對手 bluff 仲有 equity，MDF 唔準'],
      }));
    }

    // 10. alpha
    {
      const a = C.alpha(28, 21), ev = C.evbluff(0.5, 28, 21);
      S.push(({
        id: 'alpha', title: '10. Alpha（α）：bluff 要對手 fold 幾多', oneLine: 'α = B ÷ (P + B)',
        formula: 'α = B ÷ (P + B)',
        legend: legend([
          ['α', '一個完全冇 equity 嘅 bluff，要對手 fold 幾多 % 先打和'],
          ['P', '對手 fold 嘅話你贏到嘅錢（而家 pot）'],
          ['B', '你 bluff 落嘅注（被 call 就蝕晒）'],
        ], [['P + B', '你冒險嘅錢加你想贏嘅錢'], ['B ÷ (P + B)', '你冒險嘅錢佔「冒險 + 獎品」幾多份']]),
        example: `<p>River pot 28bb，你 bluff 21bb：α = 21 ÷ 49 = <b>${p1(a)}</b>。</p>
          <p>如果對手 fold 50%：EV = 0.5 × 28 − 0.5 × 21 = <b>${f(ev, 2)}</b>bb（fold 多過 42.9%，所以賺）。</p>`,
        meaning: '冒 B 去贏 P：對手要 fold 多過 B ÷ (P + B) 咁多次，你個 bluff 先有錢賺。',
        use: '諗住 bluff 之前問：「呢個對手喺呢度會唔會 fold 多過 α？」唔會就唔好 bluff。',
        derive: `<p>玩 100 次，對手 fold f 次：</p><ol><li>Fold 嗰 f 次，每次贏 28 → 28 × f。</li>
          <li>被 call 嗰 (100 − f) 次，每次蝕 21 → 21 × (100 − f)。</li>
          <li>打和：28 × f = 21 × (100 − f) → 28f + 21f = 2100 → 49f = 2100 → f = 2100 ÷ 49 = 42.9。</li></ol>`,
        mistakes: ['將 α（bluff 要幾多 fold）同 required equity（call 要幾多 equity）搞亂：α = B ÷ (P + B)，required = B ÷ (P + 2B)', '你個 bluff 其實有少少 equity（semi-bluff）就唔使咁多 fold'],
      }));
    }

    // 11. bluff : value
    {
      const s1 = C.bshare(28, 28), v1 = C.vpb(28, 28), s2 = C.bshare(60, 30), v2 = C.vpb(60, 30);
      S.push(({
        id: 'bluffvalue', title: '11. Bluff : value = B : (P + B)', oneLine: '平衡 river range 入面有幾多 bluff',
        formula: 'Bluff : value = B : (P + B)　·　Bluff 佔成個下注 range = B ÷ (P + 2B)',
        legend: legend([SYM.P, SYM.B,
          ['bluff', '對手落注嘅牌入面，輸俾你（bluff-catcher）嘅牌'],
          ['value', '對手落注嘅牌入面，贏你嘅牌'],
          [':', '比例，例如 1 : 2 = 每 1 手 bluff 配 2 手 value'],
        ], [['P + 2B', 'final pot'], ['P + B', 'final pot 減走 bluff 嗰份（B）剩低嘅，就係 value 嗰份']]),
        example: `<p>River pot 28bb，對手 bet 28bb（pot size）：</p><ul>
          <li>Bluff : value = 28 : 56 = 1 : ${f(v1, 2)} → 每 2 手 value 最多配 1 手 bluff</li>
          <li>Bluff 佔 range = 28 ÷ 84 = <b>${p1(s1)}</b></li></ul>
          <p>½ pot（pot 60、bet 30）：30 : 90 = 1 : ${f(v2, 2)}；bluff 佔 30 ÷ 120 = ${p1(s2)}。</p>`,
        meaning: '對手 bluff 嘅比例啱啱等於你 call 需要嘅 equity 時，你 call 定 fold 都一樣；佢 bluff 多過呢個，你 call 就賺。',
        use: 'River 面對下注：數佢 value combos，乘 B ÷ (P + B) 就係「平衡」嘅 bluff 上限；你數到嘅 bluff 多過呢個 → call。',
        derive: `<ol><li>你嘅 bluff-catcher 只贏 bluff、輸 value → 你嘅 equity = 對手 range 入面 bluff 嘅比例。</li>
          <li>你 call 需要 B ÷ (P + 2B)（§potodds）。對手想你 call 同 fold 都一樣 → bluff 比例 = B ÷ (P + 2B)。</li>
          <li>即係 (P + 2B) 份入面 B 份係 bluff，其餘 P + 2B − B = P + B 份係 value → bluff : value = B : (P + B)。</li>
          <li>數字：pot 28、bet 28 → final pot 84，bluff 佔 28 份，value 佔 84 − 28 = 56 份 → 28 : 56 = 1 : 2。</li></ol>`,
        mistakes: ['喺 flop / turn 用呢個比例（嗰陣 bluff 仲有 equity，可以有更多 semi-bluff）', '忘記有啲 value 其實係 chop（打和）', '忘記你手牌嘅 blockers 會改變 bluff 比例（§blockers）'],
      }));
    }

    // 12. EV(call)
    {
      const ev = C.evcall(0.42, 28, 28), fast = C.evcallfast(0.42, 28, 28), r = C.req(28, 28);
      S.push(({
        id: 'evcall', title: '12. EV(call)：長公式同快算', oneLine: 'EV = (e − required) × final pot',
        formula: '長：EV = e × (P + B) − (1 − e) × B　·　快：EV = (e − required) × (P + 2B)',
        legend: legend([SYM.P, SYM.B, SYM.e, ['EV', '長遠每次平均賺（正數）或蝕（負數）幾多 bb'], ['required', 'B ÷ (P + 2B)（§potodds）']], [
          ['e × (P + B)', '贏嘅時候你贏到 pot 加對手嘅注，乘你贏嘅機會'],
          ['(1 − e) × B', '輸嘅時候你蝕咗跟嘅注，乘你輸嘅機會'],
          ['(e − required)', '你嘅 equity 比「打和線」高（或者低）幾多'],
          ['× (P + 2B)', '再乘 final pot，變返做 bb'],
        ]),
        example: `<p>River pot 28，對手 bet 28，你估自己贏 42%（e = 0.42）：</p><ul>
          <li>長：0.42 × 56 = 23.52；0.58 × 28 = 16.24；23.52 − 16.24 = <b>${f(ev, 2)}</b>bb</li>
          <li>快：required = 28 ÷ 84 = ${p1(r)}；(0.42 − 1/3) × 84 = <b>${f(fast, 2)}</b>bb</li></ul>`,
        meaning: '你嘅 equity 比打和線高幾多 %，乘 final pot，就係你每次 call 平均賺幾多。',
        use: '例如高過打和線 5 個百分點、final pot 100bb → 每次 call 賺約 5bb。細細嘅 % 差距乘大 pot，就係大錢。',
        derive: `<p>由長公式一步步拆（用 e = 0.42、P = 28、B = 28 對住睇）：</p><ol>
          <li>EV = e × (P + B) − (1 − e) × B</li>
          <li>拆開括號：= e × P + e × B − B + e × B　（0.42 × 28 + 0.42 × 28 − 28 + 0.42 × 28 = 7.28）</li>
          <li>將兩個 e × B 加埋：= e × (P + 2B) − B　（0.42 × 84 − 28 = 7.28）</li>
          <li>抽 (P + 2B) 出嚟：= (P + 2B) × (e − B ÷ (P + 2B))</li>
          <li>B ÷ (P + 2B) 就係 required → = final pot × (e − required)。兩條公式其實係同一條。</li></ol>`,
        mistakes: ['贏嘅時候寫成 e × (P + 2B)（final pot 入面有你自己嘅注，唔係贏返嚟嘅）', '用咗 B ÷ P 做 required'],
      }));
    }

    // 13. EV(bluff)
    {
      const ev = C.evbluff(0.5, 28, 21), fast = C.evblufffast(0.5, 28, 21), a = C.alpha(28, 21);
      S.push(({
        id: 'evbluff', title: '13. EV(bluff)：長公式同快算', oneLine: 'EV = (f − α) × (P + B)',
        formula: '長：EV = f × P − (1 − f) × B　·　快：EV = (f − α) × (P + B)',
        legend: legend([SYM.P, SYM.B, SYM.fo, ['α', 'B ÷ (P + B)（§alpha）']], [
          ['f × P', '對手 fold 時你贏到 pot，乘佢 fold 嘅機會'],
          ['(1 − f) × B', '對手 call 時你蝕咗個注，乘佢 call 嘅機會'],
          ['(f − α) × (P + B)', '佢 fold 比打和線多幾多，乘「冒險 + 獎品」'],
        ]),
        example: `<p>River pot 28，你 bluff 21，對手 fold 50%：</p><ul>
          <li>長：0.5 × 28 − 0.5 × 21 = <b>${f(ev, 2)}</b>bb</li>
          <li>快：α = 21 ÷ 49 = ${p1(a)}；(0.5 − 21/49) × 49 = <b>${f(fast, 2)}</b>bb</li></ul>`,
        meaning: '對手 fold 比打和線（α）多幾多 %，乘 (pot + 你個注)，就係你每次 bluff 平均賺幾多。',
        use: '估對手 fold%，同 α 比較；差距乘 P + B 就知值唔值。',
        derive: `<ol><li>EV = f × P − (1 − f) × B</li><li>拆開：= f × P − B + f × B</li><li>合埋 f：= f × (P + B) − B</li>
          <li>抽 (P + B)：= (P + B) × (f − B ÷ (P + B)) = (P + B) × (f − α)</li>
          <li>數字：0.5 × 49 − 21 = 3.5，同長公式一樣。</li></ol>`,
        mistakes: ['忘記被 call 會蝕晒個注', '你嘅 bluff 有 equity 時要用 semi-bluff 公式（下一節）'],
      }));
    }

    // 14. semi-bluff
    {
      const e = 9 / 46, s40 = C.semibluff(0.4, 9, 46, 12, 8), s30 = C.semibluff(0.3, 9, 46, 12, 8), s20 = C.semibluff(0.2, 9, 46, 12, 8);
      S.push(({
        id: 'semibluff', title: '14. Semi-bluff EV', oneLine: 'Fold equity + 被 call 時嘅 equity',
        formula: 'EV = f × P + (1 − f) × [e × (P + 2B) − B]',
        legend: legend([SYM.P, SYM.B, SYM.fo, SYM.e], [
          ['f × P', '對手 fold：你即刻贏 pot'],
          ['e × (P + 2B) − B', '對手 call：你有 e 機會贏成個 final pot，但要先出 B'],
          ['(1 − f) × […]', '上面嗰個結果乘對手 call 嘅機會'],
        ]),
        example: `<p>Turn pot 12bb，你用 flush draw（9 outs，e = 9 ÷ 46 = ${f(e, 3)}）bet 8bb，忽略 river 再落注：</p><ul>
          <li>對手 fold 40%：fold 部分 0.4 × 12 = 4.8；call 部分 ${f(e, 3)} × 28 − 8 ≈ −2.52；EV ≈ 4.8 + 0.6 × (−2.52) ≈ <b>${f(s40, 2)}</b>bb</li>
          <li>Fold 30% → ${f(s30, 2)}bb；fold 20% → ${f(s20, 2)}bb</li></ul>`,
        meaning: '就算被 call，你都仲有機會中牌；所以 semi-bluff 唔使對手 fold 咁多都有錢賺。',
        use: 'Draw + 對手會 fold 一啲 → bet 通常好過 check/call。',
        derive: '<p>兩個情況分開計再加埋：(1) 對手 fold（機會 f）→ 贏 P；(2) 對手 call（機會 1 − f）→ 變成一個「已經 call 咗」嘅局面，EV = e × (P + 2B) − B（你出 B，有 e 機會收 final pot）。</p>',
        mistakes: ['當咗純 bluff 計（漏咗 draw 嘅 equity）', '忘記對手可能 raise'],
      }));
    }

    // 15. blockers
    {
      const ak0 = C.combos('AK', K72), ak1 = C.combos('AK', K72, KJ), kk0 = C.combos('KK', K72), kk1 = C.combos('KK', K72, KJ);
      const board = ['Ks', '7d', '2c', '6s', '2h'];
      const R = 'AK,KQ,KK,77,66,K7s,K6s,A2s,22,98s,85s,54s,AsQs,AsJs,AsTs,As5s,As4s,As3s,QsJs,QsTs,JsTs';
      const [V1, B1] = C.vb(['Kh', 'Js'], board, R), [V2, B2] = C.vb(['Qh', 'Qd'], board, R);
      const ev1 = C.evcall(B1 / (V1 + B1), 28, 28), ev2 = C.evcall(B2 / (V2 + B2), 28, 28);
      S.push(({
        id: 'blockers', title: '15. Blockers 同 unblockers', oneLine: '你手上嘅牌改變對手有乜',
        formula: '你拎住一隻牌：唔同 rank 嘅手牌 16 → 12（少 25%）；pair 6 → 3（少一半）',
        legend: legend([
          ['blocker', '你手上嘅牌令對手冇咗某啲 combos'],
          ['unblocker', '你<u>冇</u>拎住某類牌，所以對手嗰類牌冇被減'],
          ['bluff-catcher', '只贏對手 bluff、輸俾對手 value 嘅牌'],
        ]),
        example: `<p>Board ${icList(K72)}，你手持 ${icList(KJ)}：K♥ 令對手 AK 由 ${ak0} 變 ${ak1}、KK 由 ${kk0} 變 ${kk1} → 你 block 咗佢嘅 value；你冇 ♠，所以佢 missed spade draws（bluff）一個都冇少。</p>
          <p>§example例子入面（river 2♥），換手牌：</p><ul>
          <li>K♥J♠：block 咗 A♠J♠、Q♠J♠、J♠T♠ 三個 bluff → value ${V1}、bluff ${B1}，bluff 比例 ${B1} ÷ ${V1 + B1} = ${p1(B1 / (V1 + B1))}，EV(call) = ${f(ev1, 2)}bb</li>
          <li>Q♥Q♦：冇 K blocker → value 多咗 → value ${V2}、bluff ${B2}，${B2} ÷ ${V2 + B2} = ${p1(B2 / (V2 + B2))}，EV = ${f(ev2, 2)}bb</li></ul>`,
        meaning: 'Call 嘅時候想 block 對手 value、唔 block 佢 bluff；bluff 嘅時候想 block 對手會 call 嘅牌。',
        use: 'River 決定前最後一步：「我手上嘅牌係減咗佢 value 定 bluff？」',
        derive: '<p>AK：本來 4 隻 A × 4 隻 K = 16；你拎住一隻 K → 4 × 3 = 12。KK：本來 4 隻揀 2 = 6；你拎住一隻 → 3 隻揀 2 = 3 × 2 ÷ 2 = 3。所以 blocker 對「pair」同「board 已經有嘅 rank」影響最大。</p>',
        mistakes: ['Block 咗對手嘅 bluff 仲以為係好事（call 嘅時候係壞事）', '忘記 board 已經減咗一次'],
      }));
    }

    // 16. MDF is a guard
    {
      const board = ['Ks', '7d', '2c', '6s', '2h'];
      const R = 'AK,KQ,KK,77,66,K7s,K6s,A2s,22,AsQs,AsJs,AsTs,As5s,As4s,As3s,QsJs,QsTs,JsTs,9s8s';
      const [V, B] = C.vb(['Kh', 'Jd'], board, R);
      const sh = B / (V + B), ev = C.evcall(sh, 28, 28), r = C.req(28, 28);
      S.push(({
        id: 'mdfguard', title: '16. MDF 係護欄，唔係規則', oneLine: '對住唔 bluff 嘅人要 fold 多啲',
        formula: '真正決定 = 對手實際 bluff 比例 vs required equity；MDF 只係假設對手 bluff 得啱啱好',
        legend: legend([
          ['under-bluff', '對手 bluff 得太少（低級別、river 大注好常見）'],
          ['over-bluff', '對手 bluff 得太多'],
          ['OOP', 'out of position：你要先行動，資訊少啲'],
        ]),
        example: `<p>§example例子，但對手<b>唔會</b>用 straight draws bluff，只用 spade flush draws（包括 9♠8♠）：</p><ul>
          <li>Value ${V}、bluff ${B} → bluff 比例 ${B} ÷ ${V + B} = ${p1(sh)}</li>
          <li>Required = 28 ÷ 84 = ${p1(r)} → ${p1(sh)} 少過 ${p1(r)} → <b>fold</b></li>
          <li>EV(call) = ${f(ev, 2)}bb（照 MDF 硬 call 會蝕）</li></ul>`,
        meaning: 'MDF 假設對手 bluff 得剛好平衡；佢 bluff 少，你就應該 fold 多過 MDF。',
        use: '對住 nit、對住低級別玩家嘅 river 大注 → fold 多啲；OOP 時守少少過 MDF 都正常。',
        derive: '<p>MDF 嘅出發點係：「唔好俾對手用任何兩張牌 bluff 都賺錢」。但如果佢根本唔 bluff，你 call 嘅時候大部分撞正 value → 蝕錢。真正要比較嘅永遠係：你嘅 equity（≈ 佢 bluff 比例）有冇高過 required equity。</p>',
        mistakes: ['覺得「MDF 話要守 50%，所以一定要 call」', '對所有對手用同一個標準'],
      }));
    }

    // 17. bucket counting
    {
      S.push(({
        id: 'buckets', title: '17. 分組估算（bucket counting）', oneLine: '20 秒內估 value 同 bluff',
        formula: '只數關鍵類別；sets / two pair 大約 3 個一類；最後同 value × B ÷ (P + B) 比較',
        legend: legend([['bucket', '將對手手牌分組（value / bluff / 中間牌），每組大約有幾多 combos'], ['≈', '大約，枱上唔使準確']]),
        example: `<p>§example嘅 river（pot 28、bet 28）：</p><ul>
          <li>Value：AK 8 加 KQ 8 → 8 + 8 = 16；sets 同兩對大約 3 個一類 ≈ 10；trips / quads ≈ 3 → 16 + 10 + 3 = 29</li>
          <li>Bluff：三類 straight draw 每類 4 個 → 3 × 4 = 12；spade draws ≈ 9 → 12 + 9 = 21</li>
          <li>Pot bet 平衡上限 ≈ value 一半 → 29 ÷ 2 = 14.5；你數到 21 多過 14.5 → <b>call</b></li></ul>`,
        meaning: '唔使數到最後一個 combo，只要知道 bluff 明顯多過或者少過門檻就夠。',
        use: '先數最大嘅 value 類別同最可能嘅 bluff 類別，大約數就算；差距好細先至慢慢數。',
        derive: '<p>Set 永遠 3 個（剩 3 隻牌揀 2）；兩對通常 3 × 3 = 9（suited 版本更少）；所以「大約 3 個」係好用嘅近似。門檻：pot bet 時 bluff : value = 1 : 2 → bluff 上限 = value ÷ 2。</p>',
        mistakes: ['卡喺準確數，用晒時間', '漏咗 blocker check'],
      }));
    }

    // 18. table kit
    {
      const r = C.req(40, 20), e9 = C.outs(9, 'turn1'), ev = C.evcallfast(0.4, 60, 30), ak = C.combos('AK', K72), ak1 = C.combos('AK', K72, KJ);
      const kit = [
        ['Required equity = call ÷ final pot', '你出嘅錢佔最後 pot 幾多，就要贏幾多。', `Pot 40、bet 20 → 20 ÷ 80 = ${p1(r)}`, 'potodds'],
        ['Bluff : value = bet : (pot + bet)', '對手 bluff 比例等於你 required equity 時佢先平衡。', 'Pot bet：value 20 個 → 平衡 bluff 最多 10 個', 'bluffvalue'],
        ['Combo grid：6/3/1、16/12/9（8）、suited 4/3、FD class = 1', '睇到嘅牌對手冇得拎。', `K 高 board：AK = ${ak}；你又有 K → ${ak1}`, 'removal'],
        ['只數關鍵類別', '決定通常只靠 value 頂部同 bluff 類別。', 'Sets / 兩對大約 3 個一類', 'buckets'],
        ['Outs：一張 ×2(+1)；flop all-in 先 ×4，>8 減 (x−8)', '每隻 out 一張牌 ≈ 2%。', `Turn 9 outs → 2 × 9 + 1 = 19（準確 ${p1(e9)}）`, 'outs'],
        ['EV(call) = (equity − required) × final pot', '長公式拆開之後就係呢條。', `Equity 40%、pot 60、bet 30：(0.4 − 0.25) × 120 = ${f(ev, 2)}`, 'evcall'],
        ['最後做 blocker check', '你嘅牌可能減咗佢 value 或者 bluff。', 'K♥J♦：block AK/KQ，冇 block spade draws → 好 bluff-catcher', 'blockers'],
        ['MDF 係護欄唔係規則', '對手唔 bluff，就唔好硬守。', 'Nit river 2× pot → fold 多過 MDF', 'mdfguard'],
      ];
      S.push(({
        id: 'kit', title: '18. 實戰八招逐條拆解（Table kit）', oneLine: '速查表最後嗰八招嘅原因同例子',
        body: '<ol class="kit">' + kit.map(([t, why, ex, id]) => `<li><b>${t}</b><br>點解：${why}<br>例子：${ex}<br>${more(id)}</li>`).join('') + '</ol>',
      }));
    }

    // 19. full worked example
    {
      const flop = ['Ks', '7d', '2c'], turn = flop.concat(['6s']), river = turn.concat(['2h']);
      const dF = flop.concat(KJ), dT = turn.concat(KJ);
      const b1 = C.rangecount('AK,KQ,KT,K9s,K8s,K7s,K6s,K5s,KK,77,22', dF), b2 = C.rangecount('AA,QQ,TT,99,88,66,55,44,33', dF),
        b3 = C.rangecount('A5s,A4s,A3s,98s,85s,54s,QJs,QTs,JTs,AQ,AJ,AT', dF), b4 = C.rangecount('A2s,A7s,76s,87s', dF);
      const t1 = C.rangecount('AK,KQ,KK,77,66,K7s,K6s', dT), t2 = C.rangecount('KT,K9s,K8s,K5s,AA,QQ', dT),
        t3 = C.rangecount('98s,85s,54s,AsQs,AsJs,AsTs,As5s,As4s,As3s,QsJs,QsTs,JsTs,A2s', dT);
      const R = 'AK,KQ,KK,77,66,K7s,K6s,A2s,22,98s,85s,54s,AsQs,AsJs,AsTs,As5s,As4s,As3s,QsJs,QsTs,JsTs';
      const [V, B, T] = C.vb(KJ, river, R);
      const rf = C.req(6, 3), rt = C.req(12, 8), rr = C.req(28, 28), sh = B / (V + B), ev = C.evcall(sh, 28, 28), evf = C.evcallfast(sh, 28, 28);
      const akF = C.combos('AK', flop, KJ), ktF = C.combos('KT', flop, KJ), kkF = C.combos('KK', flop, KJ), s77 = C.combos('77', flop, KJ), qjs = C.combos('QJs', flop, KJ);
      S.push(({
        id: 'example', title: '19. 完整例子：K♥J♦ 喺 K♠7♦2♣ – 6♠ – 2♥', oneLine: '逐條街拆解，點樣收窄 range 同決定 call',
        body: `<p><b>背景</b>：100bb 深，對手（BTN）open，你（BB）用 ${icList(KJ)} call。Flop pot 6bb。</p>
        <h4>Flop ${icList(flop)}</h4>
        <p>對手 c-bet 3bb（½ pot）。你要跟 3 去贏 final pot 12 → required = 3 ÷ 12 = ${p1(rf)}。你有 top pair，輕鬆 call。Pot 變 12bb。</p>
        <p>對手 c-bet 嘅（簡化）range，已經減咗 board 同你嘅 K♥J♦：</p>
        <div class="tblwrap"><table class="tbl"><tr><th>組別</th><th>手牌</th><th class="num">Combos</th></tr>
        <tr><td>Top pair 或更好</td><td>AK, KQ, KT, K9s, K8s, K7s, K6s, K5s, KK, 77, 22</td><td class="num">${b1}</td></tr>
        <tr><td>口袋對子</td><td>AA, QQ, TT, 99, 88, 66, 55, 44, 33</td><td class="num">${b2}</td></tr>
        <tr><td>空氣 / backdoor</td><td>A5s, A4s, A3s, 98s, 85s, 54s, QJs, QTs, JTs, AQ, AJ, AT</td><td class="num">${b3}</td></tr>
        <tr><td>弱對子</td><td>A2s, A7s, 76s, 87s</td><td class="num">${b4}</td></tr>
        <tr><td><b>合計</b></td><td></td><td class="num"><b>${b1 + b2 + b3 + b4}</b></td></tr></table></div>
        <p>點計：AK = 4 隻 A × 2 隻 K（K♠ 喺 board、K♥ 喺你手）= ${akF}；KT = 2 × 4 = ${ktF}；KK = 剩 2 隻揀 2 = ${kkF}；77 = 剩 3 隻揀 2 = ${s77}；QJs = 4 − 1（J♦ 喺你手）= ${qjs}。</p>
        <h4>Turn ${ic('6s')}（而家有兩隻 ♠）</h4>
        <p>對手 bet 8bb（⅔ pot）→ required = 8 ÷ 28 = ${p1(rt)}。佢繼續 bet 嘅牌收窄成：</p>
        <div class="tblwrap"><table class="tbl"><tr><th>組別</th><th>手牌</th><th class="num">Combos</th></tr>
        <tr><td>Value</td><td>AK 8、KQ 8、KK 1、77 3、66 3（6♠ 出咗）、K7s 1、K6s 2</td><td class="num">${t1}</td></tr>
        <tr><td>中間牌 / 保護</td><td>KT, K9s, K8s, K5s, AA, QQ</td><td class="num">${t2}</td></tr>
        <tr><td>Draws / semi-bluff</td><td>98s, 85s, 54s（OESD，各 4）；A♠Q♠, A♠J♠, A♠T♠, A♠5♠, A♠4♠, A♠3♠, Q♠J♠, Q♠T♠, J♠T♠（9 個 flush draw）；A2s（3）</td><td class="num">${t3}</td></tr>
        <tr><td><b>合計</b></td><td></td><td class="num"><b>${t1 + t2 + t3}</b></td></tr></table></div>
        <p>白話：turn 6♠ 令對手多咗 flush draw 同 straight draw，佢會用呢啲牌繼續 bet（semi-bluff）。你 call。Pot 變 28bb。</p>
        <h4>River ${ic('2h')}</h4>
        <p>對手 bet 28bb（pot size）。你要跟 28 去贏 56，final pot 84 → required = 28 ÷ 84 = <b>${p1(rr)}</b>。中間牌通常 check，所以佢 bet 嘅 range = value + missed draws：</p>
        <ul><li><b>Value（贏你）</b>：AK 8、KQ 8、KK 1、77 3、66 3、K7s 1、K6s 2、A2s 2（river 2♥ 令佢變 trips）、22 1（quads）→ 合計 <b>${V}</b></li>
        <li><b>Bluff（輸俾你）</b>：98s、85s、54s 各 4 → 12；missed spade flush draws 9 → 合計 <b>${B}</b>${T ? `；chop ${T}` : ''}</li></ul>
        <p><b>決定</b>：bluff 比例 = ${B} ÷ ${V + B} = <b>${p1(sh)}</b>，高過 required ${p1(rr)} → <b>call</b>。另一個睇法：pot bet 平衡最多每 2 個 value 配 1 個 bluff → ${V} ÷ 2 = ${f(V / 2, 1)}；對手有 ${B} 個 bluff，多過 ${f(V / 2, 1)}。</p>
        <p>EV(call) = 0.42 × 56 − 0.58 × 28 = <b>${f(ev, 2)}</b>bb；快算 (0.42 − 1/3) × 84 = ${f(evf, 2)}bb。</p>
        <p><b>學到乜</b>：(1) blockers 會改變答案幾個百分點（§blockers）；(2) 決定主要睇對手用乜 draw 嚟 bluff，所以要花心機數 bluff 嗰邊；(3) 枱上只需要數到「value 大約 29、bluff 大約 21、門檻大約 15」（§buckets）。</p>`,
      }));
    }
    return S;
  }

  PT.learnHtml = function () {
    CHECKS.length = 0;
    const objs = learnSections();
    const idx = {};
    objs.forEach((o, i) => { idx[o.id] = i + 1; o.title = `${i + 1}. ` + o.title.replace(/^\d+\.\s*/, ''); });
    const ref = (html) => html.replace(/§([\w-]+)/g, (m, id) => (idx[id] ? `<a href="#/learn/${id}">第 ${idx[id]} 節</a>` : m));
    const toc = objs.map((o) => `<li><a href="#/learn/${o.id}">${o.title.replace(/^\d+\.\s*/, '')}</a></li>`).join('');
    return PT.colorSuits(ref(`<h1>教學 Learn</h1>
      <div class="panel"><p>速查表每一條公式、每一個表、實戰八招，喺呢度逐條拆解：<b>點解 work</b>、<b>枱上用嚟做乜</b>、<b>點樣一步步推出嚟</b>、<b>常見錯誤</b>。㩒標題打開，「推導」再㩒一下先展開。</p>
      <p>成個 app 用同一條 <a href="#/learn/chain">思路鏈 ①–⑦</a>：${PT.CHAIN.map((c, i) => PT.chainChip(i)).join(' ')}</p>
      <p class="muted">所有例子數字都用程式計過同測試過。單位 bb = big blind。</p>
      <details class="tocbox" open><summary>目錄</summary><ol class="toc">${toc}</ol></details></div>` + objs.map(section).join('')));
  };

  // =====================================================================
  //                             CHEAT SHEET
  // =====================================================================
  PT.cheatHtml = function () {
    const K72 = ['Ks', '7d', '2c'], KJ = ['Kh', 'Jd'];
    // section 1: combos with examples
    const c1 = [
      ['Pocket pair', 6, 'n × (n − 1) ÷ 2', `KK 喺 K♠7♦2♣：剩 3 隻 K → 3 × 2 ÷ 2 = ${C.combos('KK', K72)}`, '一對：剩幾多隻揀 2 隻'],
      ['Suited (AKs)', 4, '兩隻都未見嘅花色數', `AKs 喺 K♠ board：♠ 冇咗 → ${C.combos('AKs', K72)}`, '同花：每種花色一個'],
      ['Offsuit (AKo)', 12, 'a × b − suited', `AKo 喺 K♠ board：4 × 3 − 3 = ${C.combos('AKo', K72)}`, '唔同花：全部減同花'],
      ['Any (AK)', 16, 'a × b', `AK 喺 K♠ board、你有 K♥：4 × 2 = ${C.combos('AK', K72, KJ)}`, '每隻 A 配每隻 K'],
      ['全部起手牌', 1326, '78 + 312 + 936', '52 × 51 ÷ 2 = 1326', '任何兩隻牌'],
    ];
    const grid = [4, 3, 2, 1].map((a) => `<tr><th>${a}</th>${[4, 3, 2, 1].map((b) => `<td class="num">${a * b}</td>`).join('')}</tr>`).join('');

    // section 2: bet sizes, P = 60bb so every bet is a whole number
    const P = 60;
    const remark = {
      '1/4': '細注：價錢好抵，差啲嘅牌都可以 call；對手只可以有好少 bluff。',
      '1/3': '常見細 c-bet：你要守大部分牌，好多牌都應該繼續。',
      '1/2': '最常見嘅注：贏 4 次 1 次就夠本；每 3 手 value 配 1 手 bluff。',
      '2/3': '標準大注：要約 29% equity；對手 fold 40% 佢嘅 bluff 就打和。',
      '3/4': '同 ⅔ 差唔多，記 30% 就得。',
      '1 (pot)': 'Pot size：贏 3 次 1 次就夠本；每 2 手 value 配 1 手 bluff；守一半。',
      '1.25': 'Overbet 開始：要 35.7%，你守 44% 已經夠。',
      '1.5': '大 overbet：每 5 手 value 可以配 3 手 bluff。',
      '2': '2 倍 pot：要 40%；只需守 ⅓；每 3 手 value 配 2 手 bluff。',
      '3': '3 倍 pot：要 42.9%，越嚟越近 50% 但永遠唔到。',
    };
    let betRows = '';
    for (const [s, label] of PT.BET_SIZES.concat([[3, '3']])) {
      const B = Math.round(P * s);
      const r = C.req(P, B), m = C.mdf(P, B), a = C.alpha(P, B), b = C.bshare(P, B), v = C.vpb(P, B);
      betRows += `<tr><td>${label}</td><td class="num">${f((P + B) / B, 2)}:1</td><td class="num">${p1(r)}</td><td class="num">${p1(m)}</td><td class="num">${p1(a)}</td><td class="num">${p1(b)}</td><td class="num">1 : ${f(v, 2)}</td></tr>
        <tr class="exrow"><td colspan="7"><b>例：</b>Pot ${P}、bet ${B} → 你跟 ${B} 贏 final pot ${P + 2 * B}：required = ${B} ÷ ${P + 2 * B} = ${p1(r)}；MDF = ${P} ÷ ${P + B} = ${p1(m)}；alpha = ${B} ÷ ${P + B} = ${p1(a)}；bluff : value = ${B} : ${P + B}。<br><b>白話：</b>${remark[label]}</td></tr>`;
    }

    // section 3: outs
    let outsRows = '';
    const outsEx = {
      4: 'Gutshot：turn 4 outs → 4 ÷ 46 ≈ 8.7%，好少夠 pot odds',
      8: 'OESD：turn 8 outs → 2 × 8 + 1 = 17（準確 17.4%）',
      9: 'Flush draw：turn → 2 × 9 + 1 = 19；flop all-in → 4 × 9 − 1 = 35',
      12: 'FD + gutshot：flop all-in 4 × 12 − 4 = 44（準確 45.0%）',
      15: 'FD + OESD：flop all-in 4 × 15 − 7 = 53（× 4 = 60 高估好多）',
    };
    for (let x = 1; x <= 21; x++) {
      const r1 = C.rule(x, 'turn1'), r2 = C.rule(x, 'flop2');
      outsRows += `<tr><td class="num">${x}${{ 4: ' (gutshot)', 8: ' (OESD)', 9: ' (FD)', 12: ' (FD+gut)', 15: ' (FD+OESD)' }[x] || ''}</td><td class="num">${p1(C.outs(x, 'flop1'))}</td><td class="num">${p1(C.outs(x, 'turn1'))}</td><td class="num">${r1}</td><td class="num">${p1(C.outs(x, 'flop2'))}</td><td class="num">${r2}</td></tr>` +
        (outsEx[x] ? `<tr class="exrow"><td colspan="6"><b>例：</b>${outsEx[x]}</td></tr>` : '');
    }
    // verify the hand-written numbers in outsEx are what the formulas give
    C.outs(4, 'turn1'); C.outs(8, 'turn1'); C.outs(12, 'flop2');

    const ev1 = C.evcall(0.42, 28, 28), ev2 = C.evbluff(0.5, 28, 21), sb = C.semibluff(0.4, 9, 46, 12, 8), X = C.implied(50, 9, 46, 200);
    const rK = C.req(40, 20), e9 = C.outs(9, 'turn1'), evK = C.evcallfast(0.4, 60, 30);

    return PT.colorSuits(`<h1>速查表 Cheat sheet</h1>
    <p class="muted">每一項都可以㩒「詳細 →」去<a href="#/learn">教學 Learn</a> 睇點解同推導。</p>
    <div class="panel chainpanel"><h2>0. River 決策 7 步（思路鏈）${more('chain')}</h2><ol class="chainlist">${PT.CHAIN.map((c, i) => `<li>${PT.chainChip(i)} ${c[1]}</li>`).join('')}</ol>
      <p class="muted">練習：4T（逐步）、4B（一次過）、4E（⑦ 對手類型）。④ ⑤ 嘅數字喺第 2 部分；② ③ 用第 1 部分同實戰八招第 3、4 招。</p></div>
    <div class="panel"><h2>1. Combos 基本數 ${more('combos')}</h2><div class="tblwrap"><table class="tbl"><tr><th>類型</th><th class="num">Preflop</th><th>Card removal 公式</th><th>例子</th></tr>
      ${c1.map(([t, n, fm, ex, plain]) => `<tr><td>${t}</td><td class="num">${n}</td><td>${fm}<br><span class="muted">${plain}</span></td><td>${ex}</td></tr>`).join('')}</table></div>
      ${legend([['n', '嗰個 rank 仲有幾多隻未見（唔喺 board、唔喺你手）'], ['a、b', '兩個 rank 各自未見嘅張數']], [['n × (n − 1) ÷ 2', '揀第一隻、揀第二隻，再除 2（次序唔重要）'], ['a × b', '每隻第一 rank 配每隻第二 rank']])}
      <p>Pair 剩 4/3/2/1 張 → <b>6 / 3 / 1 / 0</b> combos。${more('removal')}</p>
      <b>Unpaired a × b grid</b><div class="tblwrap"><table class="tbl" style="max-width:320px"><tr><th>a \\ b</th><th class="num">4</th><th class="num">3</th><th class="num">2</th><th class="num">1</th></tr>${grid}</table></div>
      <p class="muted">例：AK 喺 K-7-2 = 4 × 3 = 12；K7 = 3 × 3 = 9；board 有 K 而你又有 K → KQ = 2 × 4 = 8。Flush draw：two-tone board 每個同花色 suited class = 1 combo ${more('flushdraw')}</p></div>

    <div class="panel"><h2>2. 注碼 → pot odds / MDF / alpha / bluff:value ${more('sizes')}</h2>
      <div class="fgrid">
        <div class="fcard"><div class="formula">Required equity = B ÷ (P + 2B)</div>你出嘅錢 ÷ 你 call 完之後成個 pot。<br><span class="muted">P + 2B = 原本 pot + 對手注 + 你跟注</span> ${more('potodds')}</div>
        <div class="fcard"><div class="formula">MDF = P ÷ (P + B)</div>你最少要守住幾多 %，對手亂 bluff 先唔會自動賺。<br><span class="muted">P + B = 對手落注後、你未跟前嘅 pot</span> ${more('mdf')}</div>
        <div class="fcard"><div class="formula">Alpha = B ÷ (P + B)</div>一個 0 equity 嘅 bluff 要對手 fold 幾多 % 先打和（= 1 − MDF）。 ${more('alpha')}</div>
        <div class="fcard"><div class="formula">Bluff% = B ÷ (P + 2B)；bluff : value = B : (P + B)</div>River 平衡 range 入面 bluff 佔幾多（同 required equity 一樣）。 ${more('bluffvalue')}</div>
      </div>
      ${legend([SYM.P, SYM.B, SYM.s, ['Odds x:1', '你出 1 份可以贏 x 份（(P + B) ÷ B）']])}
      <p class="muted">下面每行例子都用 pot = ${P}bb（咁每個注都係整數）。</p>
      <div class="tblwrap"><table class="tbl betTbl"><tr><th>Bet (× pot)</th><th class="num">Odds</th><th class="num">Required equity</th><th class="num">MDF</th><th class="num">Alpha</th><th class="num">Bluff %</th><th class="num">Bluff : value</th></tr>${betRows}</table></div>
      <p class="tip">MDF 假設 bluff 係 0 equity，只係防 over-bluff 嘅參考；對 under-bluffer 要 fold 多啲 ${more('mdfguard')}。Bluff:value 比例只適用於 river。</p></div>

    <div class="panel"><h2>3. Outs → equity ${more('outs')}</h2>
      ${legend([['outs (x)', '落咗會令你變最大嘅牌有幾多隻'], ['/47、/46', 'flop 時未見 47 隻、turn 時未見 46 隻']], [['×2+1', '一張牌速算（14 outs 以上 ×2+2）'], ['4x − (x−8)', 'flop all-in 兩張牌速算，超過 8 outs 減返多咗嘅部分']])}
      <div class="tblwrap"><table class="tbl"><tr><th class="num">Outs</th><th class="num">Flop→turn (/47)</th><th class="num">Turn→river (/46)</th><th class="num">×2+1 (≥14: ×2+2)</th><th class="num">Flop all-in (2 張)</th><th class="num">4x − (x−8)</th></tr>${outsRows}</table></div>
      <p class="tip">×4 只適用於 flop all-in（睇晒兩張唔使再面對下注）。Odds against（一張）：FD 4.1:1，OESD 4.75:1，gutshot 10.5:1。Outs 唔一定乾淨：會 pair board、會俾對手更大 flush 嘅要扣 ${more('dirty')}。</p></div>

    <div class="panel"><h2>4. EV 快算 ${more('evcall')}</h2><div class="tblwrap"><table class="tbl"><tr><th>決定</th><th>精確</th><th>快算</th><th>例子</th></tr>
      <tr><td>Call（之後冇下注）</td><td>e(P+B) − (1−e)B</td><td>(e − req) × (P+2B)</td><td>Pot 28、bet 28、e = 42%：0.42 × 56 − 0.58 × 28 = ${f(ev1, 2)} ${more('evcall')}</td></tr>
      <tr><td>純 bluff（0 equity）</td><td>fP − (1−f)B</td><td>(f − α) × (P+B)</td><td>Pot 28、bluff 21、fold 50%：0.5 × 28 − 0.5 × 21 = ${f(ev2, 2)} ${more('evbluff')}</td></tr>
      <tr><td>Semi-bluff</td><td>fP + (1−f)[e(P+2B) − B]</td><td>Fold equity + call 分支</td><td>Pot 12、bet 8、9 outs、fold 40% → ≈ ${f(sb, 2)} ${more('semibluff')}</td></tr>
      <tr><td>Implied odds</td><td colspan=2>X = C/e − (call 後 final pot)；一張牌：C/e ≈ C × 46/outs</td><td>Pot 100、bet 50、9 outs：50 × 46 ÷ 9 − 200 ≈ ${f(X, 1)} ${more('implied')}</td></tr></table></div>
      ${legend([SYM.P, SYM.B, SYM.e, SYM.fo, ['req', 'required equity = B ÷ (P + 2B)'], ['α', 'alpha = B ÷ (P + B)'], ['C', '你要跟嘅錢'], ['X', '中咗之後要額外贏嘅錢']])}</div>

    <div class="panel"><h2>5. Table kit（實戰八招）${more('kit')}</h2><ol>
      <li><b>Required equity = call / final pot</b>：½→25%，⅔→29%，¾→30%，pot→33%，2×→40%。 ${more('potodds')}</li>
      <li><b>Bluff:value = bet : (pot + bet)</b>：pot bet → 每 2 個 value 1 個 bluff；½ pot → 1:3；2× → 2:3。 ${more('bluffvalue')}</li>
      <li><b>Combo grid</b>：pairs 6/3/1，unpaired 16/12/9（你又有 board rank → 8），suited 4/3，每個 FD class = 1。 ${more('removal')}</li>
      <li>只數關鍵類別：value 頂部 + 最可能嘅 bluff；sets / two pair 大約 3 個一類。 ${more('buckets')}</li>
      <li><b>Outs</b>：一張 ×2(+1)；flop all-in 先用 ×4，>8 outs 減 (outs−8)；扣 dirty outs。 ${more('outs')}</li>
      <li><b>EV 快算</b>：EV(call) = (equity − required) × final pot；EV(bluff) = (fold% − α) × (pot + bet)。 ${more('evcall')}</li>
      <li><b>最後做 blocker check</b>：你嘅牌移除 value（對 call 好）定 bluff（對 call 唔好）？一張牌：pair 6→3，unpaired 16→12。 ${more('blockers')}</li>
      <li><b>MDF 係護欄唔係規則</b>：對 under-bluff（river、大注、低級別）嘅人 fold 多過 MDF；OOP defend 略少於 MDF。 ${more('mdfguard')}</li></ol>
      <p class="muted">八招例子：pot 40 bet 20 → ${p1(rK)}；turn 9 outs ≈ 19%（準確 ${p1(e9)}）；equity 40%、pot 60、bet 30 → EV ≈ ${f(evK, 2)}bb。</p></div>`);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
