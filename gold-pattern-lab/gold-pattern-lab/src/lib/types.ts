// ---- Shared types -------------------------------------------------------

export interface Candle {
  /** Unix timestamp in seconds, aligned to the timeframe boundary. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Direction = "bullish" | "bearish" | "neutral";

export type PatternGroup = "candlestick" | "institutional" | "classic";

export interface PatternSignal {
  type: string;
  direction: Direction;
  startIndex: number;
  endIndex: number;
  /** 0..1 */
  confidence: number;
  group: PatternGroup;
  /** Optional human-readable detail (e.g. "swept 2614.20"). */
  detail?: string;
}

export interface Tick {
  time: number;
  bid: number;
  ask: number;
  mid: number;
}

export interface Granularity {
  name: "M1" | "M5" | "M15" | "H1" | "H4";
  seconds: number;
}

export const GRANULARITIES: Granularity[] = [
  { name: "M1", seconds: 60 },
  { name: "M5", seconds: 300 },
  { name: "M15", seconds: 900 },
  { name: "H1", seconds: 3600 },
  { name: "H4", seconds: 14400 },
];

export function granularitySeconds(name: string): number {
  const g = GRANULARITIES.find((g) => g.name === name);
  return g ? g.seconds : 300;
}
