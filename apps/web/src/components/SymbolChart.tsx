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
import { OhlcvBar } from "@trader/shared";
import { SymbolAnalysisResponse } from "../types";

interface SymbolChartProps {
  analysis?: SymbolAnalysisResponse;
  bars?: OhlcvBar[];
  backtestTrades?: Array<{
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
  }>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toUtcTimestampOrNull(timestamp: string): UTCTimestamp | null {
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function projectLineValueAt(line: SymbolAnalysisResponse["trendlines"][number], timestamp: string) {
  const x1 = new Date(line.startTime).getTime();
  const x = new Date(timestamp).getTime();
  const value = line.startPrice + line.slope * (x - x1);
  return Number.isFinite(value) ? value : null;
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

export function SymbolChart({ analysis, bars, backtestTrades }: SymbolChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const cleanupSeriesRef = useRef<
    Array<ISeriesApi<"Candlestick"> | ISeriesApi<"Histogram"> | ISeriesApi<"Line">>
  >([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const clearChartSeries = (chart: IChartApi) => {
    for (const series of cleanupSeriesRef.current) {
      try {
        chart.removeSeries(series);
      } catch (error) {
        console.warn("Failed removing stale chart series", error);
      }
    }
    cleanupSeriesRef.current = [];
    if (markersPluginRef.current) {
      try {
        markersPluginRef.current.detach();
      } catch (error) {
        console.warn("Failed detaching stale markers plugin", error);
      }
      markersPluginRef.current = null;
    }
  };

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
      clearChartSeries(chart);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    try {
      const sourceBars = bars ?? analysis?.bars ?? [];

      clearChartSeries(chart);

      if (sourceBars.length === 0) {
        return;
      }

      const candleMap = new Map<number, { time: UTCTimestamp; open: number; high: number; low: number; close: number }>();
      for (const bar of sourceBars) {
        const time = toUtcTimestampOrNull(bar.timestamp);
        if (
          !time ||
          !isFiniteNumber(bar.open) ||
          !isFiniteNumber(bar.high) ||
          !isFiniteNumber(bar.low) ||
          !isFiniteNumber(bar.close)
        ) {
          continue;
        }
        candleMap.set(time, {
          time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close
        });
      }
      const candleData = Array.from(candleMap.values()).sort((a, b) => Number(a.time) - Number(b.time));

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
      const volumeMap = new Map<number, { time: UTCTimestamp; value: number; color: string }>();
      for (const bar of sourceBars) {
        const time = toUtcTimestampOrNull(bar.timestamp);
        if (!time || !isFiniteNumber(bar.volume) || !isFiniteNumber(bar.open) || !isFiniteNumber(bar.close)) {
          continue;
        }
        volumeMap.set(time, {
          time,
          value: bar.volume,
          color: bar.close >= bar.open ? "#1ed67c88" : "#ff5a7d88"
        });
      }
      volume.setData(Array.from(volumeMap.values()).sort((a, b) => Number(a.time) - Number(b.time)));
      cleanupSeriesRef.current.push(volume);

      if (analysis) {
        for (const line of analysis.trendlines) {
          const startTime = toUtcTimestampOrNull(line.startTime);
          const lineEndTime = toUtcTimestampOrNull(line.endTime);
          if (!startTime || !lineEndTime || !isFiniteNumber(line.startPrice) || !isFiniteNumber(line.endPrice)) {
            continue;
          }
          if (Number(lineEndTime) <= Number(startTime)) {
            continue;
          }

          const latestTimestamp = sourceBars[sourceBars.length - 1]?.timestamp ?? line.endTime;
          const renderEndTime =
            new Date(latestTimestamp).getTime() > new Date(line.endTime).getTime() ? latestTimestamp : line.endTime;
          const renderEndUtc = toUtcTimestampOrNull(renderEndTime);
          const series = chart.addSeries(LineSeries, {
            color: trendlineColor(line),
            lineWidth: line.kind === "CANDIDATE" ? 1 : line.kind === "SAFETY_LOSS" ? 2 : 3,
            lineStyle: trendlineStyle(line)
          });
          const lineData: Array<{ time: UTCTimestamp; value: number }> = [
            { time: startTime, value: line.startPrice },
            { time: lineEndTime, value: line.endPrice }
          ];
          if (renderEndUtc && Number(renderEndUtc) > Number(lineEndTime)) {
            const renderEndValue = projectLineValueAt(line, renderEndTime);
            if (isFiniteNumber(renderEndValue)) {
              lineData.push({ time: renderEndUtc, value: renderEndValue });
            }
          }
          series.setData(lineData);
          cleanupSeriesRef.current.push(series);

          if (line.kind === "ACTION") {
            const anchorSeries = chart.addSeries(LineSeries, {
              color: trendlineColor(line),
              lineVisible: false,
              pointMarkersVisible: true,
              pointMarkersRadius: 5,
              lastValueVisible: false,
              priceLineVisible: false
            });
            anchorSeries.setData([
              { time: startTime, value: line.startPrice },
              { time: lineEndTime, value: line.endPrice }
            ]);
            cleanupSeriesRef.current.push(anchorSeries);
          }
        }
      }

      const markers: Array<{
        time: UTCTimestamp;
        position: "aboveBar" | "belowBar";
        color: string;
        shape: "arrowUp" | "arrowDown" | "circle";
        text: string;
      }> = [];
      for (const trade of backtestTrades ?? []) {
        const entryTime = toUtcTimestampOrNull(trade.entryTime);
        const exitTime = toUtcTimestampOrNull(trade.exitTime);
        const entryPrice = isFiniteNumber(trade.entryPrice) ? trade.entryPrice.toFixed(2) : "—";
        const exitPrice = isFiniteNumber(trade.exitPrice) ? trade.exitPrice.toFixed(2) : "—";
        if (entryTime) {
          markers.push({
            time: entryTime,
            position: "belowBar",
            color: "#1ed67c",
            shape: "arrowUp",
            text: `Entry ${entryPrice}`
          });
        }
        if (exitTime) {
          markers.push({
            time: exitTime,
            position: "aboveBar",
            color: "#ff5a7d",
            shape: "arrowDown",
            text: `Exit ${exitPrice}`
          });
        }
      }

      if (analysis) {
        for (const line of analysis.trendlines) {
          if (line.kind === "CANDIDATE") {
            continue;
          }
          if (line.kind === "ACTION") {
            const pointATime = toUtcTimestampOrNull(line.startTime);
            const pointBTime = toUtcTimestampOrNull(line.endTime);
            if (pointATime) {
              markers.push({
                time: pointATime,
                position: "belowBar",
                color: trendlineColor(line),
                shape: "circle",
                text: "A"
              });
            }
            if (pointBTime) {
              markers.push({
                time: pointBTime,
                position: "belowBar",
                color: trendlineColor(line),
                shape: "circle",
                text: "B"
              });
            }
            continue;
          }
          const time = toUtcTimestampOrNull(line.startTime);
          if (!time) {
            continue;
          }
          markers.push({
            time,
            position: line.direction === "BEARISH" ? "aboveBar" : "belowBar",
            color: trendlineColor(line),
            shape: "circle",
            text: line.kind
          });
        }
      }

      if (markers.length > 0) {
        markers.sort((a, b) => Number(a.time) - Number(b.time));
        markersPluginRef.current = createSeriesMarkers(candles, markers as any) as ISeriesMarkersPluginApi<Time>;
      }
      chart.timeScale().fitContent();
    } catch (error) {
      console.error("Chart render failed", error);
      clearChartSeries(chart);
    }
  }, [analysis, bars, backtestTrades]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 320 }} />;
}
