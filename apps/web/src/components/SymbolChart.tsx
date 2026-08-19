import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  IChartApi,
  ISeriesMarkersPluginApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
  Time,
  UTCTimestamp
} from "lightweight-charts";
import { SymbolAnalysisResponse } from "../types";

interface SymbolChartProps {
  analysis?: SymbolAnalysisResponse;
  backtestTrades?: Array<{
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
  }>;
}

function toUtcTimestamp(timestamp: string): UTCTimestamp {
  return Math.floor(new Date(timestamp).getTime() / 1000) as UTCTimestamp;
}

function toUtcTimestampOrNull(timestamp: string): UTCTimestamp | null {
  const value = Math.floor(new Date(timestamp).getTime() / 1000);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value as UTCTimestamp;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMarkerPrice(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function projectLineValueAt(line: SymbolAnalysisResponse["trendlines"][number], timestamp: string) {
  const x1 = new Date(line.startTime).getTime();
  const x = new Date(timestamp).getTime();
  return line.startPrice + line.slope * (x - x1);
}

function trendlineColor(line: SymbolAnalysisResponse["trendlines"][number]) {
  if (line.kind === "SAFETY_LOSS") {
    return "#fbbf24";
  }

  if (line.direction === "BULLISH") {
    if (line.kind === "ACTION") {
      return "#1ed67c";
    }
    if (line.kind === "SAFETY") {
      return "#6ee7a6";
    }
    return "#0ea565";
  }
  if (line.direction === "BEARISH") {
    if (line.kind === "ACTION") {
      return "#ff5a7d";
    }
    if (line.kind === "SAFETY") {
      return "#ff8aa0";
    }
    return "#e04163";
  }
  return "#c3d0e5";
}

function trendlineStyle(line: SymbolAnalysisResponse["trendlines"][number]) {
  if (line.kind === "CANDIDATE") {
    return LineStyle.Dashed;
  }
  if (line.kind === "SAFETY_LOSS") {
    return LineStyle.Dotted;
  }
  return LineStyle.Solid;
}

export function SymbolChart({ analysis, backtestTrades }: SymbolChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const cleanupSeriesRef = useRef<
    Array<ISeriesApi<"Candlestick"> | ISeriesApi<"Histogram"> | ISeriesApi<"Line">>
  >([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1f2c40" },
        textColor: "#d9e6fb"
      },
      width: containerRef.current.clientWidth,
      height: Math.max(320, containerRef.current.clientHeight),
      grid: {
        vertLines: { color: "#344863" },
        horzLines: { color: "#344863" }
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#405672" },
      timeScale: { borderColor: "#405672", timeVisible: true }
    });

    chartRef.current = chart;

    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: Math.max(320, containerRef.current.clientHeight)
        });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!analysis || !chart) {
      return;
    }

    try {
      cleanupSeriesRef.current.forEach((series) => chart.removeSeries(series));
      cleanupSeriesRef.current = [];
      markersPluginRef.current?.detach();
      markersPluginRef.current = null;

      const candleData = analysis.bars
        .map((bar) => {
          const time = toUtcTimestampOrNull(bar.timestamp);
          if (!time || !isFiniteNumber(bar.open) || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low) || !isFiniteNumber(bar.close)) {
            return null;
          }
          return {
            time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close
          };
        })
        .filter((bar): bar is NonNullable<typeof bar> => bar !== null);

      if (candleData.length === 0) {
        return;
      }

      const candles = chart.addSeries(CandlestickSeries, {
        upColor: "#1ed67c",
        downColor: "#ff5a7d",
        borderVisible: false,
        wickUpColor: "#1ed67c",
        wickDownColor: "#ff5a7d"
      });
      candles.setData(candleData);
      cleanupSeriesRef.current.push(candles);

      const volume = chart.addSeries(HistogramSeries, {
        color: "#6b8fcf",
        priceFormat: { type: "volume" },
        priceScaleId: "volume"
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: {
          top: 0.78,
          bottom: 0
        }
      });
      volume.setData(
        analysis.bars
          .map((bar) => {
            const time = toUtcTimestampOrNull(bar.timestamp);
            if (!time || !isFiniteNumber(bar.volume) || !isFiniteNumber(bar.open) || !isFiniteNumber(bar.close)) {
              return null;
            }
            return {
              time,
              value: bar.volume,
              color: bar.close >= bar.open ? "#1ed67c88" : "#ff5a7d88"
            };
          })
          .filter((bar): bar is NonNullable<typeof bar> => bar !== null)
      );
      cleanupSeriesRef.current.push(volume);

      for (const line of analysis.trendlines) {
        if (!isFiniteNumber(line.startPrice) || !isFiniteNumber(line.endPrice) || !isFiniteNumber(line.slope)) {
          continue;
        }
        const latestTimestamp = analysis.bars[analysis.bars.length - 1]?.timestamp ?? line.endTime;
        const renderEndTime =
          new Date(latestTimestamp).getTime() > new Date(line.endTime).getTime() ? latestTimestamp : line.endTime;
        const renderEndValue = projectLineValueAt(line, renderEndTime);
        const startTime = toUtcTimestampOrNull(line.startTime);
        const endTime = toUtcTimestampOrNull(renderEndTime);
        if (!startTime || !endTime || !isFiniteNumber(renderEndValue)) {
          continue;
        }

        const series = chart.addSeries(LineSeries, {
          color: trendlineColor(line),
          lineWidth: line.kind === "CANDIDATE" ? 1 : line.kind === "SAFETY_LOSS" ? 2 : 3,
          lineStyle: trendlineStyle(line)
        });
        series.setData([
          { time: startTime, value: line.startPrice },
          { time: endTime, value: renderEndValue }
        ]);
        cleanupSeriesRef.current.push(series);
      }

      const tradeMarkers = (backtestTrades ?? [])
        .flatMap((trade) => {
          const entryTime = toUtcTimestampOrNull(trade.entryTime);
          const exitTime = toUtcTimestampOrNull(trade.exitTime);
          const markers = [];
          if (entryTime) {
            markers.push({
              time: entryTime,
              position: "belowBar" as const,
              color: "#1ed67c",
              shape: "arrowUp" as const,
              text: `Entry ${formatMarkerPrice(trade.entryPrice)}`
            });
          }
          if (exitTime) {
            markers.push({
              time: exitTime,
              position: "aboveBar" as const,
              color: "#ff5a7d",
              shape: "arrowDown" as const,
              text: `Exit ${formatMarkerPrice(trade.exitPrice)}`
            });
          }
          return markers;
        });

      const lineMarkers = analysis.trendlines
        .filter((line) => line.kind !== "CANDIDATE")
        .map((line) => {
          const time = toUtcTimestampOrNull(line.startTime);
          if (!time) {
            return null;
          }
          return {
            time,
            position: line.direction === "BEARISH" ? ("aboveBar" as const) : ("belowBar" as const),
            color: trendlineColor(line),
            shape: "circle" as const,
            text: line.kind
          };
        })
        .filter((marker): marker is NonNullable<typeof marker> => marker !== null);

      markersPluginRef.current = createSeriesMarkers(candles, [...tradeMarkers, ...lineMarkers]);
      chart.timeScale().fitContent();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Chart render failed:", error);
    }
  }, [analysis, backtestTrades]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 320 }} />;
}
