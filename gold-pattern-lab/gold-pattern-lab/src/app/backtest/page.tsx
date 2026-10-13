"use client";

import { useState } from "react";
import Link from "next/link";
import { runBacktest, type BacktestResult } from "@/lib/backtest";
import type { Candle, PatternGroup } from "@/lib/types";

const PATTERN_TYPES = [
  "combined",
  "Doji", "Dragonfly Doji", "Gravestone Doji",
  "Bullish Engulfing", "Bearish Engulfing", "Hammer", "Shooting Star",
  "Morning Star", "Evening Star",
  "Liquidity Sweep", "Fair Value Gap", "Order Block",
  "Break of Structure", "Change of Character",
  "Double Top", "Double Bottom",
  "Head and Shoulders", "Inverted Head and Shoulders",
  "Bullish Flag", "Bearish Flag",
  "Ascending Triangle", "Descending Triangle", "Symmetrical Triangle",
  "Rising Wedge", "Falling Wedge", "Cup and Handle",
];

export default function BacktestPage() {
  const [granularity, setGranularity] = useState("M5");
  const [pattern, setPattern] = useState("combined");
  const [stop, setStop] = useState("1.50");
  const [target, setTarget] = useState("3.00");
  const [maxBars, setMaxBars] = useState("48");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/candles?granularity=${granularity}&count=2000`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const candles: Candle[] = json.candles;
      const group: PatternGroup =
        pattern === "combined"
          ? "classic"
          : ["Liquidity Sweep", "Fair Value Gap", "Order Block", "Break of Structure", "Change of Character"].includes(pattern)
            ? "institutional"
            : ["Double Top", "Double Bottom", "Head and Shoulders", "Inverted Head and Shoulders", "Bullish Flag", "Bearish Flag", "Ascending Triangle", "Descending Triangle", "Symmetrical Triangle", "Rising Wedge", "Falling Wedge", "Cup and Handle"].includes(pattern)
              ? "classic"
              : "candlestick";
      const r = runBacktest(candles, {
        patternType: pattern,
        groups: pattern === "combined" ? undefined : [group],
        stopDistance: Number(stop) || 1,
        targetDistance: Number(target) || 2,
        maxBarsInTrade: Number(maxBars) || 48,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const inputCls =
    "mt-1 w-full rounded border border-[#1c2128] bg-[#0b0e11] px-2 py-1.5 text-sm text-white outline-none focus:border-[#3b82f6]";

  return (
    <main className="mx-auto max-w-[1200px] p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Backtest</h1>
        <Link href="/" className="rounded border border-[#1c2128] px-3 py-1.5 text-xs text-[#aab2c0] hover:text-white">
          ← Live chart
        </Link>
      </header>

      <div className="rounded-lg border border-[#1c2128] bg-[#10141a] p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <label className="text-[11px] text-[#8b93a1]">
            Granularity
            <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className={inputCls}>
              {["M1", "M5", "M15", "H1", "H4"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-[11px] text-[#8b93a1]">
            Pattern / signal
            <select value={pattern} onChange={(e) => setPattern(e.target.value)} className={inputCls}>
              {PATTERN_TYPES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-[#8b93a1]">
            Stop ($)
            <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" className={inputCls} />
          </label>
          <label className="text-[11px] text-[#8b93a1]">
            Target ($)
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" className={inputCls} />
          </label>
          <label className="text-[11px] text-[#8b93a1]">
            Max bars in trade
            <input value={maxBars} onChange={(e) => setMaxBars(e.target.value)} inputMode="numeric" className={inputCls} />
          </label>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="mt-4 rounded bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2563eb] disabled:opacity-50"
        >
          {running ? "Running…" : "Run backtest (last 2000 candles)"}
        </button>
        {error && <p className="mt-3 text-xs text-[#fca5a5]">{error}</p>}
      </div>

      {result && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Trades", value: String(result.totalTrades) },
              { label: "Win rate", value: `${result.winRatePct.toFixed(1)}%` },
              { label: "Avg R", value: `${result.avgR >= 0 ? "+" : ""}${result.avgR.toFixed(2)}R` },
              { label: "Max drawdown", value: `${result.maxDrawdownR.toFixed(2)}R` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-[#1c2128] bg-[#10141a] p-4">
                <div className="text-[11px] uppercase tracking-wide text-[#8b93a1]">{s.label}</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-white">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-[#1c2128] bg-[#10141a]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1c2128] text-left text-[#8b93a1]">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Exit</th>
                  <th className="px-3 py-2">Exit reason</th>
                  <th className="px-3 py-2 text-right">R multiple</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="border-b border-[#161b22] tabular-nums">
                    <td className="px-3 py-2 text-[#8b93a1]">{i + 1}</td>
                    <td
                      className="px-3 py-2 font-medium"
                      style={{ color: t.direction === "bullish" ? "#22c55e" : "#ef4444" }}
                    >
                      {t.direction.toUpperCase()}
                    </td>
                    <td className="px-3 py-2">{t.entry.toFixed(2)}</td>
                    <td className="px-3 py-2">{t.exit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-[#8b93a1]">{t.exitReason.toUpperCase()}</td>
                    <td
                      className="px-3 py-2 text-right font-semibold"
                      style={{ color: t.rMultiple > 0 ? "#22c55e" : "#ef4444" }}
                    >
                      {t.rMultiple >= 0 ? "+" : ""}
                      {t.rMultiple.toFixed(2)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.trades.length === 0 && (
              <p className="p-4 text-xs text-[#5b6472]">No trades generated for this configuration.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
