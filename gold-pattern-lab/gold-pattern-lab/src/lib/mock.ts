import type { Candle, Tick } from "./types";
import { granularitySeconds } from "./types";

/** Deterministic PRNG so mock data is stable between reloads. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOL_PER_GRANULARITY: Record<string, number> = {
  M1: 0.35, M5: 0.7, M15: 1.1, H1: 2.2, H4: 4.0,
};

export function generateMockCandles(granularity: string, count = 500): Candle[] {
  const rnd = mulberry32(1337 + granularity.charCodeAt(0) * 7 + granularity.charCodeAt(granularity.length - 1));
  const bucket = granularitySeconds(granularity);
  const vol = VOL_PER_GRANULARITY[granularity] ?? 0.7;

  const now = Math.floor(Date.now() / 1000);
  const end = Math.floor(now / bucket) * bucket;
  let price = 3350 + rnd() * 20 - 10;
  let drift = 0;
  const out: Candle[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const time = end - i * bucket;
    drift = drift * 0.95 + (rnd() - 0.5) * 0.08;
    const open = price;
    const change = drift * vol + (rnd() - 0.5) * 2 * vol;
    const close = open + change;
    const high = Math.max(open, close) + rnd() * vol * 0.6;
    const low = Math.min(open, close) - rnd() * vol * 0.6;
    out.push({ time, open, high, low, close });
    price = close;
  }
  return out;
}

export function nextMockTick(prev: Tick, granularity: string): Tick {
  const rnd = Math.random;
  const vol = (VOL_PER_GRANULARITY[granularity] ?? 0.7) * 0.02;
  const mid = prev.mid + (rnd() - 0.5) * 2 * vol;
  const spread = 0.15 + rnd() * 0.1;
  return {
    time: Math.floor(Date.now() / 1000),
    bid: +(mid - spread / 2).toFixed(3),
    ask: +(mid + spread / 2).toFixed(3),
    mid: +mid.toFixed(3),
  };
}

// ---- In-memory paper-trading state for MOCK mode (per server instance) ---

export interface MockPosition {
  direction: "long" | "short";
  units: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openTime: string;
  realizedClosedToday: number; // simulated closed P/L today, USD
}

let mockState: {
  balance: number;
  position: MockPosition | null;
  lastFill: { units: number; price: number; time: string } | null;
  realizedClosedToday: number;
} = { balance: 100_000, position: null, lastFill: null, realizedClosedToday: 0 };

export function getMockState() {
  return mockState;
}

export function mockPlaceOrder(input: {
  units: number;
  stopDistance: number;
  targetDistance: number;
  currentPrice: number;
}): { ok: true } | { ok: false; error: string } {
  if (mockState.position) return { ok: false, error: "Only one open trade at a time." };
  const direction = input.units >= 0 ? "long" : "short";
  const entry = input.currentPrice;
  const stopLoss = direction === "long" ? entry - input.stopDistance : entry + input.stopDistance;
  const takeProfit = direction === "long" ? entry + input.targetDistance : entry - input.targetDistance;
  mockState.position = {
    direction,
    units: Math.abs(input.units),
    entryPrice: entry,
    stopLoss,
    takeProfit,
    openTime: new Date().toISOString(),
    realizedClosedToday: 0,
  };
  mockState.lastFill = { units: input.units, price: entry, time: new Date().toISOString() };
  return { ok: true };
}

/** Called periodically by /api/position to simulate SL/TP fills. */
export function mockProcessPosition(mid: number): "closed" | "open" | "none" {
  const p = mockState.position;
  if (!p) return "none";
  const hit =
    p.direction === "long"
      ? mid <= p.stopLoss
        ? p.stopLoss
        : mid >= p.takeProfit
          ? p.takeProfit
          : null
      : mid >= p.stopLoss
        ? p.stopLoss
        : mid <= p.takeProfit
          ? p.takeProfit
          : null;
  if (hit == null) return "open";
  const pl =
    (p.direction === "long" ? hit - p.entryPrice : p.entryPrice - hit) * p.units;
  mockState.balance += pl;
  mockState.realizedClosedToday += pl;
  mockState.position = null;
  return "closed";
}
