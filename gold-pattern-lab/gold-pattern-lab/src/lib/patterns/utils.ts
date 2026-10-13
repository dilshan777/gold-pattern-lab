import type { Candle } from "../types";

export function trueRange(c: Candle, prev: Candle): number {
  return Math.max(
    c.high - c.low,
    Math.abs(c.high - prev.close),
    Math.abs(c.low - prev.close)
  );
}

/** Wilder-smoothed ATR(14), same length as input; first value is simple avg. */
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0) return out;
  if (candles.length < period + 1) {
    const avg = candles.reduce((s, c) => s + (c.high - c.low), 0) / candles.length;
    return out.fill(avg);
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRange(candles[i], candles[i - 1]);
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trueRange(candles[i], candles[i - 1])) / period;
    out[i] = prev;
  }
  // backfill warmup region with the first computed value
  for (let i = 0; i < period; i++) out[i] = out[period];
  return out;
}

/** Linear regression slope of values per bar. */
export function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  return den === 0 ? 0 : num / den;
}

export function linregFit(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const m = den === 0 ? 0 : num / den;
  return { slope: m, intercept: meanY - m * meanX };
}

export function range(c: Candle): number {
  return Math.max(c.high - c.low, 1e-9);
}

export function body(c: Candle): number {
  return Math.abs(c.close - c.open);
}

export function isBull(c: Candle): boolean {
  return c.close > c.open;
}

export function isBear(c: Candle): boolean {
  return c.close < c.open;
}

export function upperWick(c: Candle): number {
  return c.high - Math.max(c.open, c.close);
}

export function lowerWick(c: Candle): number {
  return Math.min(c.open, c.close) - c.low;
}
