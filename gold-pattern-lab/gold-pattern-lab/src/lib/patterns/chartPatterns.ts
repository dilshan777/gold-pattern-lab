import type { Candle, Direction, PatternSignal } from "../types";
import { PATTERN_CONFIG } from "../config";
import { atr, linregFit } from "./utils";
import { findSwings, type SwingPoint } from "./swings";

const CFG = PATTERN_CONFIG.classic;

function sig(
  type: string,
  direction: Direction,
  startIndex: number,
  endIndex: number,
  confidence: number
): PatternSignal {
  return { type, direction, startIndex, endIndex, confidence, group: "classic" };
}

function sameLevel(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns index of the candle closing beyond `level`, or -1. */
function closeBeyond(
  candles: Candle[],
  from: number,
  level: number,
  dir: 1 | -1
): number {
  for (let i = from; i < candles.length; i++) {
    if (dir === 1 && candles[i].close > level) return i;
    if (dir === -1 && candles[i].close < level) return i;
  }
  return -1;
}

/** Lowest low between two indices (inclusive). */
function lowestLow(candles: Candle[], from: number, to: number): number {
  let m = Infinity;
  for (let i = from; i <= to; i++) m = Math.min(m, candles[i].low);
  return m;
}
function highestHigh(candles: Candle[], from: number, to: number): number {
  let m = -Infinity;
  for (let i = from; i <= to; i++) m = Math.max(m, candles[i].high);
  return m;
}

// ---------------------------------------------------------------------------
// Double Top / Double Bottom
// ---------------------------------------------------------------------------

export function detectDoubleTop(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  const swings = findSwings(candles).filter((s) => s.type === "high");
  const out: PatternSignal[] = [];
  for (let x = 0; x < swings.length - 1; x++) {
    for (let y = x + 1; y < swings.length; y++) {
      const p1 = swings[x];
      const p2 = swings[y];
      if (p2.index - p1.index < CFG.minSwingSeparation) continue;
      const tol = CFG.doubleTopTolATR * a[p2.index];
      if (!sameLevel(p1.price, p2.price, tol)) continue;
      const neckline = lowestLow(candles, p1.index, p2.index);
      const depth = Math.min(p1.price, p2.price) - neckline;
      if (depth < CFG.necklineBreakATR * a[p2.index]) continue;
      const conf = closeBeyond(candles, p2.index + 1, neckline, -1);
      if (conf >= 0) {
        out.push(sig("Double Top", "bearish", p1.index, conf, 0.8));
        break;
      }
    }
  }
  return out;
}

export function detectDoubleBottom(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  const swings = findSwings(candles).filter((s) => s.type === "low");
  const out: PatternSignal[] = [];
  for (let x = 0; x < swings.length - 1; x++) {
    for (let y = x + 1; y < swings.length; y++) {
      const p1 = swings[x];
      const p2 = swings[y];
      if (p2.index - p1.index < CFG.minSwingSeparation) continue;
      const tol = CFG.doubleTopTolATR * a[p2.index];
      if (!sameLevel(p1.price, p2.price, tol)) continue;
      const neckline = highestHigh(candles, p1.index, p2.index);
      const depth = neckline - Math.max(p1.price, p2.price);
      if (depth < CFG.necklineBreakATR * a[p2.index]) continue;
      const conf = closeBeyond(candles, p2.index + 1, neckline, 1);
      if (conf >= 0) {
        out.push(sig("Double Bottom", "bullish", p1.index, conf, 0.8));
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Head & Shoulders (+ inverted)
// ---------------------------------------------------------------------------

function detectHS(
  candles: Candle[],
  inverted: boolean
): PatternSignal[] {
  const a = atr(candles, 14);
  const type = inverted ? "low" : "high";
  const swings = findSwings(candles).filter((s) => s.type === type);
  const out: PatternSignal[] = [];

  for (let i = 0; i + 2 < swings.length; i++) {
    const [s1, head, s2] = [swings[i], swings[i + 1], swings[i + 2]];
    if (head.index - s1.index < CFG.minSwingSeparation) continue;
    if (s2.index - head.index < CFG.minSwingSeparation) continue;

    const extremum = (idx: number) =>
      inverted ? candles[idx].low : candles[idx].high;

    const headE = extremum(head.index);
    const shTol = CFG.hsShoulderTolATR * a[s2.index];
    const headDepth = CFG.hsMinHeadDepthATR * a[head.index];

    if (inverted) {
      if (!(headE < s1.price - headDepth && headE < s2.price - headDepth)) continue;
      if (!sameLevel(s1.price, s2.price, shTol)) continue;
    } else {
      if (!(headE > s1.price + headDepth && headE > s2.price + headDepth)) continue;
      if (!sameLevel(s1.price, s2.price, shTol)) continue;
    }

    // neckline: extreme between shoulders
    const neckRange = inverted
      ? [highestHigh(candles, s1.index, s2.index)]
      : [lowestLow(candles, s1.index, s2.index)];
    const neckline = neckRange[0];

    const conf = inverted
      ? closeBeyond(candles, s2.index + 1, neckline, 1)
      : closeBeyond(candles, s2.index + 1, neckline, -1);
    if (conf >= 0) {
      out.push(
        sig(
          inverted ? "Inverted Head and Shoulders" : "Head and Shoulders",
          inverted ? "bullish" : "bearish",
          s1.index,
          conf,
          0.85
        )
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flags: impulse (flagpole) + small counter-slope consolidation
// ---------------------------------------------------------------------------

function detectFlag(candles: Candle[], bearish: boolean): PatternSignal[] {
  const a = atr(candles, 14);
  const out: PatternSignal[] = [];

  for (let i = 1; i < candles.length - 3; i++) {
    // flagpole: strong move over a few bars
    const move = bearish
      ? candles[i].open - candles[i].close
      : candles[i].close - candles[i].open;
    if (move < CFG.impulseMinATR * a[i]) continue;

    // consolidation: next few bars drift back slightly, tight range
    const start = i + 1;
    let end = -1;
    let slopeSum = 0;
    let maxRange = 0;
    for (let j = start; j < Math.min(start + CFG.flagMaxBars, candles.length); j++) {
      maxRange = Math.max(maxRange, candles[j].high - candles[j].low);
      slopeSum += candles[j].close - candles[j].open;
      const n = j - start + 1;
      const back = bearish ? candles[j].close - candles[i].close : candles[i].close - candles[j].close;
      const driftOk = back > 0 && back <= CFG.flagSlopeMaxATR * a[j] * n;
      if (!driftOk) break;
      if (n >= 3) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    if (maxRange > CFG.flagSlopeMaxATR * a[end] * (end - start + 1)) continue;
    // slope of consolidation should oppose the pole
    const avg = slopeSum / (end - start + 1);
    if (bearish && avg >= 0) continue;
    if (!bearish && avg <= 0) continue;

    out.push(
      sig(
        bearish ? "Bearish Flag" : "Bullish Flag",
        bearish ? "bearish" : "bullish",
        i,
        end,
        0.7
      )
    );
    i = end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Triangles & wedges: two converging/diverging trendlines through swings
// ---------------------------------------------------------------------------

interface Line {
  slope: number; // price per bar
  intercept: number; // price at index 0
  at(idx: number): number;
  touches: number;
  dev: number; // mean deviation of touched points
}

function fitLine(xs: number[], ys: number[], idxBase: number): Line {
  const fit = linregFit(ys);
  const slope = fit.slope;
  const intercept = fit.intercept - slope * idxBase;
  const at = (idx: number) => intercept + slope * (idx - idxBase);
  const dev =
    xs.length > 2
      ? xs.reduce((s, x, k) => s + Math.abs(ys[k] - at(x)), 0) / xs.length
      : 0;
  return { slope, intercept, at, touches: xs.length, dev };
}

function triangleScan(
  candles: Candle[],
  a: number[],
  kind:
    | "ascending"
    | "descending"
    | "symmetrical"
    | "rising-wedge"
    | "falling-wedge"
): PatternSignal[] {
  const swings = findSwings(candles, 2);
  const out: PatternSignal[] = [];
  const n = candles.length;

  // sliding windows of ~15-40 bars
  for (let wStart = 0; wStart + 15 < n; wStart += 5) {
    const wEnd = Math.min(wStart + 40, n - 1);
    const winSw = swings.filter((s) => s.index >= wStart && s.index <= wEnd);
    const highs = winSw.filter((s) => s.type === "high");
    const lows = winSw.filter((s) => s.type === "low");
    if (highs.length < 2 || lows.length < 2) continue;
    if (highs.length < CFG.triangleTouches || lows.length < CFG.triangleTouches) continue;

    const hx = highs.map((s) => s.index);
    const hy = highs.map((s) => s.price);
    const lx = lows.map((s) => s.index);
    const ly = lows.map((s) => s.price);
    const upper = fitLine(hx, hy, wStart);
    const lower = fitLine(lx, ly, wStart);
    const atrRef = a[wEnd] || 1;

    // classification
    const upSlope = upper.slope;
    const loSlope = lower.slope;
    const flat = (m: number) => Math.abs(m) < CFG.wedgeSlopeMinATR * atrRef * 0.6;

    let name = "";
    let direction: Direction = "neutral";
    if (kind === "ascending" && flat(upSlope) && loSlope > CFG.wedgeSlopeMinATR * atrRef) {
      name = "Ascending Triangle"; direction = "bullish";
    } else if (kind === "descending" && flat(loSlope) && upSlope < -CFG.wedgeSlopeMinATR * atrRef) {
      name = "Descending Triangle"; direction = "bearish";
    } else if (kind === "symmetrical" && upSlope < 0 && loSlope > 0 && upSlope + loSlope > -0.2 * Math.abs(upSlope)) {
      name = "Symmetrical Triangle"; direction = "neutral";
    } else if (kind === "rising-wedge" && upSlope > CFG.wedgeSlopeMinATR * atrRef && loSlope > CFG.wedgeSlopeMinATR * atrRef && upSlope < loSlope) {
      name = "Rising Wedge"; direction = "bearish";
    } else if (kind === "falling-wedge" && upSlope < -CFG.wedgeSlopeMinATR * atrRef && loSlope < -CFG.wedgeSlopeMinATR * atrRef && upSlope > loSlope) {
      name = "Falling Wedge"; direction = "bullish";
    } else {
      continue;
    }

    // convergence sanity: lines meet within a reasonable horizon
    if (upSlope - loSlope >= -1e-9) continue; // diverging
    const meetBar = (lower.intercept - upper.intercept) / (upSlope - loSlope) + wStart;
    if (meetBar < wEnd - 2 || meetBar > wEnd + 60) continue;

    // signal at the last bar of the window (pattern complete, still closed)
    out.push(sig(name, direction, wStart, wEnd, 0.65));
    break; // one signal per kind
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cup & Handle
// ---------------------------------------------------------------------------

function detectCupAndHandle(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  const highs = findSwings(candles).filter((s) => s.type === "high");
  const out: PatternSignal[] = [];

  for (let x = 0; x < highs.length - 1; x++) {
    for (let y = x + 1; y < highs.length; y++) {
      const left = highs[x];
      const right = highs[y];
      if (right.index - left.index < 10) continue;
      if (right.index - left.index > 120) break;
      const tol = CFG.cupRimTolATR * a[right.index];
      if (!sameLevel(left.price, right.price, tol)) continue;

      const rim = Math.max(left.price, right.price);
      const cupLow = lowestLow(candles, left.index, right.index);
      if (rim - cupLow < CFG.cupDepthMinATR * a[right.index]) continue;

      // handle: pullback after right rim, shallow, few bars
      const handleEnd = Math.min(right.index + CFG.handleMaxBars, candles.length - 1);
      const handleLow = lowestLow(candles, right.index, handleEnd);
      if (handleLow < rim - CFG.handleDepthMaxATR * a[handleEnd]) continue;
      if (handleEnd === right.index) continue;

      out.push(sig("Cup and Handle", "bullish", left.index, handleEnd, 0.7));
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectClassicPatterns(candles: Candle[]): PatternSignal[] {
  const a = atr(candles, 14);
  return [
    ...detectDoubleTop(candles),
    ...detectDoubleBottom(candles),
    ...detectHS(candles, false),
    ...detectHS(candles, true),
    ...detectFlag(candles, false),
    ...detectFlag(candles, true),
    ...triangleScan(candles, a, "ascending"),
    ...triangleScan(candles, a, "descending"),
    ...triangleScan(candles, a, "symmetrical"),
    ...triangleScan(candles, a, "rising-wedge"),
    ...triangleScan(candles, a, "falling-wedge"),
    ...detectCupAndHandle(candles),
  ];
}
