import { NextRequest, NextResponse } from "next/server";
import {
  fetchAccountSummary,
  fetchOpenPositions,
  fetchTodayClosedPL,
  isMockMode,
  placeMarketOrder,
} from "@/lib/oanda";
import { getMockState, mockPlaceOrder, mockProcessPosition } from "@/lib/mock";
import { RISK_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Place a DEMO market order with REQUIRED stop-loss and take-profit.
 * Body: { units, stopDistance, targetDistance, currentPrice? }
 *
 * Risk rules:
 *  - risk (= stopDistance * |units|, USD for XAU/USD) must be <= 2% of balance
 *  - only one open trade at a time
 *  - daily max-loss disables ordering
 * There is intentionally NO auto-trading here.
 */
export async function POST(req: NextRequest) {
  let body: {
    units?: number;
    stopDistance?: number;
    targetPrice?: number;
    currentPrice?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const units = Number(body.units);
  const stopDistance = Number(body.stopDistance);
  const targetDistance = Number(body.targetPrice);
  const currentPrice = Number(body.currentPrice ?? 0);

  if (!Number.isFinite(units) || units === 0) {
    return NextResponse.json({ ok: false, error: "units must be a non-zero number" }, { status: 400 });
  }
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    return NextResponse.json({ ok: false, error: "stopDistance > 0 is required" }, { status: 400 });
  }
  if (!Number.isFinite(targetDistance) || targetDistance <= 0) {
    return NextResponse.json({ ok: false, error: "targetPrice > 0 is required" }, { status: 400 });
  }

  try {
    // ---- MOCK branch: simulated fill against in-memory state ----
    if (isMockMode()) {
      const state = getMockState();
      if (state.position) {
        return NextResponse.json({ ok: false, error: "Only one open trade at a time." }, { status: 403 });
      }
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        return NextResponse.json({ ok: false, error: "currentPrice is required in mock mode" }, { status: 400 });
      }
      const risk = stopDistance * Math.abs(units);
      if (risk > (RISK_CONFIG.maxRiskPerTradePct / 100) * state.balance) {
        return NextResponse.json(
          { ok: false, error: `Risk $${risk.toFixed(2)} exceeds ${RISK_CONFIG.maxRiskPerTradePct}% of balance $${state.balance.toFixed(2)}` },
          { status: 403 }
        );
      }
      const res = mockPlaceOrder({ units, stopDistance, targetDistance, currentPrice });
      if (!res.ok) return NextResponse.json(res, { status: 403 });
      mockProcessPosition(currentPrice);
      return NextResponse.json({ ok: true, mock: true, fillPrice: currentPrice });
    }

    // ---- REAL OANDA practice branch ----
    const [account, positions, todayPL] = await Promise.all([
      fetchAccountSummary(),
      fetchOpenPositions(),
      fetchTodayClosedPL(),
    ]);

    // Daily max-loss gate
    const dailyLimit = (RISK_CONFIG.maxDailyLossPct / 100) * account.balance;
    if (todayPL <= -dailyLimit) {
      return NextResponse.json(
        { ok: false, error: `Daily max-loss (${RISK_CONFIG.maxDailyLossPct}% of balance) reached. Ordering disabled for today.` },
        { status: 403 }
      );
    }

    // One open trade at a time
    const xauPositions = positions.filter((p) => p.instrument === "XAU_USD");
    const hasOpen = xauPositions.some((p) => p.longUnits !== 0 || p.shortUnits !== 0);
    if (RISK_CONFIG.oneTradeAtATime && hasOpen) {
      return NextResponse.json({ ok: false, error: "Only one open trade at a time." }, { status: 403 });
    }

    // Risk per trade: for XAU/USD, 1 unit = 1 oz, so $risk = stopDistance * |units|
    const risk = stopDistance * Math.abs(units);
    const maxRisk = (RISK_CONFIG.maxRiskPerTradePct / 100) * account.balance;
    if (risk > maxRisk) {
      return NextResponse.json(
        {
          ok: false,
          error: `Risk $${risk.toFixed(2)} exceeds ${RISK_CONFIG.maxRiskPerTradePct}% of balance $${account.balance.toFixed(2)} (max $${maxRisk.toFixed(2)})`,
        },
        { status: 403 }
      );
    }

    const result = await placeMarketOrder({ units, stopDistance, targetDistance });
    return NextResponse.json({ ...result, mock: false });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Order failed" },
      { status: 502 }
    );
  }
}
