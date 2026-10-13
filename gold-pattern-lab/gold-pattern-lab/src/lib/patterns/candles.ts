import type { Candle, Direction, PatternSignal } from "../types";
import { PATTERN_CONFIG } from "../config";
import { atr, body, isBull, isBear, lowerWick, range, upperWick } from "./utils";

const CFG = PATTERN_CONFIG.candlestick;

function sig(
  type: string,
  direction: Direction,
  index: number,
  confidence: number
): PatternSignal {
  return { type, direction, startIndex: index, endIndex: index, confidence, group: "candlestick" };
}

/**
 * Standard Doji: open ≈ close (body within a fraction of ATR),
 * with wicks on both sides.
 */
export function detectDoji(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const r = range(c);
    if (body(c) <= CFG.dojiBodyATR * a[i] && body(c) <= 0.33 * r) {
      out.push(sig("Doji", "neutral", i, 0.55));
    }
  }
  return out;
}

/** Dragonfly Doji: body at the top of the range, long lower wick, no upper wick. */
export function detectDragonflyDoji(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const r = range(c);
    const b = body(c);
    const bodyTop = Math.max(c.open, c.close);
    if (
      b <= CFG.dojiBodyATR * a[i] &&
      c.high - bodyTop <= CFG.smallWickMaxRangePct * r &&
      lowerWick(c) >= CFG.longWickRatio * Math.max(b, 1e-9) &&
      lowerWick(c) >= 0.5 * r
    ) {
      out.push(sig("Dragonfly Doji", "bullish", i, 0.65));
    }
  }
  return out;
}

/** Gravestone Doji: body at the bottom of the range, long upper wick, no lower wick. */
export function detectGravestoneDoji(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const r = range(c);
    const b = body(c);
    const bodyBottom = Math.min(c.open, c.close);
    if (
      b <= CFG.dojiBodyATR * a[i] &&
      bodyBottom - c.low <= CFG.smallWickMaxRangePct * r &&
      upperWick(c) >= CFG.longWickRatio * Math.max(b, 1e-9) &&
      upperWick(c) >= 0.5 * r
    ) {
      out.push(sig("Gravestone Doji", "bearish", i, 0.65));
    }
  }
  return out;
}

/** Bullish Engulfing: red candle fully engulfed by a following green candle. */
export function detectBullishEngulfing(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1];
    const c = candles[i];
    if (
      isBear(p) &&
      isBull(c) &&
      c.open <= p.close &&
      c.close >= p.open &&
      body(c) >= body(p)
    ) {
      const rel = body(c) / Math.max(a[i], 1e-9);
      out.push(sig("Bullish Engulfing", "bullish", i, Math.min(0.6 + rel * 0.1, 0.9)));
    }
  }
  return out;
}

/** Bearish Engulfing: green candle fully engulfed by a following red candle. */
export function detectBearishEngulfing(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1];
    const c = candles[i];
    if (
      isBull(p) &&
      isBear(c) &&
      c.open >= p.close &&
      c.close <= p.open &&
      body(c) >= body(p)
    ) {
      const rel = body(c) / Math.max(a[i], 1e-9);
      out.push(sig("Bearish Engulfing", "bearish", i, Math.min(0.6 + rel * 0.1, 0.9)));
    }
  }
  return out;
}

/** Hammer: small body in the upper third, lower wick >= 2x body. */
export function detectHammer(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const r = range(c);
    const b = body(c);
    const bodyTop = Math.max(c.open, c.close);
    if (
      b > 0 &&
      b <= CFG.dojiBodyATR * 2 * a[i] &&
      bodyTop - c.low >= (1 - CFG.bodyPositionPct) * r &&
      lowerWick(c) >= CFG.longWickRatio * b &&
      upperWick(c) <= 0.3 * r
    ) {
      out.push(sig("Hammer", "bullish", i, 0.7));
    }
  }
  return out;
}

/** Shooting Star: small body in the lower third, upper wick >= 2x body. */
export function detectShootingStar(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const r = range(c);
    const b = body(c);
    const bodyBottom = Math.min(c.open, c.close);
    if (
      b > 0 &&
      b <= CFG.dojiBodyATR * 2 * a[i] &&
      c.high - bodyBottom >= (1 - CFG.bodyPositionPct) * r &&
      upperWick(c) >= CFG.longWickRatio * b &&
      lowerWick(c) <= 0.3 * r
    ) {
      out.push(sig("Shooting Star", "bearish", i, 0.7));
    }
  }
  return out;
}

/**
 * Morning Star: 3 candles — strong red, small-bodied star gapping down,
 * strong green closing past the midpoint of the first candle.
 */
export function detectMorningStar(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 2; i < candles.length; i++) {
    const [c1, c2, c3] = [candles[i - 2], candles[i - 1], candles[i]];
    const mid = (c1.open + c1.close) / 2;
    if (
      isBear(c1) &&
      body(c1) >= 0.5 * a[i] &&
      body(c2) <= CFG.starBodyATR * a[i] &&
      c2.high < c1.low &&
      isBull(c3) &&
      body(c3) >= 0.5 * a[i] &&
      c3.close >= mid
    ) {
      out.push(sig("Morning Star", "bullish", i, 0.8));
    }
  }
  return out;
}

/** Evening Star: mirror of Morning Star. */
export function detectEveningStar(candles: Candle[], a: number[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  for (let i = 2; i < candles.length; i++) {
    const [c1, c2, c3] = [candles[i - 2], candles[i - 1], candles[i]];
    const mid = (c1.open + c1.close) / 2;
    if (
      isBull(c1) &&
      body(c1) >= 0.5 * a[i] &&
      body(c2) <= CFG.starBodyATR * a[i] &&
      c2.low > c1.high &&
      isBear(c3) &&
      body(c3) >= 0.5 * a[i] &&
      c3.close <= mid
    ) {
      out.push(sig("Evening Star", "bearish", i, 0.8));
    }
  }
  return out;
}

export function detectCandlestickPatterns(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  return [
    ...detectDoji(candles, a),
    ...detectDragonflyDoji(candles, a),
    ...detectGravestoneDoji(candles, a),
    ...detectBullishEngulfing(candles, a),
    ...detectBearishEngulfing(candles, a),
    ...detectHammer(candles, a),
    ...detectShootingStar(candles, a),
    ...detectMorningStar(candles, a),
    ...detectEveningStar(candles, a),
  ];
}
