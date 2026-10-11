# NLHE 數學訓練 · Poker Math Trainer (v1)

離線、免安裝嘅 No-Limit Hold'em combinatorics / pot odds / MDF / value-vs-bluff 練習 app。
Offline, no-install trainer. Pure HTML/CSS/JS, no CDN, no build step, no third-party libraries (own evaluator & range parser, cross-checked against eval7 + phevaluator).

## 點用 How to use
- **Windows**：解壓到 `D:\poker-trainer\`，雙擊 `index.html`（Chrome / Edge / Firefox 都得）。
- **手機**：最方便係放上 GitHub Pages（repo → Settings → Pages → Deploy from branch, root）。所有路徑都係相對路徑，直接用得。
- 紀錄存喺瀏覽器 localStorage（每部機 / 每個瀏覽器分開）；Stats 頁可以 export JSON。

快捷鍵：`Enter` 提交 / 下一題 · `C` call · `F` fold · `Esc` 返主頁 · 直接打數字會自動 focus 輸入格。

## Drills (v1)
| Level | Drill | Target |
|---|---|---|
| 1 | 1A preflop combos · 1B board removal · 1C hero blockers · 1D runout tracker (flop→turn→river) · 1E flush-draw count | 3–10 s |
| 2 | 2A size→required equity · 2B raw pot/bet · 2C outs→equity (×2+1 / 4x−(x−8)) · 2G MDF / alpha / bluff% | 2–6 s |
| 4 | 4B river value vs bluff → call/fold (range string + 13×13 grid, exact per-combo breakdown, EV) · 4C EV(call) | 60 s / 10 s |

升級：該 level 最近 50 題 accuracy ≥ 90% 同 median(用時 / target) ≤ 1。答錯嘅題會喺之後第 1、3、7 個 session 再出（spaced repetition，session = 隔 30 分鐘以上重新打開）。

## Tests
`node tests/run_tests.js 300` — generates 300 spots per drill and re-checks every answer in Python (`tests/verify.py`, needs `pip install eval7 phevaluator`; set `PYTHON=` to that interpreter).
