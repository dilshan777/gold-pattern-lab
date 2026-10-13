import type { SignalResult } from "@/lib/signal";

export default function SignalPanel({ signal }: { signal: SignalResult | null }) {
  if (!signal) {
    return <div className="rounded-lg border border-[#1c2128] bg-[#10141a] p-4 text-sm text-[#8b93a1]">Waiting for data…</div>;
  }
  const pct = signal.scorePct;
  const color =
    signal.label === "BUY" ? "#22c55e" : signal.label === "SELL" ? "#ef4444" : "#f59e0b";

  const top = [...signal.breakdown]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 8);

  return (
    <div className="rounded-lg border border-[#1c2128] bg-[#10141a] p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b93a1]">
          Combined Signal
        </h2>
        <span className="text-[10px] text-[#5b6472]">weights in lib/config.ts</span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="text-3xl font-bold tabular-nums" style={{ color }}>
          {pct >= 50 ? `Bullish ${pct}%` : `Bearish ${100 - pct}%`}
        </div>
        <div
          className="rounded px-3 py-1 text-sm font-bold tracking-widest"
          style={{ backgroundColor: color + "22", color, border: `1px solid ${color}55` }}
        >
          {signal.label}
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded bg-[#1c2128]">
        <div
          className="h-full rounded transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg,#ef4444,#f59e0b 50%,#22c55e)",
          }}
        />
      </div>

      <div className="mt-4 space-y-1">
        {top.map((b, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-[#aab2c0]">{b.source}</span>
            <span style={{ color: b.contribution > 0 ? "#22c55e" : b.contribution < 0 ? "#ef4444" : "#8b93a1" }}>
              {b.contribution > 0 ? "+" : ""}
              {b.contribution.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded border border-[#f59e0b33] bg-[#f59e0b0d] p-2 text-[11px] leading-snug text-[#fbbf24]">
        This is a score, not a prediction. It only reflects recent pattern votes and indicator
        readings — past performance does not guarantee future results.
      </p>
    </div>
  );
}
