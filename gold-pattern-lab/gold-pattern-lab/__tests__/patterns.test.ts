import { describe, expect, it } from "vitest";
import type { Candle } from "../src/lib/types";
import { findSwings } from "../src/lib/patterns/swings";
import {
  detectBearishEngulfing, detectBullishEngulfing, detectDoji, detectDragonflyDoji,
  detectEveningStar, detectGravestoneDoji, detectHammer, detectMorningStar,
  detectShootingStar,
} from "../src/lib/patterns/candles";
import {
  detectBreakOfStructure, detectChangeOfCharacter, detectFairValueGaps,
  detectLiquiditySweeps, detectOrderBlocks,
} from "../src/lib/patterns/structure";
import {
  detectClassicPatterns, detectCupAndHandle, detectDoubleBottom, detectDoubleTop,
} from "../src/lib/patterns/chartPatterns";
import { atr } from "../src/lib/patterns/utils";

// hand-made candle helper: mk([[o,h,l,c], ...])
function mk(rows: [number, number, number, number][]): Candle[] {
  return rows.map(([open, high, low, close], i) => ({
    time: 1_700_000_000 + i * 300, open, high, low, close,
  }));
}
const base = (n: number): [number, number, number, number][] =>
  Array.from({ length: n }, () => [100.5, 103, 99.5, 100.5]);
const has = (list: { type: string; direction: string }[], type: string, dir: string) =>
  expect(list.some((p) => p.type === type && p.direction === dir)).toBe(true);

describe("swings", () => {
  it("finds alternating swing highs and lows", () => {
    const rows = base(12);
    rows[3] = [100, 105, 99.5, 104];  // peak
    rows[7] = [100, 100.8, 96, 97];   // trough
    const s = findSwings(mk(rows), 3);
    expect(s.some((x) => x.type === "high" && x.index === 3)).toBe(true);
    expect(s.some((x) => x.type === "low" && x.index === 7)).toBe(true);
  });
});

describe("candlestick patterns (ATR-scaled)", () => {
  it("Standard Doji", () => {
    const rows = base(6); rows[3] = [100, 101.5, 98.5, 100];
    has(detectDoji(mk(rows), atr(mk(rows))), "Doji", "neutral");
  });
  it("Dragonfly Doji", () => {
    const rows = base(6); rows[3] = [100, 100.2, 97, 100];
    has(detectDragonflyDoji(mk(rows), atr(mk(rows))), "Dragonfly Doji", "bullish");
  });
  it("Gravestone Doji", () => {
    const rows = base(6); rows[3] = [100, 103, 99.8, 100];
    has(detectGravestoneDoji(mk(rows), atr(mk(rows))), "Gravestone Doji", "bearish");
  });
  it("Bullish / Bearish Engulfing", () => {
    const b = base(6); b[2] = [101, 101.2, 99.8, 100]; b[3] = [99.9, 101.3, 99.7, 101.1];
    has(detectBullishEngulfing(mk(b), atr(mk(b))), "Bullish Engulfing", "bullish");
    const s = base(6); s[2] = [100, 101.2, 99.8, 101]; s[3] = [101.1, 101.3, 99.7, 99.9];
    has(detectBearishEngulfing(mk(s), atr(mk(s))), "Bearish Engulfing", "bearish");
  });
  it("Hammer / Shooting Star", () => {
    const h = base(6); h[3] = [100.5, 100.9, 97.5, 100.6];
    has(detectHammer(mk(h), atr(mk(h))), "Hammer", "bullish");
    const s = base(6); s[3] = [99.5, 102.5, 99.4, 99.6];
    has(detectShootingStar(mk(s), atr(mk(s))), "Shooting Star", "bearish");
  });
  it("Morning Star / Evening Star", () => {
    const m = base(8);
    m[3] = [102, 102.2, 99.9, 100]; m[4] = [99.5, 99.8, 99.3, 99.6];
    m[5] = [99.7, 101.4, 99.6, 101.2];
    has(detectMorningStar(mk(m), atr(mk(m))), "Morning Star", "bullish");
    const e = base(8);
    e[3] = [100, 102.1, 99.8, 102]; e[4] = [102.4, 102.6, 102.1, 102.5];
    e[5] = [102.3, 102.4, 99.6, 100];
    has(detectEveningStar(mk(e), atr(mk(e))), "Evening Star", "bearish");
  });
});

