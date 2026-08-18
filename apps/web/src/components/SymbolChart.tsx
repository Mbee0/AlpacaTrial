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
        background: { type: ColorType.Solid, color: "#0e111a" },
        textColor: "#d1d4dc"
      },
      width: containerRef.current.clientWidth,
      height: 500,
      grid: {
        vertLines: { color: "#1f2736" },
        horzLines: { color: "#1f2736" }
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#2a3042" },
      timeScale: { borderColor: "#2a3042", timeVisible: true }
    });

    chartRef.current = chart;

    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
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

    cleanupSeriesRef.current.forEach((series) => chart.removeSeries(series));
    cleanupSeriesRef.current = [];
    markersPluginRef.current?.detach();
    markersPluginRef.current = null;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444"
    });
    candles.setData(
      analysis.bars.map((bar) => ({
        time: toUtcTimestamp(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      }))
    );
    cleanupSeriesRef.current.push(candles);

    const volume = chart.addSeries(HistogramSeries, {
      color: "#1e3a8a",
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
      analysis.bars.map((bar) => ({
        time: toUtcTimestamp(bar.timestamp),
        value: bar.volume,
        color: bar.close >= bar.open ? "#22c55e66" : "#ef444466"
      }))
    );
    cleanupSeriesRef.current.push(volume);

    for (const line of analysis.trendlines) {
      const color =
        line.kind === "ACTION" ? "#facc15" : line.kind === "SAFETY" ? "#60a5fa" : "#9ca3af";
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: line.kind === "CANDIDATE" ? 1 : 2,
        lineStyle: line.kind === "CANDIDATE" ? LineStyle.Dashed : LineStyle.Solid
      });
      series.setData([
        { time: toUtcTimestamp(line.startTime), value: line.startPrice },
        { time: toUtcTimestamp(line.endTime), value: line.endPrice }
      ]);
      cleanupSeriesRef.current.push(series);
    }

    const markers = (backtestTrades ?? []).flatMap((trade) => [
      {
        time: toUtcTimestamp(trade.entryTime),
        position: "belowBar" as const,
        color: "#22c55e",
        shape: "arrowUp" as const,
        text: `Entry ${trade.entryPrice.toFixed(2)}`
      },
      {
        time: toUtcTimestamp(trade.exitTime),
        position: "aboveBar" as const,
        color: "#ef4444",
        shape: "arrowDown" as const,
        text: `Exit ${trade.exitPrice.toFixed(2)}`
      }
    ]);

    markersPluginRef.current = createSeriesMarkers(candles, markers);
    chart.timeScale().fitContent();
  }, [analysis, backtestTrades]);

  return <div ref={containerRef} style={{ width: "100%", minHeight: 500 }} />;
}
