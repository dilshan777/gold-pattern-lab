import type { Candle } from "../types";
import { SWING_CONFIG } from "../config";

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Swing highs/lows: a bar whose high (low) is the extreme of the
 * surrounding `lookback` bars on both sides. Every other detector
 * in this folder builds on these points.
 */
export function findSwings(
  candles: Candle[],
  lookback: number = SWING_CONFIG.lookback
): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: candles[i].high, type: "high" });
    else if (isLow) out.push({ index: i, price: candles[i].low, type: "low" });
  }
  return out;
}

/** Most recent swing of a given type at or before `index`. */
export function lastSwing(
  swings: SwingPoint[],
  type: "high" | "low",
  index: number
): SwingPoint | null {
  for (let i = swings.length - 1; i >= 0; i--) {
    if (swings[i].type === type && swings[i].index <= index) return swings[i];
  }
  return null;
}
