import type { Candle, PatternSignal } from "../types";
import { PATTERN_CONFIG } from "../config";
import { atr } from "./utils";
import { findSwings, type SwingPoint } from "./swings";

const CFG = PATTERN_CONFIG.structure;

function sig(
  type: string,
  direction: PatternSignal["direction"],
  startIndex: number,
  endIndex: number,
  confidence: number,
  detail?: string
): PatternSignal {
  return { type, direction, startIndex, endIndex, confidence, group: "institutional", detail };
}

/**
 * Liquidity Sweep (Stop Run): price wicks beyond a prior swing level but
 * closes back on the other side — classic stop-hunt signature.
 */
export function detectLiquiditySweeps(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  const swings = findSwings(candles);
  const out: PatternSignal[] = [];

  for (const s of swings) {
    for (let i = s.index + 1; i < candles.length; i++) {
      const c = candles[i];
      if (s.type === "high") {
        const swept = c.high > s.price + CFG.sweepWickATR * a[i];
        const closedBack = c.close < s.price;
        if (swept && (!CFG.sweepCloseBack || closedBack)) {
          out.push(
            sig("Liquidity Sweep", "bearish", s.index, i, 0.8,
              `swept ${s.price.toFixed(2)}`)
          );
          break;
        }
        if (c.close > s.price) break; // level broken, no sweep
      } else {
        const swept = c.low < s.price - CFG.sweepWickATR * a[i];
        const closedBack = c.close > s.price;
        if (swept && (!CFG.sweepCloseBack || closedBack)) {
          out.push(
            sig("Liquidity Sweep", "bullish", s.index, i, 0.8,
              `swept ${s.price.toFixed(2)}`)
          );
          break;
        }
        if (c.close < s.price) break;
      }
    }
  }
  return out;
}

/**
 * Fair Value Gap: 3-candle imbalance.
 * Bullish FVG: low[i+1] > high[i-1]; the gap (high[i-1], low[i+1]) is the zone.
 */
export function detectFairValueGaps(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const gapUp = candles[i + 1].low - candles[i - 1].high;
    if (gapUp >= CFG.fvgMinGapATR * a[i]) {
      out.push(
        sig("Fair Value Gap", "bullish", i - 1, i + 1, 0.6,
          `gap ${candles[i - 1].high.toFixed(2)}–${candles[i + 1].low.toFixed(2)}`)
      );
    }
    const gapDown = candles[i - 1].low - candles[i + 1].high;
    if (gapDown >= CFG.fvgMinGapATR * a[i]) {
      out.push(
        sig("Fair Value Gap", "bearish", i - 1, i + 1, 0.6,
          `gap ${candles[i + 1].high.toFixed(2)}–${candles[i - 1].low.toFixed(2)}`)
      );
    }
  }
  return out;
}

/**
 * Order Block: the last opposite-colored candle before an impulse move.
 * Bullish OB = last red candle before a strong rally (>= 1.5 ATR within
 * `obMaxCandles` bars, no red closes in between).
 */
export function detectOrderBlocks(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  const out: PatternSignal[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const c = candles[i];
    // Bullish OB candidate: red candle
    if (c.close < c.open) {
      for (let j = i + 1; j <= Math.min(i + CFG.obMaxCandles, candles.length - 1); j++) {
        if (candles[j].close < candles[j].open) break; // impulse invalidated
        const move = candles[j].close - c.close;
        if (move >= CFG.obMinMoveATR * a[j]) {
          out.push(
            sig("Order Block", "bullish", i, j, 0.65,
              `zone ${c.low.toFixed(2)}–${c.high.toFixed(2)}`)
          );
          break;
        }
      }
    }
    // Bearish OB candidate: green candle
    if (c.close > c.open) {
      for (let j = i + 1; j <= Math.min(i + CFG.obMaxCandles, candles.length - 1); j++) {
        if (candles[j].close > candles[j].open) break;
        const move = c.close - candles[j].close;
        if (move >= CFG.obMinMoveATR * a[j]) {
          out.push(
            sig("Order Block", "bearish", i, j, 0.65,
              `zone ${c.low.toFixed(2)}–${c.high.toFixed(2)}`)
          );
          break;
        }
      }
    }
  }
  return out;
}

/** Break of Structure: close beyond the most recent opposing swing level. */
export function detectBreakOfStructure(candles: Candle[]): PatternSignal[] {
  const swings = findSwings(candles);
  const out: PatternSignal[] = [];
  const seen = new Set<string>();

  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;
  for (let i = 0; i < candles.length; i++) {
    while (swings.length && swings[0].index === i) {
      const s = swings.shift()!;
      if (s.type === "high") lastHigh = s;
      else lastLow = s;
    }
    const c = candles[i];
    if (lastHigh && c.close > lastHigh.price && !seen.has("H" + lastHigh.index)) {
      seen.add("H" + lastHigh.index);
      out.push(sig("Break of Structure", "bullish", lastHigh.index, i, 0.75));
    }
    if (lastLow && c.close < lastLow.price && !seen.has("L" + lastLow.index)) {
      seen.add("L" + lastLow.index);
      out.push(sig("Break of Structure", "bearish", lastLow.index, i, 0.75));
    }
  }
  return out;
}

/**
 * Change of Character: the FIRST close beyond the most recent swing level
 * that goes against the prevailing leg (lower highs/lows → up-close above a
 * swing high = bullish CHoCH, and mirror).
 */
export function detectChangeOfCharacter(candles: Candle[]): PatternSignal[] {
  const swings = findSwings(candles);
  const out: PatternSignal[] = [];
  const used = new Set<string>();

  // prevailing trend from the last two swing highs and lows
  for (let i = 4; i < candles.length; i++) {
    const prior = swings.filter((s) => s.index < i);
    const highs = prior.filter((s) => s.type === "high");
    const lows = prior.filter((s) => s.type === "low");
    if (highs.length < 2 || lows.length < 2) continue;

    const hh = highs[highs.length - 1];
    const hPrev = highs[highs.length - 2];
    const ll = lows[lows.length - 1];
    const lPrev = lows[lows.length - 2];

    const downtrend = hh.price < hPrev.price && ll.price < lPrev.price;
    const uptrend = hh.price > hPrev.price && ll.price > lPrev.price;

    const c = candles[i];
    if (downtrend && c.close > hh.price && !used.has("C" + hh.index)) {
      used.add("C" + hh.index);
      out.push(sig("Change of Character", "bullish", hh.index, i, 0.85));
    }
    if (uptrend && c.close < ll.price && !used.has("C" + ll.index)) {
      used.add("C" + ll.index);
      out.push(sig("Change of Character", "bearish", ll.index, i, 0.85));
    }
  }
  return out;
}

export function detectStructurePatterns(candles: Candle[]): PatternSignal[] {
  return [
    ...detectLiquiditySweeps(candles),
    ...detectFairValueGaps(candles),
    ...detectOrderBlocks(candles),
    ...detectBreakOfStructure(candles),
    ...detectChangeOfCharacter(candles),
  ];
}
