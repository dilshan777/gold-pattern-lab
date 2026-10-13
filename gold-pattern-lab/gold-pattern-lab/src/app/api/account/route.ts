import { NextResponse } from "next/server";
import { fetchAccountSummary, isMockMode } from "@/lib/oanda";
import { getMockState } from "@/lib/mock";
import { RISK_CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Account info used by the risk gates + order panel header. */
export async function GET() {
  try {
    if (isMockMode()) {
      const s = getMockState();
      return NextResponse.json({
        mock: true,
        balance: s.balance,
        currency: "USD",
        maxRiskPct: RISK_CONFIG.maxRiskPerTradePct,
        maxDailyLossPct: RISK_CONFIG.maxDailyLossPct,
      });
    }
    const a = await fetchAccountSummary();
    return NextResponse.json({
      mock: false,
      balance: a.balance,
      nav: a.nav,
      currency: a.currency,
      maxRiskPct: RISK_CONFIG.maxRiskPerTradePct,
      maxDailyLossPct: RISK_CONFIG.maxDailyLossPct,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load account" },
      { status: 502 }
    );
  }
}
