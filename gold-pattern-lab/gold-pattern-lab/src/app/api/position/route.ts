import { NextRequest, NextResponse } from "next/server";
import { closePosition, fetchOpenPositions, isMockMode } from "@/lib/oanda";
import { getMockState, mockProcessPosition } from "@/lib/mock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: open position + live P/L. DELETE: close the open position. */
export async function GET(req: NextRequest) {
  const mid = Number(req.nextUrl.searchParams.get("mid") ?? 0);
  try {
    if (isMockMode()) {
      if (Number.isFinite(mid) && mid > 0) mockProcessPosition(mid);
      const p = getMockState().position;
      const state = getMockState();
      return NextResponse.json({
        mock: true,
        balance: state.balance,
        position: p
          ? {
              direction: p.direction,
              units: p.units,
              entryPrice: p.entryPrice,
              stopLoss: p.stopLoss,
              takeProfit: p.takeProfit,
              unrealizedPL:
                p.direction === "long"
                  ? (mid - p.entryPrice) * p.units
                  : (p.entryPrice - mid) * p.units,
              openTime: p.openTime,
            }
          : null,
      });
    }
    const positions = await fetchOpenPositions();
    const xau = positions.find((p) => p.instrument === "XAU_USD");
    const hasOpen = !!xau && (xau.longUnits !== 0 || xau.shortUnits !== 0);
    return NextResponse.json({
      mock: false,
      position: hasOpen
        ? {
            direction: xau!.longUnits > 0 ? ("long" as const) : ("short" as const),
            units: Math.abs(xau!.longUnits > 0 ? xau!.longUnits : xau!.shortUnits),
            unrealizedPL: xau!.unrealizedPL,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load position" },
      { status: 502 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const direction = req.nextUrl.searchParams.get("direction") === "short" ? "short" : "long";
  try {
    if (!isMockMode()) {
      await closePosition(direction);
    } else {
      // mock: close at market (P/L handled on next poll); here we just clear it
      const state = getMockState();
      state.position = null;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Close failed" },
      { status: 502 }
    );
  }
}
