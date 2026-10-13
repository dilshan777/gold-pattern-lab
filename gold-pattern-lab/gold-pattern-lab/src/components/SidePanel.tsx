import type { Candle, PatternSignal } from "@/lib/types";

export default function SidePanel({
  patterns,
  candles,
}: {
  patterns: PatternSignal[];
  candles: Candle[];
}) {
  const latest = [...patterns]
    .sort((a, b) => b.endIndex - a.endIndex)
    .slice(0, 10);

  const dirColor = (d: PatternSignal["direction"]) =>
    d === "bullish" ? "#22c55e" : d === "bearish" ? "#ef4444" : "#f59e0b";

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#1c2128] bg-[#10141a]">
      <div className="border-b border-[#1c2128] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b93a1]">
          Latest Patterns
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {latest.length === 0 && (
          <p className="p-4 text-xs text-[#5b6472]">No patterns detected yet.</p>
        )}
        {latest.map((p, i) => {
          const t = candles[p.endIndex];
          const timeStr = t
            ? new Date(t.time * 1000).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          return (
            <div
              key={i}
              className="flex items-start justify-between gap-2 border-b border-[#161b22] px-4 py-2.5"
            >
              <div>
                <div className="text-sm font-medium" style={{ color: dirColor(p.direction) }}>
                  {p.type}
                </div>
                <div className="text-[11px] text-[#5b6472]">
                  {p.group} · conf {(p.confidence * 100).toFixed(0)}%
                  {p.detail ? ` · ${p.detail}` : ""}
                </div>
              </div>
              <div className="whitespace-nowrap text-[11px] tabular-nums text-[#8b93a1]">
                {timeStr}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
