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

    cleanupSeriesRef.current.forEach((series) => chart.removeSeries(series));
    cleanupSeriesRef.current = [];
    markersPluginRef.current?.detach();
    markersPluginRef.current = null;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#1ed67c",
      downColor: "#ff5a7d",
      borderVisible: false,
      wickUpColor: "#1ed67c",
      wickDownColor: "#ff5a7d"
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
      analysis.bars.map((bar) => ({
        time: toUtcTimestamp(bar.timestamp),
        value: bar.volume,
        color: bar.close >= bar.open ? "#1ed67c88" : "#ff5a7d88"
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
        lineWidth: line.kind === "CANDIDATE" ? 1 : line.kind === "SAFETY_LOSS" ? 2 : 3,
        lineStyle: trendlineStyle(line)
      });
      series.setData([
        { time: toUtcTimestamp(line.startTime), value: line.startPrice },
        { time: toUtcTimestamp(renderEndTime), value: renderEndValue }
      ]);
      cleanupSeriesRef.current.push(series);
    }

    const tradeMarkers = (backtestTrades ?? []).flatMap((trade) => [
      {
        time: toUtcTimestamp(trade.entryTime),
        position: "belowBar" as const,
        color: "#1ed67c",
        shape: "arrowUp" as const,
        text: `Entry ${trade.entryPrice.toFixed(2)}`
      },
      {
        time: toUtcTimestamp(trade.exitTime),
        position: "aboveBar" as const,
        color: "#ff5a7d",
        shape: "arrowDown" as const,
        text: `Exit ${trade.exitPrice.toFixed(2)}`
      }
    ]);

    const lineMarkers = analysis.trendlines
      .filter((line) => line.kind !== "CANDIDATE")
      .map((line) => ({
        time: toUtcTimestamp(line.startTime),
        position: line.direction === "BEARISH" ? ("aboveBar" as const) : ("belowBar" as const),
        color: trendlineColor(line),
        shape: "circle" as const,
        text: line.kind
      }));

    markersPluginRef.current = createSeriesMarkers(candles, [...tradeMarkers, ...lineMarkers]);
    chart.timeScale().fitContent();
  }, [analysis, backtestTrades]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 320 }} />;
}
