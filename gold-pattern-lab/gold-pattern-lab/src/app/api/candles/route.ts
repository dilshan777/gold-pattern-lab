import { NextRequest, NextResponse } from "next/server";
import { fetchCandles, isMockMode } from "@/lib/oanda";
import { generateMockCandles } from "@/lib/mock";
import { GRANULARITIES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const granularity =
    req.nextUrl.searchParams.get("granularity") ?? "M5";
  const count = Math.min(
    parseInt(req.nextUrl.searchParams.get("count") ?? "500", 10) || 500,
    5000
  );

  if (!GRANULARITIES.some((g) => g.name === granularity)) {
    return NextResponse.json({ error: "Unsupported granularity" }, { status: 400 });
  }

  try {
    const candles = isMockMode()
      ? generateMockCandles(granularity, count)
      : await fetchCandles(granularity, count);
    return NextResponse.json(
      { candles, mock: isMockMode(), instrument: "XAU_USD", granularity },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load candles" },
      { status: 502 }
    );
  }
}
