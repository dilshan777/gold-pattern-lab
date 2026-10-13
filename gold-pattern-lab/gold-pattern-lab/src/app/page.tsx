"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TerminalChart, { type ChartToggles } from "@/components/TerminalChart";
import SignalPanel from "@/components/SignalPanel";
import SidePanel from "@/components/SidePanel";
import OrderPanel from "@/components/OrderPanel";
import { useCandles, usePriceStream } from "@/components/hooks";
import { detectAll } from "@/lib/patterns";
import { computeIndicators } from "@/lib/indicators";
import { computeSignal } from "@/lib/signal";
import type { Candle, PatternGroup } from "@/lib/types";
import { GRANULARITIES, granularitySeconds } from "@/lib/types";

const TOGGLE_DEFS: {
  key: keyof ChartToggles;
  label: string;
  group?: PatternGroup;
}[] = [
  { key: "candlePatterns", label: "Candlestick", group: "candlestick" },
  { key: "structure", label: "Institutional", group: "institutional" },
  { key: "classic", label: "Classic", group: "classic" },
  { key: "ema", label: "EMA 20/50/200" },
  { key: "bb", label: "Bollinger" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
];

export default function Home() {
  const [granularity, setGranularity] = useState("M5");
  const { data, error, loading } = useCandles(granularity);
  const [closed, setClosed] = useState<Candle[]>([]);
  const [forming, setForming] = useState<Candle | null>(null);
  const [toggles, setToggles] = useState<ChartToggles>({
    candlePatterns: true,
    structure: true,
    classic: true,
    ema: true,
    bb: false,
    rsi: false,
    macd: false,
  });
  const [lastTick, setLastTick] = useState<number | null>(null);

  // seed history: everything except the last (still-forming) candle
  useEffect(() => {
    if (!data?.candles.length) return;
    setClosed(data.candles.slice(0, -1));
    setForming(data.candles[data.candles.length - 1] ?? null);
  }, [data]);

  const applyTick = (t: { time: number; mid: number }) => {
    setLastTick(t.mid);
    const bucket = granularitySeconds(granularity);
    const candleTime = Math.floor(t.time / bucket) * bucket;
    setForming((f) => {
      if (!f) {
        return { time: candleTime, open: t.mid, high: t.mid, low: t.mid, close: t.mid };
      }
      if (candleTime > f.time) {
        // candle boundary: push the finished candle into `closed`, start a new one
        setClosed((c) => [...c, f]);
        return { time: candleTime, open: f.close, high: t.mid, low: t.mid, close: t.mid };
      }
      if (candleTime < f.time) return f; // tick from an older bucket, ignore
      return {
        ...f,
        high: Math.max(f.high, t.mid),
        low: Math.min(f.low, t.mid),
        close: t.mid,
      };
    });
  };
  const tickRef = useRef(applyTick);
  tickRef.current = applyTick;
  const connected = usePriceStream((t) => tickRef.current(t));

  // ---- derived data (only closed candles — signals never flicker) ----
  const enabledGroups = useMemo<PatternGroup[]>(
    () =>
      (["candlestick", "institutional", "classic"] as PatternGroup[]).filter((g) =>
        g === "candlestick"
          ? toggles.candlePatterns
          : g === "institutional"
            ? toggles.structure
            : toggles.classic
      ),
    [toggles]
  );

  const patterns = useMemo(
    () => (closed.length > 30 ? detectAll([...closed, forming ?? closed[closed.length - 1]], { groups: enabledGroups }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closed, enabledGroups]
  );

  const indicators = useMemo(
    () => (closed.length > 30 ? computeIndicators(closed) : null),
    [closed]
  );

  const signal = useMemo(
    () => (closed.length > 30 ? computeSignal([...closed, forming ?? closed[closed.length - 1]]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closed]
  );

  const price = lastTick ?? forming?.close ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-3 p-3 md:p-4">
      {/* header */}
      <header className="flex flex-wrap items-center gap-3 rounded-lg border border-[#1c2128] bg-[#10141a] px-4 py-3">
        <div className="mr-auto">
          <h1 className="text-base font-bold text-white">
            Gold Pattern Lab
            <span className="ml-2 rounded bg-[#f59e0b22] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#fbbf24]">
              {data?.mock === false ? "OANDA demo" : "Mock data"}
            </span>
          </h1>
          <p className="text-[11px] text-[#5b6472]">
            XAU/USD pattern analysis · paper orders only · not financial advice
          </p>
        </div>

        <div className="flex items-center gap-1 rounded border border-[#1c2128] bg-[#0b0e11] p-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.name}
              onClick={() => setGranularity(g.name)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                granularity === g.name
                  ? "bg-[#3b82f6] text-white"
                  : "text-[#8b93a1] hover:text-white"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        <div className="text-right">
          <div className="text-lg font-bold tabular-nums text-white">
            {price ? price.toFixed(2) : "—"}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#8b93a1]">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                connected ? "bg-[#22c55e]" : "bg-[#ef4444]"
              }`}
            />
            {connected ? "live" : "reconnecting…"}
          </div>
        </div>

        <Link
          href="/backtest"
          className="rounded border border-[#1c2128] bg-[#0b0e11] px-3 py-1.5 text-xs font-medium text-[#aab2c0] hover:text-white"
        >
          Backtest →
        </Link>
      </header>

      {/* toggles */}
      <div className="flex flex-wrap gap-2">
        {TOGGLE_DEFS.map((t) => (
          <button
            key={t.key}
            onClick={() => setToggles((s) => ({ ...s, [t.key]: !s[t.key] }))}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              toggles[t.key]
                ? "border-[#3b82f6] bg-[#3b82f622] text-[#93c5fd]"
                : "border-[#1c2128] bg-[#10141a] text-[#5b6472] hover:text-[#aab2c0]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded border border-[#ef444444] bg-[#ef44440d] p-3 text-xs text-[#fca5a5]">
          {error}
        </p>
      )}

      {/* body */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {loading && !closed.length ? (
            <div className="flex h-[420px] items-center justify-center rounded-lg border border-[#1c2128] bg-[#10141a] text-sm text-[#5b6472]">
              Loading candles…
            </div>
          ) : (
            <TerminalChart
              closed={closed}
              forming={forming}
              markers={patterns}
              toggles={toggles}
              indicators={indicators}
              positionLines={null}
            />
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <SignalPanel signal={signal} />
          <OrderPanel currentPrice={price} />
          <div className="min-h-[300px] flex-1">
            <SidePanel patterns={patterns} candles={closed} />
          </div>
        </aside>
      </div>
    </main>
  );
}
