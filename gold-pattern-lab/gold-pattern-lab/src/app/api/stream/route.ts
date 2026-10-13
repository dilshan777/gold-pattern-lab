import { isMockMode, streamPrices } from "@/lib/oanda";
import { generateMockCandles, nextMockTick } from "@/lib/mock";
import type { Tick } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events endpoint. Streams live ticks:
 *   data: {"type":"tick","time":...,"bid":...,"ask":...,"mid":...}
 * The browser (EventSource) reconnects automatically when the connection
 * drops; we also emit a ": ping" comment every 15s to keep proxies happy.
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let last = Date.now();
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch { /* closed */ }
      }, 15_000);

      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* closed */ }
      };

      try {
        if (isMockMode()) {
          const seed = generateMockCandles("M1", 1)[0];
          let tick: Tick = {
            time: Math.floor(Date.now() / 1000),
            bid: seed.close - 0.1,
            ask: seed.close + 0.1,
            mid: seed.close,
          };
          while (true) {
            tick = nextMockTick(tick, "M1");
            send({ type: "tick", ...tick });
            await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
          }
        } else {
          for await (const t of streamPrices()) {
            send({ type: "tick", ...t });
            last = Date.now();
          }
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "stream error" });
      } finally {
        clearInterval(ping);
        try { controller.close(); } catch { /* already closed */ }
      }
      void last;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
