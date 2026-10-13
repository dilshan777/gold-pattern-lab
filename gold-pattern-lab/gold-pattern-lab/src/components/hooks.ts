import { useEffect, useRef, useState, useCallback } from "react";
import type { Candle, Tick } from "@/lib/types";

export interface CandlesResponse {
  candles: Candle[];
  mock: boolean;
  instrument: string;
  granularity: string;
}

/** Fetch historical candles whenever the granularity changes. */
export function useCandles(granularity: string) {
  const [data, setData] = useState<CandlesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/candles?granularity=${granularity}&count=500`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [granularity]);

  return { data, error, loading };
}

/**
 * Live tick stream via SSE with auto-reconnect.
 * EventSource reconnects on its own; we add exponential backoff re-open
 * for the cases where the server ends the stream cleanly.
 */
export function usePriceStream(onTick: (t: Tick) => void) {
  const cb = useRef(onTick);
  cb.current = onTick;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      es = new EventSource("/api/stream");
      es.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "tick") {
            cb.current({
              time: msg.time,
              bid: msg.bid,
              ask: msg.ask,
              mid: msg.mid,
            });
          }
        } catch {
          // malformed frame, ignore
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (disposed) return;
        retry = Math.min(retry + 1, 5);
        timer = setTimeout(open, Math.min(1000 * 2 ** retry, 15000));
      };
    };
    open();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, []);

  return connected;
}
