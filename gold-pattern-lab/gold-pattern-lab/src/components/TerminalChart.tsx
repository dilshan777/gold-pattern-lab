import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";
import type { Candle, PatternSignal } from "@/lib/types";
import type { IndicatorSeries } from "@/lib/indicators";

export interface ChartToggles {
  candlePatterns: boolean;
  structure: boolean;
  classic: boolean;
  ema: boolean;
  bb: boolean;
  rsi: boolean;
  macd: boolean;
}

const COLORS = {
  up: "#26a69a",
  down: "#ef5350",
  bull: "#22c55e",
  bear: "#ef4444",
  neutral: "#f59e0b",
  ema20: "#3b82f6",
  ema50: "#a855f7",
  ema200: "#f97316",
  bb: "#64748b",
  grid: "#1c2128",
  text: "#8b93a1",
};

interface PositionLines {
  entry: number;
  stopLoss?: number;
  takeProfit?: number;
  direction: "long" | "short";
}

interface Props {
  closed: Candle[];
  forming: Candle | null;
  markers: PatternSignal[];
  toggles: ChartToggles;
  indicators: IndicatorSeries | null;
  positionLines?: PositionLines | null;
}

function lineData(candles: Candle[], values: (number | null)[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v != null) out.push({ time: candles[i].time as UTCTimestamp, value: v });
  }
  return out;
}

