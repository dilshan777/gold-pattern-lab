import type { Candle, PatternGroup, PatternSignal } from "../types";
import { detectCandlestickPatterns } from "./candles";
import { detectStructurePatterns } from "./structure";
import { detectClassicPatterns } from "./chartPatterns";

export { findSwings, lastSwing, type SwingPoint } from "./swings";

export interface DetectOptions {
  groups?: PatternGroup[];
}

/** Run every enabled detector over CLOSED candles only. */
export function detectAll(candles: Candle[], opts: DetectOptions = {}): PatternSignal[] {
  const groups = opts.groups ?? ["candlestick", "institutional", "classic"];
  // The forming candle must never be analysed (no flickering signals).
  const closed = candles.slice(0, -1);
  const out: PatternSignal[] = [];
  if (groups.includes("candlestick")) out.push(...detectCandlestickPatterns(closed));
  if (groups.includes("institutional")) out.push(...detectStructurePatterns(closed));
  if (groups.includes("classic")) out.push(...detectClassicPatterns(closed));
  return out.sort((x, y) => x.endIndex - y.endIndex);
}
