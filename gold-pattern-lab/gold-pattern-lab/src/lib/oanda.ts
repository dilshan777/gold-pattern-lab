// Server-only OANDA v20 client. NEVER import from a "use client" component.
import "server-only";
import { INSTRUMENT } from "./config";
import type { Candle } from "./types";

export function isMockMode(): boolean {
  return (process.env.MOCK_DATA ?? "true") !== "false";
}

function baseUrl(): string {
  return process.env.OANDA_BASE_URL ?? "https://api-fxpractice.oanda.com";
}
function streamUrl(): string {
  return process.env.OANDA_STREAM_URL ?? "https://stream-fxpractice.oanda.com";
}
function apiKey(): string {
  const k = process.env.OANDA_API_KEY;
  if (!k) throw new Error("OANDA_API_KEY is not set (or enable MOCK_DATA=true)");
  return k;
}
function accountId(): string {
  const id = process.env.OANDA_ACCOUNT_ID;
  if (!id) throw new Error("OANDA_ACCOUNT_ID is not set (or enable MOCK_DATA=true)");
  return id;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

async function oandaFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OANDA ${res.status} for ${path}: ${text.slice(0, 300)}`);
  }
  return res;
}

// ---- Candles --------------------------------------------------------------

interface OandaCandle {
  complete: boolean;
  time: string; // RFC3339
  volume: number;
  mid: { o: string; h: string; l: string; c: string };
}

export async function fetchCandles(granularity: string, count = 500): Promise<Candle[]> {
  const path =
    `/v3/instruments/${INSTRUMENT}/candles` +
    `?price=M&granularity=${encodeURIComponent(granularity)}&count=${count}`;
  const res = await oandaFetch(path);
  const json = await res.json();
  const candles: OandaCandle[] = json.candles ?? [];
  return candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: +c.mid.o,
      high: +c.mid.h,
      low: +c.mid.l,
      close: +c.mid.c,
    }));
}

// ---- Account / risk --------------------------------------------------------

export interface AccountSummary {
  balance: number;
  nav: number;
  currency: string;
}

export async function fetchAccountSummary(): Promise<AccountSummary> {
  const res = await oandaFetch(`/v3/accounts/${accountId()}/summary`);
  const json = await res.json();
  const a = json.account;
  return { balance: +a.balance, nav: +a.NAV, currency: a.currency };
}

export interface OpenPosition {
  instrument: string;
  longUnits: number;
  shortUnits: number;
  unrealizedPL: number;
  averagePrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export async function fetchOpenPositions(): Promise<OpenPosition[]> {
  const res = await oandaFetch(`/v3/accounts/${accountId()}/openPositions`);
  const json = await res.json();
  return (json.positions ?? []).map((p: Record<string, unknown>) => ({
    instrument: p.instrument as string,
    longUnits: +(p.long as { units?: string }).units ?? 0,
    shortUnits: +(p.short as { units?: string }).units ?? 0,
    unrealizedPL: +p.unrealizedPL,
  }));
}

/** Sum of realized P/L of trades closed today (server-local date). */
export async function fetchTodayClosedPL(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const res = await oandaFetch(
    `/v3/accounts/${accountId()}/trades?state=CLOSED&count=100`
  );
  const json = await res.json();
  const trades: { closeTime: string; realizedPL: string }[] = json.trades ?? [];
  return trades
    .filter((t) => new Date(t.closeTime) >= startOfDay)
    .reduce((s, t) => s + +t.realizedPL, 0);
}

// ---- Orders ----------------------------------------------------------------

export interface OrderRequest {
  units: number; // signed: positive = long
  stopDistance: number; // price distance
  targetDistance: number; // price distance
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  fillPrice?: number;
  error?: string;
}

export async function placeMarketOrder(req: OrderRequest): Promise<OrderResult> {
  const body = {
    order: {
      type: "MARKET",
      instrument: INSTRUMENT,
      units: String(req.units),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
      stopLossOnFill: { distance: req.stopDistance.toFixed(3) },
      takeProfitOnFill: { distance: req.targetDistance.toFixed(3) },
    },
  };
  const res = await oandaFetch(`/v3/accounts/${accountId()}/orders`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const fill = json.orderFillTransaction;
  if (fill) {
    return { ok: true, orderId: fill.id, fillPrice: +fill.price };
  }
  const rej = json.orderRejectTransaction;
  return { ok: false, error: rej?.reason ?? "Order rejected (no fill)" };
}

export async function closePosition(direction: "long" | "short"): Promise<void> {
  const body = direction === "long" ? { longUnits: "ALL" } : { shortUnits: "ALL" };
  await oandaFetch(`/v3/accounts/${accountId()}/positions/${INSTRUMENT}/close`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ---- Streaming prices (server-side, forwarded over SSE) ---------------------

export async function* streamPrices(): AsyncGenerator<{ time: number; bid: number; ask: number; mid: number }> {
  const res = await fetch(
    `${streamUrl()}/v3/accounts/${accountId()}/pricing/stream?instruments=${INSTRUMENT}`,
    { headers: { Authorization: `Bearer ${apiKey()}` } }
  );
  if (!res.ok || !res.body) {
    throw new Error(`OANDA stream failed to start: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === "PRICE") {
          const bid = +msg.bids?.[0]?.price;
          const ask = +msg.asks?.[0]?.price;
          if (Number.isFinite(bid) && Number.isFinite(ask)) {
            yield {
              time: Math.floor(new Date(msg.time).getTime() / 1000),
              bid, ask,
              mid: +(((bid + ask) / 2).toFixed(3)),
            };
          }
        }
      } catch {
        // ignore heartbeat / malformed lines
      }
    }
  }
}
