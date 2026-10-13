import type { Candle, Direction, PatternGroup } from "./types";
import { detectAll } from "./patterns";
import { computeIndicators } from "./indicators";
import { SIGNAL_CONFIG, SIGNAL_WEIGHTS } from "./config";

export interface SignalResult {
  /** 0..100 — 50 is neutral. */
  scorePct: number;
  label: "BUY" | "SELL" | "WAIT";
  /** Weighted vote contributions for display. */
  breakdown: { source: string; contribution: number }[];
}

function dirSign(d: Direction): number {
  return d === "bullish" ? 1 : d === "bearish" ? -1 : 0;
}

export function computeSignal(candles: Candle[]): SignalResult {
  const n = candles.length;
  const start = Math.max(0, n - 1 - SIGNAL_CONFIG.lookbackCandles);
  const slice = candles.slice(0, -1);
  const patterns = detectAll(slice).filter((p) => p.endIndex >= start);

  const breakdown: { source: string; contribution: number }[] = [];
  const groupW: Record<PatternGroup, number> = {
    candlestick: SIGNAL_WEIGHTS.candlestick,
    institutional: SIGNAL_WEIGHTS.structure,
    classic: SIGNAL_WEIGHTS.classic,
  };
  for (const p of patterns) {
    const c = groupW[p.group] * dirSign(p.direction) * p.confidence;
    breakdown.push({ source: p.type, contribution: c });
  }

  let score = breakdown.reduce((s, b) => s + b.contribution, 0);

  // --- indicator votes (last CLOSED candle) ---
  const ind = computeIndicators(slice);
  const i = slice.length - 1;
  const close = slice[i].close;
  const { ema20, ema50, rsi14 } = ind;

  let emaVote = 0;
  if (ema20[i] != null && ema50[i] != null) {
    if (close > ema20[i]! && ema20[i]! > ema50[i]!) emaVote = 1;
    else if (close < ema20[i]! && ema20[i]! < ema50[i]!) emaVote = -1;
  }
  score += emaVote * SIGNAL_WEIGHTS.emaTrend;
  breakdown.push({ source: "EMA trend", contribution: emaVote * SIGNAL_WEIGHTS.emaTrend });

  let rsiVote = 0;
  if (rsi14[i] != null) {
    if (rsi14[i]! < 30) rsiVote = 1; // oversold bounce bias
    else if (rsi14[i]! > 70) rsiVote = -1;
  }
  score += rsiVote * SIGNAL_WEIGHTS.rsiExtreme;
  breakdown.push({ source: "RSI extreme", contribution: rsiVote * SIGNAL_WEIGHTS.rsiExtreme });

  // smooth squash into 0..100
  const pct = Math.round(50 + 50 * Math.tanh(score / 4));
  const label: SignalResult["label"] =
    pct >= SIGNAL_CONFIG.buyThresholdPct
      ? "BUY"
      : pct <= SIGNAL_CONFIG.sellThresholdPct
        ? "SELL"
        : "WAIT";

  return { scorePct: pct, label, breakdown };
}
