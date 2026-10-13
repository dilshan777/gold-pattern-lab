import type { Candle, Direction, PatternGroup } from "./types";
import { detectAll } from "./patterns";
import { computeSignal } from "./signal";

export interface BacktestOptions {
  /** Run only this pattern type (e.g. "Double Top"), or the combined signal. */
  patternType?: string;
  groups?: PatternGroup[];
  stopDistance: number;
  targetDistance: number;
  maxBarsInTrade?: number;
  warmup?: number;
}

export interface Trade {
  entryIndex: number;
  exitIndex: number;
  direction: Exclude<Direction, "neutral">;
  entry: number;
  exit: number;
  rMultiple: number;
  exitReason: "tp" | "sl" | "time";
}

export interface BacktestResult {
  totalTrades: number;
  winRatePct: number;
  avgR: number;
  maxDrawdownR: number;
  trades: Trade[];
}

function lastSignal(candles: Candle[], opts: BacktestOptions, index: number): Direction {
  const slice = candles.slice(Math.max(0, index - 200), index + 1);
  if (opts.patternType && opts.patternType !== "combined") {
    const pats = detectAll(slice, { groups: opts.groups }).filter(
      (p) => p.type === opts.patternType && p.endIndex >= slice.length - 3
    );
    const last = pats[pats.length - 1];
    return last ? last.direction : "neutral";
  }
  // combined signal: reuse the same voting as the signal panel
  const sig = computeSignal(slice);
  if (sig.label === "BUY") return "bullish";
  if (sig.label === "SELL") return "bearish";
  return "neutral";
}

export function runBacktest(candles: Candle[], opts: BacktestOptions): BacktestResult {
  const maxBars = opts.maxBarsInTrade ?? 48;
  const warmup = opts.warmup ?? 60;
  const trades: Trade[] = [];
  const dir: Exclude<Direction, "neutral">[] = ["bullish", "bearish"];

  let i = warmup;
  while (i < candles.length - 2) {
    const d = lastSignal(candles, opts, i);
    if (d === "neutral" || !dir.includes(d as "bullish")) {
      i++;
      continue;
    }
    const direction = d as "bullish" | "bearish";
    const entryIndex = i + 1;
    const entry = candles[entryIndex].open;
    const stop = direction === "bullish" ? entry - opts.stopDistance : entry + opts.stopDistance;
    const target = direction === "bullish" ? entry + opts.targetDistance : entry - opts.targetDistance;

    let exitIndex = -1;
    let exit = 0;
    let reason: Trade["exitReason"] = "time";
    const lastBar = Math.min(entryIndex + maxBars, candles.length - 1);
    for (let j = entryIndex; j <= lastBar; j++) {
      const c = candles[j];
      const hitSL = direction === "bullish" ? c.low <= stop : c.high >= stop;
      const hitTP = direction === "bullish" ? c.high >= target : c.low <= target;
      if (hitSL) {
        // conservative: if both hit in the same candle, count the stop
        exitIndex = j; exit = stop; reason = "sl";
        break;
      }
      if (hitTP) {
        exitIndex = j; exit = target; reason = "tp";
        break;
      }
    }
    if (exitIndex < 0) {
      exitIndex = lastBar;
      exit = candles[lastBar].close;
      reason = "time";
    }
    const diff = direction === "bullish" ? exit - entry : entry - exit;
    const r = diff / opts.stopDistance;
    trades.push({ entryIndex, exitIndex, direction, entry, exit, rMultiple: r, exitReason: reason });
    i = exitIndex + 1; // one trade at a time
  }

  const wins = trades.filter((t) => t.rMultiple > 0).length;
  const avgR = trades.length ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : 0;

  let equity = 0, peak = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.rMultiple;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }

  return {
    totalTrades: trades.length,
    winRatePct: trades.length ? (wins / trades.length) * 100 : 0,
    avgR,
    maxDrawdownR: maxDD,
    trades,
  };
}