export default function TerminalChart({
  closed,
  forming,
  markers,
  toggles,
  indicators,
  positionLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const auxRef = useRef<ISeriesApi<"Line">[]>([]);
  const posLinesRef = useRef<{ id: string; remove: () => void }[]>([]);
  const syncedRef = useRef(false);

  const allCandles = useMemo(
    () => (forming ? [...closed, forming] : closed),
    [closed, forming]
  );

  // ---- create charts once ----
  useEffect(() => {
    if (!containerRef.current) return;
    const common = (height: number) => ({
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e11" },
        textColor: COLORS.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: COLORS.grid,
      },
      rightPriceScale: { borderColor: COLORS.grid },
      height,
      autoSize: false,
    });

    const chart = createChart(containerRef.current, common(420));
    const series = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);

    let rsiChart: IChartApi | null = null;
    let macdChart: IChartApi | null = null;
    if (rsiRef.current) {
      rsiChart = createChart(rsiRef.current, { ...common(110), layout: { ...common(110).layout } });
      rsiChartRef.current = rsiChart;
    }
    if (macdRef.current) {
      macdChart = createChart(macdRef.current, common(110));
      macdChartRef.current = macdChart;
    }

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        if (e.target === containerRef.current) chart.applyOptions({ width: w, height: 420 });
        if (e.target === rsiRef.current) rsiChart?.applyOptions({ width: w, height: 110 });
        if (e.target === macdRef.current) macdChart?.applyOptions({ width: w, height: 110 });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    if (rsiRef.current) ro.observe(rsiRef.current);
    if (macdRef.current) ro.observe(macdRef.current);

    // keep panes in sync with the main chart
    if (rsiChart && macdChart && !syncedRef.current) {
      syncedRef.current = true;
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        rsiChart!.timeScale().setVisibleLogicalRange(range);
        macdChart!.timeScale().setVisibleLogicalRange(range);
      });
    }

    return () => {
      ro.disconnect();
      chart.remove();
      rsiChart?.remove();
      macdChart?.remove();
      chartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      auxRef.current = [];
      syncedRef.current = false;
    };
  }, []);

  // ---- update candle data ----
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (allCandles.length > 1) {
      series.setData(
        allCandles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      chartRef.current?.timeScale().fitContent();
    }
  }, [allCandles]);

  // ---- overlay lines (EMA / Bollinger) ----
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !indicators) return;

    for (const s of auxRef.current) {
      try { chart.removeSeries(s); } catch { /* noop */ }
    }
    auxRef.current = [];
    if (!toggles.ema && !toggles.bb) return;

    const closedData = closed;
    const add = (values: (number | null)[], color: string, width: 1 | 2 = 1) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(lineData(closedData, values));
      auxRef.current.push(s);
    };
    if (toggles.ema) {
      add(indicators.ema20, COLORS.ema20);
      add(indicators.ema50, COLORS.ema50);
      add(indicators.ema200, COLORS.ema200, 2);
    }
    if (toggles.bb) {
      add(indicators.bb.upper, COLORS.bb);
      add(indicators.bb.middle, COLORS.bb);
      add(indicators.bb.lower, COLORS.bb);
    }
  }, [indicators, toggles.ema, toggles.bb, closed]);

  // ---- indicator panes (RSI / MACD) ----
  useEffect(() => {
    const rsiChart = rsiChartRef.current;
    if (!rsiChart || !indicators || !toggles.rsi) return;
    let s1: ISeriesApi<"Line"> | null = null;
    let s70: ISeriesApi<"Line"> | null = null;
    let s30: ISeriesApi<"Line"> | null = null;
    const data = lineData(closed, indicators.rsi14);
    if (data.length > 1) {
      s1 = rsiChart.addSeries(LineSeries, { color: "#eab308", lineWidth: 2 });
      s1.setData(data);
      const constLine = (v: number) =>
        closed
          .filter((_, i) => indicators.rsi14[i] != null)
          .map((c) => ({ time: c.time as UTCTimestamp, value: v }));
      s70 = rsiChart.addSeries(LineSeries, { color: "#7f1d1d", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      s70.setData(constLine(70));
      s30 = rsiChart.addSeries(LineSeries, { color: "#064e3b", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      s30.setData(constLine(30));
    }
    return () => {
      for (const s of [s1, s70, s30]) if (s) { try { rsiChart.removeSeries(s); } catch { /* noop */ } }
    };
  }, [indicators, toggles.rsi, closed]);

  useEffect(() => {
    const macdChart = macdChartRef.current;
    if (!macdChart || !indicators || !toggles.macd) return;
    const dMacd = lineData(closed, indicators.macd.macd);
    const dSig = lineData(closed, indicators.macd.signal);
    const dHist = closed
      .map((c, i) => ({ c, v: indicators.macd.histogram[i] }))
      .filter((x) => x.v != null)
      .map((x) => ({ time: x.c.time as UTCTimestamp, value: x.v!, color: x.v! >= 0 ? COLORS.bull : COLORS.bear }));
    if (dMacd.length < 2) return;
    const s1 = macdChart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 2 });
    const s2 = macdChart.addSeries(LineSeries, { color: "#f97316", lineWidth: 1 });
    const h = macdChart.addSeries(HistogramSeries, {});
    s1.setData(dMacd);
    s2.setData(dSig);
    h.setData(dHist);
    return () => {
      for (const s of [s1, s2, h]) { try { macdChart.removeSeries(s); } catch { /* noop */ } }
    };
  }, [indicators, toggles.macd, closed]);

  // ---- pattern markers ----
  useEffect(() => {
    const series = seriesRef.current;
    const m = markersRef.current;
    if (!series || !m) return;
    m.setMarkers(
      markers
        .filter((p) => p.endIndex < closed.length)
        .map((p) => {
          const time = closed[p.endIndex].time as UTCTimestamp;
          if (p.direction === "bullish") {
            return {
              time,
              position: "belowBar" as const,
              color: COLORS.bull,
              shape: "arrowUp" as const,
              text: p.type,
            };
          }
          if (p.direction === "bearish") {
            return {
              time,
              position: "aboveBar" as const,
              color: COLORS.bear,
              shape: "arrowDown" as const,
              text: p.type,
            };
          }
          return {
            time,
            position: "belowBar" as const,
            color: COLORS.neutral,
            shape: "circle" as const,
            text: p.type,
          };
        })
    );
  }, [markers, closed]);

  // ---- open position price lines ----
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of posLinesRef.current) l.remove();
    posLinesRef.current = [];
    if (!positionLines) return;
    const mk = (price: number, color: string, title: string) => {
      const line = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
      posLinesRef.current.push({ id: title, remove: () => series.removePriceLine(line) });
    };
    mk(positionLines.entry, "#e5e7eb", "ENTRY");
    if (positionLines.stopLoss != null) mk(positionLines.stopLoss, COLORS.bear, "SL");
    if (positionLines.takeProfit != null) mk(positionLines.takeProfit, COLORS.bull, "TP");
  }, [positionLines]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full rounded-lg border border-[#1c2128] overflow-hidden" />
      {toggles.rsi && (
        <div className="mt-1">
          <div className="text-[10px] uppercase tracking-wide text-[#8b93a1] px-1">RSI 14</div>
          <div ref={rsiRef} className="w-full rounded-lg border border-[#1c2128] overflow-hidden" />
        </div>
      )}
      {toggles.macd && (
        <div className="mt-1">
          <div className="text-[10px] uppercase tracking-wide text-[#8b93a1] px-1">MACD 12/26/9</div>
          <div ref={macdRef} className="w-full rounded-lg border border-[#1c2128] overflow-hidden" />
        </div>
      )}
    </div>
  );
}
