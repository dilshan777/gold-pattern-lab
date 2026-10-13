# Gold Pattern Lab

Live XAU/USD pattern analysis (TradingView Lightweight Charts) with paper
order placement on an OANDA **practice** account. Next.js 15 App Router,
TypeScript, Tailwind v4. **No auto-trading. Not financial advice.**

## Quick start

```bash
npm install
cp .env.example .env.local   # mock mode works out of the box
npm test                     # pattern unit tests (vitest)
npm run dev                  # http://localhost:3000
```

Open http://localhost:3000 — with `MOCK_DATA=true` you get seeded simulated
candles, a live tick stream, and an in-memory paper broker (balance $100k,
SL/TP simulated on each poll). The Backtest page needs no keys either.

## Switching to real OANDA practice data

1. Create a **practice** account at https://www.oanda.com/demo-account/
2. In the practice platform: **Manage API Access → Generate personal access
   token** → that is `OANDA_API_KEY`.
3. Your **Account ID** is the `101-004-...` number in the practice platform
   header (or via `GET /v3/accounts` with the token).
4. Fill `.env.local`:

```bash
MOCK_DATA=false
OANDA_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxx
OANDA_ACCOUNT_ID=101-004-1234567-001
OANDA_BASE_URL=https://api-fxpractice.oanda.com
OANDA_STREAM_URL=https://stream-fxpractice.oanda.com
```

Keys are only read in server-side API routes (`src/lib/oanda.ts`), never in
the browser.

## Risk rules (enforced server-side in /api/order)

- SL and TP are **required** on every order (OANDA `stopLossOnFill` /
  `takeProfitOnFill` with price distance).
- Risk = stopDistance × |units| (USD for XAU/USD, 1 unit = 1 oz) must be
  ≤ 2% of balance.
- One open trade at a time.
- Daily max-loss 3% of balance disables ordering until the next day.
- The UI requires a two-step confirm (arm, then click again within 5 s).

Tune everything in `src/lib/config.ts`: pattern tolerances (ATR multiples),
signal weights (candlestick 1 / structure 1.5 / classic 2 / EMA ±1 / RSI ±1),
risk percentages, and the buy/sell thresholds (65 / 35).

## Architecture

| Piece | Where |
|---|---|
| Candles `/api/candles?granularity=M5` | 500 closed candles, mock or OANDA |
| Stream `/api/stream` | SSE ticks; forming candle updated client-side, new candle on time boundary, auto-reconnect with backoff |
| Pattern engine | `src/lib/patterns/` — pure TS, swings → candlesticks → structure → classic; only closed candles analysed |
| Indicators | `technicalindicators` (EMA 20/50/200, RSI 14, MACD, BB, ATR) with UI toggles |
| Signal | weighted vote squash `50 + 50·tanh(score/4)` → Bullish/Bearish % + BUY/SELL/WAIT + "score, not a prediction" |
| Orders | `/api/order`, `/api/position` (live P/L + close), `/api/account` |
| Backtest | `/backtest` — any pattern or combined signal, win rate / avg R / max DD / trade list |

## Known limits

- In mock mode the daily max-loss gate is not simulated (SL/TP fills still
  are); it applies fully in OANDA mode.
- Pattern detectors are deliberately simple swing/line-fit heuristics — tune
  `lib/config.ts` against the backtester before trusting any signal.
