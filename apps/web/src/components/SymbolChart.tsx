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

function projectLineValueAt(line: SymbolAnalysisResponse["trendlines"][number], timestamp: string) {
  const x1 = new Date(line.startTime).getTime();
  const x = new Date(timestamp).getTime();
  return line.startPrice + line.slope * (x - x1);
}

function trendlineColor(line: SymbolAnalysisResponse["trendlines"][number]) {
  if (line.direction === "BULLISH") {
    if (line.kind === "ACTION") {
      return "#22c55e";
    }
    if (line.kind === "SAFETY") {
      return "#4ade80";
    }
    return "#16a34a";
  }
  if (line.direction === "BEARISH") {
    if (line.kind === "ACTION") {
      return "#ef4444";
    }
    if (line.kind === "SAFETY") {
      return "#f87171";
    }
    return "#b91c1c";
  }
  return "#9ca3af";
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
      height: Math.max(320, containerRef.current.clientHeight),
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
      const latestTimestamp = analysis.bars[analysis.bars.length - 1]?.timestamp ?? line.endTime;
      const renderEndTime =
        new Date(latestTimestamp).getTime() > new Date(line.endTime).getTime() ? latestTimestamp : line.endTime;
      const renderEndValue = projectLineValueAt(line, renderEndTime);
      const series = chart.addSeries(LineSeries, {
        color: trendlineColor(line),
        lineWidth: line.kind === "CANDIDATE" ? 1 : 3,
        lineStyle: line.kind === "CANDIDATE" ? LineStyle.Dashed : LineStyle.Solid
      });
      series.setData([
        { time: toUtcTimestamp(line.startTime), value: line.startPrice },
        { time: toUtcTimestamp(renderEndTime), value: renderEndValue }
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

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 320 }} />;
}