describe("structure patterns", () => {
  it("Liquidity Sweep (bearish stop run)", () => {
    const rows = base(10);
    rows[3] = [100, 105, 99.5, 104];       // swing high 105
    rows[8] = [103, 105.5, 102.5, 104.5];  // wicks above, closes back below
    has(detectLiquiditySweeps(mk(rows)), "Liquidity Sweep", "bearish");
  });
  it("Fair Value Gap", () => {
    const rows = base(6);
    rows[2] = [100, 100, 99.5, 99.8];
    rows[3] = [100, 103.2, 99.8, 103];
    rows[4] = [103, 103.2, 101, 102];
    has(detectFairValueGaps(mk(rows)), "Fair Value Gap", "bullish");
  });
  it("Order Block", () => {
    const rows = base(10);
    rows[2] = [100.5, 100.8, 99.6, 100];   // last red before impulse
    rows[3] = [100.2, 101.5, 100, 101.3];
    rows[4] = [101.3, 103.5, 101.2, 103.3]; // rally >= 1.5 ATR
    has(detectOrderBlocks(mk(rows)), "Order Block", "bullish");
  });
  it("Break of Structure", () => {
    const rows = base(12);
    rows[3] = [100, 104, 99.5, 103.5];  // swing high 104
    rows[9] = [103, 105, 102.8, 104.5]; // close above
    has(detectBreakOfStructure(mk(rows)), "Break of Structure", "bullish");
  });
  it("Change of Character", () => {
    const rows = base(20);
    rows[3] = [100, 105, 99.5, 104];    // H1
    rows[6] = [101, 101.5, 97, 98];     // L1
    rows[9] = [99, 104, 98.5, 103.5];   // H2 lower
    rows[12] = [100, 100.5, 95, 96];    // L2 lower -> downtrend
    rows[16] = [99, 106, 98.5, 105.5];  // close above H2 -> CHoCH
    has(detectChangeOfCharacter(mk(rows)), "Change of Character", "bullish");
  });
});

describe("classic chart patterns", () => {
  it("Double Top / Double Bottom", () => {
    const t = base(16);
    t[3] = [100, 105, 100, 104]; t[4] = [102, 102.5, 100.5, 101];
    t[9] = [101, 105, 100.8, 104];
    t[12] = [101, 101.5, 100.6, 100.9]; t[13] = [100.5, 100.8, 99, 99.2];
    has(detectDoubleTop(mk(t)), "Double Top", "bearish");
    const b = base(16);
    b[3] = [100, 100.2, 95, 96]; b[4] = [97, 99.5, 96.8, 99];
    b[9] = [99, 99.4, 95, 96];
    b[12] = [98, 99.4, 97.8, 99.2]; b[13] = [99.5, 101, 99.2, 100.8];
    has(detectDoubleBottom(mk(b)), "Double Bottom", "bullish");
  });
  it("Head & Shoulders", () => {
    const rows = base(22);
    rows[3] = [100, 105, 99.8, 104.5];   // L shoulder
    rows[5] = [103, 103.5, 101.5, 102];  // neck 1
    rows[8] = [102, 109, 101.8, 108.5];  // head
    rows[10] = [105, 105.5, 101.6, 102]; // neck 2 (~101.5 neckline)
    rows[13] = [103, 105.2, 102.8, 104.6]; // R shoulder
    rows[16] = [103, 103.5, 99, 99.5];   // close below neckline
    has(detectClassicPatterns(mk(rows)), "Head and Shoulders", "bearish");
  });
  it("Bullish Flag", () => {
    const rows = base(12);
    rows[3] = [100, 104.1, 99.9, 104];      // flagpole
    rows[4] = [103.8, 103.9, 103.2, 103.4];
    rows[5] = [103.4, 103.5, 102.9, 103.1];
    rows[6] = [103.1, 103.2, 102.7, 102.9]; // down-drift consolidation
    has(detectClassicPatterns(mk(rows)), "Bullish Flag", "bullish");
  });
  it("Ascending / Symmetrical Triangle, Wedges", () => {
    const a = base(18);
    a[2] = [100, 100.5, 99.8, 100]; a[4] = [102, 104, 101.8, 103.8];
    a[7] = [101, 101.2, 100, 100.2]; a[9] = [103, 104.05, 102.8, 103.9];
    a[12] = [102, 102.2, 101, 101.2];
    has(detectClassicPatterns(mk(a)), "Ascending Triangle", "bullish");
    const s = base(18);
    s[2] = [100, 100.5, 99.8, 100]; s[4] = [102, 104, 101.8, 103.8];
    s[7] = [101, 101.2, 100, 100.2]; s[9] = [103, 103, 102.8, 102.9];
    s[12] = [102, 102.2, 101.5, 101.7];
    has(detectClassicPatterns(mk(s)), "Symmetrical Triangle", "neutral");
    const w = base(18);
    w[2] = [100, 100.5, 99.8, 100]; w[4] = [102, 102.6, 101.8, 102.4];
    w[7] = [102.5, 102.7, 101.6, 101.8]; w[9] = [103.4, 103.8, 103.2, 103.6];
    w[12] = [103.6, 103.7, 102.9, 103.1];
    has(detectClassicPatterns(mk(w)), "Rising Wedge", "bearish");
    const f = base(18);
    f[2] = [103, 103.3, 102.8, 103.1]; f[4] = [101.5, 101.7, 101, 101.2];
    f[7] = [101.3, 101.5, 100.7, 100.9]; f[9] = [100.8, 101, 100.2, 100.4];
    f[12] = [100.5, 100.7, 99.9, 100.1];
    has(detectClassicPatterns(mk(f)), "Falling Wedge", "bullish");
  });
  it("Cup and Handle", () => {
    const rows = base(20);
    rows[2] = [104, 105, 103.8, 104.8];    // left rim
    rows[8] = [100.5, 101, 99.9, 100.2];   // cup low (deep)
    rows[14] = [104, 105.1, 103.9, 104.9]; // right rim
    rows[15] = [104.5, 104.6, 104, 104.2]; // handle
    rows[16] = [104.2, 104.3, 103.9, 104.1];
    has(detectCupAndHandle(mk(rows)), "Cup and Handle", "bullish");
  });
});
