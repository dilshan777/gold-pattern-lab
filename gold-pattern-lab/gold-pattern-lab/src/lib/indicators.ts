import { EMA, RSI, MACD, BollingerBands, ATR } from "technicalindicators";
import type { Candle } from "./types";

export interface IndicatorSeries {
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  rsi14: (number | null)[];
  macd: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
  bb: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
  atr14: (number | null)[];
}

const closes = (c: Candle[]) => c.map((x) => x.close);
const pad = <T>(arr: T[], n: number): (T | null)[] => [
  ...new Array<T | null>(Math.max(n - arr.length, 0)).fill(null),
  ...arr,
];

export function computeIndicators(candles: Candle[]): IndicatorSeries {
  const close = closes(candles);
  const n = candles.length;
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);

  const ema20 = EMA.calculate({ values: close, period: 20 });
  const ema50 = EMA.calculate({ values: close, period: 50 });
  const ema200 = EMA.calculate({ values: close, period: 200 });
  const rsi14 = RSI.calculate({ values: close, period: 14 });
  const macdRaw = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const bbRaw = BollingerBands.calculate({
    values: close,
    period: 20,
    stdDev: 2,
  });
  const atrRaw = ATR.calculate({ high, low, close, period: 14 });

  return {
    ema20: pad(ema20, n),
    ema50: pad(ema50, n),
    ema200: pad(ema200, n),
    rsi14: pad(rsi14, n),
    macd: {
      macd: pad(macdRaw.map((m) => m.MACD ?? null), n),
      signal: pad(macdRaw.map((m) => m.signal ?? null), n),
      histogram: pad(macdRaw.map((m) => m.histogram ?? null), n),
    },
    bb: {
      upper: pad(bbRaw.map((b) => b.upper), n),
      middle: pad(bbRaw.map((b) => b.middle), n),
      lower: pad(bbRaw.map((b) => b.lower), n),
    },
    atr14: pad(atrRaw, n),
  };
}
