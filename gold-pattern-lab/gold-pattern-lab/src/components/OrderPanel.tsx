import { useEffect, useMemo, useState } from "react";

interface AccountInfo {
  mock: boolean;
  balance: number;
  currency: string;
  maxRiskPct: number;
  maxDailyLossPct: number;
}

interface PositionInfo {
  direction: "long" | "short";
  units: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPL: number;
}

export default function OrderPanel({ currentPrice }: { currentPrice: number | null }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [position, setPosition] = useState<PositionInfo | null>(null);
  const [units, setUnits] = useState("100");
  const [stop, setStop] = useState("1.50");
  const [target, setTarget] = useState("3.00");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const refresh = async (mid?: number) => {
    try {
      const [a, p] = await Promise.all([
        fetch("/api/account").then((r) => r.json()),
        fetch(`/api/position${mid ? `?mid=${mid}` : ""}`).then((r) => r.json()),
      ]);
      if (!a.error) setAccount(a);
      if (!p.error) setPosition(p.position);
      if (p.error && typeof p.error === "string") setBlocked(p.error);
    } catch {
      /* server starting */
    }
  };

  useEffect(() => {
    refresh(currentPrice ?? undefined);
    const t = setInterval(() => refresh(currentPrice ?? undefined), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  const u = Number(units) || 0;
  const s = Number(stop) || 0;
  const risk = Math.abs(u) * s;
  const riskPct = account ? (risk / account.balance) * 100 : 0;
  const riskTooBig = account ? risk > (account.maxRiskPct / 100) * account.balance : false;

  const disabledReason = useMemo(() => {
    if (blocked) return blocked;
    if (position) return "Close the open trade first (one trade at a time).";
    if (riskTooBig) return `Risk exceeds ${account?.maxRiskPct}% of balance.`;
    return null;
  }, [blocked, position, riskTooBig, account]);

  const placeOrder = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    setArmed(false);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          units: u,
          stopDistance: s,
          targetPrice: Number(target) || 0,
          currentPrice: currentPrice ?? 0,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessage({ kind: "ok", text: `Filled @ ${json.fillPrice ?? currentPrice} (DEMO)` });
        refresh(currentPrice ?? undefined);
      } else {
        setMessage({ kind: "err", text: json.error ?? "Order rejected" });
      }
    } catch (e) {
      setMessage({ kind: "err", text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async () => {
    if (!position) return;
    setBusy(true);
    try {
      const dir = position.direction;
      await fetch(`/api/position?direction=${dir}`, { method: "DELETE" });
      setMessage({ kind: "ok", text: "Position closed (market)." });
      refresh(currentPrice ?? undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#1c2128] bg-[#10141a] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b93a1]">
          Paper Order {account?.mock ? "· MOCK" : "· OANDA DEMO"}
        </h2>
        {account && (
          <span className="text-[11px] tabular-nums text-[#aab2c0]">
            Balance ${account.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {position ? (
        <div className="mt-3 rounded border border-[#1c2128] bg-[#0b0e11] p-3">
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-sm font-bold"
                style={{ color: position.direction === "long" ? "#22c55e" : "#ef4444" }}
              >
                {position.direction.toUpperCase()} {position.units} oz
              </span>
              {position.entryPrice != null && (
                <span className="ml-2 text-xs text-[#8b93a1]">
                  @ {position.entryPrice.toFixed(2)}
                </span>
              )}
            </div>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: position.unrealizedPL >= 0 ? "#22c55e" : "#ef4444" }}
            >
              {position.unrealizedPL >= 0 ? "+" : ""}
              ${position.unrealizedPL.toFixed(2)}
            </span>
          </div>
          {position.stopLoss != null && (
            <div className="mt-1 text-[11px] text-[#5b6472] tabular-nums">
              SL {position.stopLoss.toFixed(2)} · TP {position.takeProfit?.toFixed(2)}
            </div>
          )}
          <button
            onClick={closePosition}
            disabled={busy}
            className="mt-3 w-full rounded bg-[#ef4444] px-3 py-2 text-sm font-semibold text-white hover:bg-[#dc2626] disabled:opacity-50"
          >
            Close Position
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-[11px] text-[#8b93a1]">
            Units (oz, negative = short)
            <input
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded border border-[#1c2128] bg-[#0b0e11] px-2 py-1.5 text-sm tabular-nums text-white outline-none focus:border-[#3b82f6]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-[#8b93a1]">
              Stop distance ($)
              <input
                value={stop}
                onChange={(e) => setStop(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded border border-[#1c2128] bg-[#0b0e11] px-2 py-1.5 text-sm tabular-nums text-white outline-none focus:border-[#3b82f6]"
              />
            </label>
            <label className="block text-[11px] text-[#8b93a1]">
              Target distance ($)
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded border border-[#1c2128] bg-[#0b0e11] px-2 py-1.5 text-sm tabular-nums text-white outline-none focus:border-[#3b82f6]"
              />
            </label>
          </div>

          <div className="flex justify-between text-[11px] tabular-nums text-[#8b93a1]">
            <span>
              Risk ${risk.toFixed(2)} = {riskPct.toFixed(2)}% of balance
            </span>
            <span>Max {account?.maxRiskPct ?? 2}% / trade</span>
          </div>

          {disabledReason && (
            <p className="rounded border border-[#ef444433] bg-[#ef44440d] p-2 text-[11px] text-[#fca5a5]">
              {disabledReason}
            </p>
          )}

          <button
            onClick={placeOrder}
            disabled={busy || !!disabledReason || !currentPrice}
            className={`w-full rounded px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40 ${
              armed ? "bg-[#d97706] hover:bg-[#b45309]" : "bg-[#16a34a] hover:bg-[#15803d]"
            }`}
          >
            {armed ? "CONFIRM order — click again" : busy ? "Sending…" : "Place DEMO Market Order"}
          </button>
          <p className="text-[10px] leading-snug text-[#5b6472]">
            Stop-loss and take-profit are attached to every order. Two-step confirm required. No
            auto-trading. Daily max-loss {account?.maxDailyLossPct ?? 3}% disables ordering.
          </p>
        </div>
      )}

      {message && (
        <p
          className={`mt-3 rounded p-2 text-xs ${
            message.kind === "ok"
              ? "border border-[#22c55e44] bg-[#22c55e0d] text-[#86efac]"
              : "border border-[#ef444444] bg-[#ef44440d] text-[#fca5a5]"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
