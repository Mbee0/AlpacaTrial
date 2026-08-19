import { useEffect, useMemo, useRef, useState } from "react";
import { OhlcvBar, ScannerRow, Timeframe } from "@trader/shared";
import {
  fetchAnalysisStatus,
  fetchBacktest,
  fetchMarketBars,
  fetchPortfolioSummary,
  fetchScanner,
  fetchSymbolAnalysisWithRequestId
} from "./api/client";
import { BacktestSummary } from "./components/BacktestSummary";
import { HelpPage } from "./components/HelpPage";
import { PortfolioPage } from "./components/PortfolioPage";
import { ScannerTable, type ScannerTab } from "./components/ScannerTable";
import { SignalExplanation } from "./components/SignalExplanation";
import { SymbolChart } from "./components/SymbolChart";
import { BacktestResponse, PortfolioSummaryResponse, SymbolAnalysisResponse } from "./types";
import "./styles.css";

const timeframeOptions: Timeframe[] = ["1Day", "4Hour", "1Hour", "15Min"];
type ViewMode = "dashboard" | "portfolio" | "help";
type DragMode = "vertical" | "left-horizontal" | "right-horizontal" | null;
type ChartRangePreset = "1H" | "1D" | "1M" | "6M" | "1Y" | "5Y" | "YTD";
type ChartAggregation = "none" | "5D" | "2W" | "1M";
const APP_STATE_KEY = "trader-ui-state-v1";
const SPLITTER_PX = 4;
const MIN_BOTTOM_PANE_PX = 150;
const MAX_BOTTOM_PANE_PX = 460;
const chartRangePresets: ChartRangePreset[] = ["1H", "1D", "1M", "6M", "1Y", "5Y", "YTD"];

function resolveChartBarsTimeframe(baseTimeframe: Timeframe, preset: ChartRangePreset): Timeframe {
  if (preset === "1H" || preset === "1D") {
    return "15Min";
  }
  if (preset === "1M") {
    return baseTimeframe === "15Min" ? "1Hour" : baseTimeframe;
  }
  if (preset === "6M") {
    if (baseTimeframe === "15Min" || baseTimeframe === "1Hour") {
      return "4Hour";
    }
    return baseTimeframe;
  }
  return "1Day";
}

function resolveChartAggregation(preset: ChartRangePreset): ChartAggregation {
  if (preset === "5Y") {
    return "5D";
  }
  return "none";
}

function buildRangeForPreset(preset: ChartRangePreset) {
  const end = new Date();
  const start = new Date(end);

  if (preset === "YTD") {
    const ytdStart = new Date(Date.UTC(end.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    return { start: ytdStart.toISOString(), end: end.toISOString() };
  }

  if (preset === "1H") {
    start.setHours(start.getHours() - 36);
  } else if (preset === "1D") {
    start.setDate(start.getDate() - 7);
  } else if (preset === "1M") {
    start.setMonth(start.getMonth() - 1);
  } else if (preset === "6M") {
    start.setMonth(start.getMonth() - 6);
  } else if (preset === "1Y") {
    start.setFullYear(start.getFullYear() - 1);
  } else if (preset === "5Y") {
    start.setFullYear(start.getFullYear() - 5);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function aggregateBars(sourceBars: OhlcvBar[] | undefined, aggregation: ChartAggregation): OhlcvBar[] | undefined {
  if (!sourceBars || sourceBars.length === 0 || aggregation === "none") {
    return sourceBars;
  }

  const sortedBars = [...sourceBars].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const buckets = new Map<string, OhlcvBar[]>();
  const fiveDayMs = 5 * 24 * 60 * 60 * 1000;
  const twoWeekMs = 14 * 24 * 60 * 60 * 1000;

  for (const bar of sortedBars) {
    const ms = new Date(bar.timestamp).getTime();
    if (!Number.isFinite(ms)) {
      continue;
    }

    let bucketKey: string;
    if (aggregation === "5D") {
      bucketKey = `5d-${Math.floor(ms / fiveDayMs)}`;
    } else if (aggregation === "2W") {
      bucketKey = `2w-${Math.floor(ms / twoWeekMs)}`;
    } else {
      const date = new Date(ms);
      bucketKey = `1m-${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    }

    const group = buckets.get(bucketKey);
    if (group) {
      group.push(bar);
    } else {
      buckets.set(bucketKey, [bar]);
    }
  }

  const aggregatedBars: OhlcvBar[] = [];
  for (const group of buckets.values()) {
    const ordered = group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const open = ordered[0];
    const close = ordered[ordered.length - 1];
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let volume = 0;

    for (const bar of ordered) {
      if (Number.isFinite(bar.high)) {
        high = Math.max(high, bar.high);
      }
      if (Number.isFinite(bar.low)) {
        low = Math.min(low, bar.low);
      }
      if (Number.isFinite(bar.volume)) {
        volume += bar.volume;
      }
    }

    if (!Number.isFinite(open.open) || !Number.isFinite(close.close) || !Number.isFinite(high) || !Number.isFinite(low)) {
      continue;
    }

    aggregatedBars.push({
      symbol: open.symbol,
      timestamp: open.timestamp,
      open: open.open,
      high,
      low,
      close: close.close,
      volume
    });
  }

  return aggregatedBars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function chartIntervalLabel(base: Timeframe, aggregation: ChartAggregation): string {
  if (aggregation === "5D") {
    return "5Day";
  }
  if (aggregation === "2W") {
    return "2Week";
  }
  if (aggregation === "1M") {
    return "1Month";
  }
  return base;
}

function buildHistoryCoverageNote(
  bars: OhlcvBar[] | undefined,
  requestedRange: { start: string; end: string },
  preset: ChartRangePreset
): string | undefined {
  if (!bars || bars.length === 0) {
    return undefined;
  }

  const sorted = [...bars].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const requestedStartMs = new Date(requestedRange.start).getTime();
  const firstMs = new Date(first.timestamp).getTime();
  const lastMs = new Date(last.timestamp).getTime();
  if (!Number.isFinite(requestedStartMs) || !Number.isFinite(firstMs) || !Number.isFinite(lastMs)) {
    return undefined;
  }

  const daysGap = Math.floor((firstMs - requestedStartMs) / (24 * 60 * 60 * 1000));
  if (daysGap <= 8) {
    return `History loaded from ${first.timestamp.slice(0, 10)} to ${last.timestamp.slice(0, 10)}.`;
  }

  return `Requested ${preset}, but available history starts at ${first.timestamp.slice(0, 10)} for this symbol/data feed.`;
}

function formatFixed(value: unknown, digits: number): string {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return "—";
  }
  return numberValue.toFixed(digits);
}

function scannerPlaceholderRow(symbol: string, timeframe: Timeframe): ScannerRow {
  return {
    symbol,
    timeframe,
    signal: "WATCH",
    trendDirection: "SIDEWAYS",
    score: Number.NaN,
    confidence: Number.NaN,
    explanation: ["Scanner result not available yet for this symbol/timeframe."],
    breakdown: {
      trendStrength: 0,
      trendlineQuality: 0,
      breakoutStrength: 0,
      volumeConfirmation: 0,
      multiTimeframeAlignment: 0,
      volatilitySuitability: 0,
      riskReward: 0
    },
    lastPrice: Number.NaN
  };
}

function chartProgressFromStatus(message: string): number {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return 6;
  }
  if (normalized.includes("failed")) {
    return 100;
  }
  if (normalized.includes("complete")) {
    return 100;
  }
  if (normalized.includes("scoring")) {
    return 84;
  }
  if (normalized.includes("swing")) {
    return 68;
  }
  if (normalized.includes("candlestick") || normalized.includes("bars") || normalized.includes("fetch")) {
    return 44;
  }
  if (normalized.includes("cache")) {
    return 28;
  }
  if (normalized.includes("preparing")) {
    return 12;
  }
  if (normalized.includes("starting")) {
    return 8;
  }
  return 20;
}

function TaskbarIcon({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="5" rx="2" />
        <rect x="13" y="10" width="8" height="11" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
      </svg>
    );
  }

  if (viewMode === "portfolio") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16v12H4z" />
        <path d="M9 7V5h6v2" />
        <path d="M4 11h16" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.2 2.2 0 1 1 3.6 1.7c-.7.5-1.2 1-1.2 1.9v.4" />
      <circle cx="12" cy="16.8" r="1" />
    </svg>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [timeframe, setTimeframe] = useState<Timeframe>("1Hour");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [scannerActiveTab, setScannerActiveTab] = useState<ScannerTab>("market");
  const [testSymbolDraft, setTestSymbolDraft] = useState("");
  const [testSymbols, setTestSymbols] = useState<string[]>([]);
  const [savedSymbols, setSavedSymbols] = useState<string[]>([]);
  const [safetyLossBufferPct, setSafetyLossBufferPct] = useState(1);
  const [marketScannerRows, setMarketScannerRows] = useState<ScannerRow[]>([]);
  const [testScannerRows, setTestScannerRows] = useState<ScannerRow[]>([]);
  const [savedScannerRows, setSavedScannerRows] = useState<ScannerRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>();
  const [chartBars, setChartBars] = useState<OhlcvBar[]>();
  const [chartRangePreset, setChartRangePreset] = useState<ChartRangePreset>("1M");
  const [analysis, setAnalysis] = useState<SymbolAnalysisResponse>();
  const [backtest, setBacktest] = useState<BacktestResponse>();
  const [portfolio, setPortfolio] = useState<PortfolioSummaryResponse>();
  const [portfolioError, setPortfolioError] = useState<string>();
  const [marketScannerLoading, setMarketScannerLoading] = useState(false);
  const [testScannerLoading, setTestScannerLoading] = useState(false);
  const [savedScannerLoading, setSavedScannerLoading] = useState(false);
  const [chartBarsLoading, setChartBarsLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [chartStatusMessage, setChartStatusMessage] = useState("Preparing chart analysis...");
  const [chartStatusProgress, setChartStatusProgress] = useState(12);
  const [chartHistoryCoverageNote, setChartHistoryCoverageNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [leftPanePct, setLeftPanePct] = useState(38);
  const [leftBottomPanePx, setLeftBottomPanePx] = useState(250);
  const [rightBottomPanePx, setRightBottomPanePx] = useState(230);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const marketScannerCacheRef = useRef<Map<string, ScannerRow[]>>(new Map());
  const chartBarsCacheRef = useRef<Map<string, OhlcvBar[]>>(new Map());
  const analysisCacheRef = useRef<Map<string, SymbolAnalysisResponse>>(new Map());
  const backtestCacheRef = useRef<Map<string, BacktestResponse>>(new Map());
  const barsRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const layoutRef = useRef<HTMLElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);

  const scannerRowMap = useMemo(() => {
    const map = new Map<string, ScannerRow>();
    for (const row of [...marketScannerRows, ...testScannerRows, ...savedScannerRows]) {
      map.set(row.symbol, row);
    }
    return map;
  }, [marketScannerRows, testScannerRows, savedScannerRows]);
  const selectedSignal = useMemo(
    () => (selectedSymbol ? scannerRowMap.get(selectedSymbol) : undefined),
    [scannerRowMap, selectedSymbol]
  );
  const savedRowsExact = useMemo(() => {
    const marketBySymbol = new Map(marketScannerRows.map((row) => [row.symbol, row]));
    const savedBySymbol = new Map(savedScannerRows.map((row) => [row.symbol, row]));
    return savedSymbols.map((symbol) => marketBySymbol.get(symbol) ?? savedBySymbol.get(symbol) ?? scannerPlaceholderRow(symbol, timeframe));
  }, [savedSymbols, marketScannerRows, savedScannerRows, timeframe]);
  const activeScannerRows = useMemo(() => {
    if (scannerActiveTab === "test") {
      return testScannerRows;
    }
    if (scannerActiveTab === "saved") {
      return savedRowsExact;
    }
    return marketScannerRows;
  }, [scannerActiveTab, marketScannerRows, testScannerRows, savedRowsExact]);
  const activeScannerLoading =
    scannerActiveTab === "test"
      ? testScannerLoading
      : scannerActiveTab === "saved"
        ? savedScannerLoading
        : marketScannerLoading;
  const chartBarsTimeframe = useMemo(
    () => resolveChartBarsTimeframe(timeframe, chartRangePreset),
    [timeframe, chartRangePreset]
  );
  const chartAggregation = useMemo(() => resolveChartAggregation(chartRangePreset), [chartRangePreset]);
  const displayChartBars = useMemo(
    () => aggregateBars(chartBars, chartAggregation),
    [chartBars, chartAggregation]
  );
  const chartInterval = useMemo(
    () => chartIntervalLabel(chartBarsTimeframe, chartAggregation),
    [chartBarsTimeframe, chartAggregation]
  );
  const isSelectedSymbolSaved = Boolean(selectedSymbol && savedSymbols.includes(selectedSymbol));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APP_STATE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        timeframe?: Timeframe;
        selectedSymbol?: string;
        safetyLossBufferPct?: number;
        marketScannerRows?: ScannerRow[];
        scannerActiveTab?: ScannerTab;
        testSymbols?: string[];
        savedSymbols?: string[];
        leftPanePct?: number;
        leftBottomPanePx?: number;
        rightBottomPanePx?: number;
      };
      if (parsed.timeframe && timeframeOptions.includes(parsed.timeframe)) {
        setTimeframe(parsed.timeframe);
      }
      if (parsed.selectedSymbol) {
        setSelectedSymbol(parsed.selectedSymbol);
        setSearchSymbol(parsed.selectedSymbol);
      }
      if (typeof parsed.safetyLossBufferPct === "number" && Number.isFinite(parsed.safetyLossBufferPct)) {
        setSafetyLossBufferPct(parsed.safetyLossBufferPct);
      }
      if (parsed.scannerActiveTab === "market" || parsed.scannerActiveTab === "test" || parsed.scannerActiveTab === "saved") {
        setScannerActiveTab(parsed.scannerActiveTab);
      }
      if (Array.isArray(parsed.testSymbols)) {
        setTestSymbols(parsed.testSymbols.map((value) => value.trim().toUpperCase()).filter(Boolean));
      }
      if (Array.isArray(parsed.savedSymbols)) {
        setSavedSymbols(parsed.savedSymbols.map((value) => value.trim().toUpperCase()).filter(Boolean));
      }
      if (Array.isArray(parsed.marketScannerRows) && parsed.marketScannerRows.length > 0) {
        setMarketScannerRows(parsed.marketScannerRows);
        marketScannerCacheRef.current.set(parsed.timeframe ?? "1Hour", parsed.marketScannerRows);
      }
      if (typeof parsed.leftPanePct === "number") {
        setLeftPanePct(parsed.leftPanePct);
      }
      if (typeof parsed.leftBottomPanePx === "number") {
        setLeftBottomPanePx(parsed.leftBottomPanePx);
      }
      if (typeof parsed.rightBottomPanePx === "number") {
        setRightBottomPanePx(parsed.rightBottomPanePx);
      }
    } catch {
      // Ignore invalid persisted UI state.
    }
  }, []);

  useEffect(() => {
    const payload = {
      timeframe,
      selectedSymbol,
      safetyLossBufferPct,
      scannerActiveTab,
      testSymbols: testSymbols.slice(0, 80),
      savedSymbols: savedSymbols.slice(0, 80),
      marketScannerRows: marketScannerRows.slice(0, 50),
      leftPanePct,
      leftBottomPanePx,
      rightBottomPanePx
    };
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(payload));
  }, [
    timeframe,
    selectedSymbol,
    safetyLossBufferPct,
    scannerActiveTab,
    testSymbols,
    savedSymbols,
    marketScannerRows,
    leftPanePct,
    leftBottomPanePx,
    rightBottomPanePx
  ]);

  useEffect(() => {
    let cancelled = false;
    const loadScanners = async () => {
      const cacheKey = timeframe;
      const cachedMarketRows = marketScannerCacheRef.current.get(cacheKey);
      if (cachedMarketRows && cachedMarketRows.length > 0 && refreshCounter === 0) {
        setMarketScannerRows(cachedMarketRows);
        setSelectedSymbol((current) => current ?? cachedMarketRows[0]?.symbol);
      }

      setMarketScannerLoading(true);
      try {
        const scanner = await fetchScanner(timeframe);
        if (cancelled) {
          return;
        }
        marketScannerCacheRef.current.set(cacheKey, scanner.rows);
        setMarketScannerRows(scanner.rows);
        setSelectedSymbol((current) => current ?? scanner.rows[0]?.symbol);
        setError(undefined);
      } catch (err) {
        if (!cachedMarketRows && !cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load scanner.");
        }
      } finally {
        if (!cancelled) {
          setMarketScannerLoading(false);
        }
      }

      const loadTrackedRows = async (
        symbols: string[],
        setRows: (rows: ScannerRow[]) => void,
        setLoading: (value: boolean) => void,
        tab: ScannerTab
      ) => {
        if (symbols.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          const scanner = await fetchScanner(timeframe, {
            symbols,
            limit: Math.max(symbols.length, 20)
          });
          if (cancelled) {
            return;
          }
          const bySymbol = new Map(scanner.rows.map((row) => [row.symbol, row]));
          setRows(symbols.map((symbol) => bySymbol.get(symbol) ?? scannerPlaceholderRow(symbol, timeframe)));
          setError(undefined);
        } catch (err) {
          if (!cancelled) {
            setRows(symbols.map((symbol) => scannerPlaceholderRow(symbol, timeframe)));
            if (scannerActiveTab === tab) {
              setError(err instanceof Error ? err.message : "Failed to load tracked symbols.");
            }
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      await loadTrackedRows(testSymbols, setTestScannerRows, setTestScannerLoading, "test");
      await loadTrackedRows(savedSymbols, setSavedScannerRows, setSavedScannerLoading, "saved");
    };

    void loadScanners();
    return () => {
      cancelled = true;
    };
  }, [timeframe, refreshCounter, testSymbols, savedSymbols, scannerActiveTab]);

  useEffect(() => {
    if (!selectedSymbol) {
      return;
    }

    const loadChartBars = async () => {
      const requestId = barsRequestIdRef.current + 1;
      barsRequestIdRef.current = requestId;
      const bufferPct = Math.max(0.1, safetyLossBufferPct) / 100;
      const analysisKey = `${selectedSymbol}:${timeframe}:${bufferPct.toFixed(4)}`;
      const range = buildRangeForPreset(chartRangePreset);
      const chartBarsCacheKey = `${selectedSymbol}:${chartBarsTimeframe}:${chartRangePreset}`;
      const symbolTimeframeKey = `${selectedSymbol}:${timeframe}`;
      const cachedBars = chartBarsCacheRef.current.get(chartBarsCacheKey);
      const cachedAnalysis = analysisCacheRef.current.get(analysisKey);
      const cachedBacktest = backtestCacheRef.current.get(symbolTimeframeKey);

      if (cachedBars && cachedBars.length > 0) {
        setChartBars(cachedBars);
        setChartHistoryCoverageNote(buildHistoryCoverageNote(cachedBars, range, chartRangePreset));
      } else {
        setChartBars(undefined);
        setChartHistoryCoverageNote(undefined);
      }
      setAnalysis(cachedAnalysis);
      setBacktest(cachedBacktest);
      setChartBarsLoading(true);
      setChartStatusMessage(`Fetching candlestick history (${chartIntervalLabel(chartBarsTimeframe, chartAggregation)})...`);
      setChartStatusProgress(chartProgressFromStatus("Fetching candlestick history..."));
      try {
        const marketBarsResponse = await fetchMarketBars(selectedSymbol, chartBarsTimeframe, range);
        if (requestId !== barsRequestIdRef.current) {
          return;
        }
        chartBarsCacheRef.current.set(chartBarsCacheKey, marketBarsResponse.bars);
        setChartBars(marketBarsResponse.bars);
        setChartHistoryCoverageNote(buildHistoryCoverageNote(marketBarsResponse.bars, range, chartRangePreset));
        setChartStatusMessage(
          cachedAnalysis ? "Candlesticks loaded. Cached analysis ready." : "Candlesticks loaded. Run analysis when ready."
        );
        setChartStatusProgress(100);
        setError(undefined);
      } catch (err) {
        if (requestId !== barsRequestIdRef.current) {
          return;
        }
        if (!cachedBars) {
          setError(err instanceof Error ? err.message : "Failed to load chart history.");
        }
        setChartHistoryCoverageNote(undefined);
        setChartStatusMessage("Candlestick fetch failed.");
        setChartStatusProgress(100);
      } finally {
        if (requestId === barsRequestIdRef.current) {
          setChartBarsLoading(false);
        }
      }
    };

    loadChartBars();
  }, [selectedSymbol, timeframe, chartRangePreset, chartBarsTimeframe, chartAggregation]);

  const runAnalysis = async () => {
    if (!selectedSymbol) {
      return;
    }

    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    const statusRequestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const bufferPct = Math.max(0.1, safetyLossBufferPct) / 100;
    const analysisKey = `${selectedSymbol}:${timeframe}:${bufferPct.toFixed(4)}`;
    const symbolTimeframeKey = `${selectedSymbol}:${timeframe}`;
    const cachedAnalysis = analysisCacheRef.current.get(analysisKey);
    const cachedBacktest = backtestCacheRef.current.get(symbolTimeframeKey);
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
    }
    if (cachedBacktest) {
      setBacktest(cachedBacktest);
    }

    setDetailsLoading(true);
    setChartStatusMessage("Preparing chart analysis...");
    setChartStatusProgress(chartProgressFromStatus("Preparing chart analysis..."));
    let statusPollTimer: number | undefined;
    const clearStatusPolling = () => {
      if (statusPollTimer) {
        window.clearInterval(statusPollTimer);
        statusPollTimer = undefined;
      }
    };
    const pollStatus = async () => {
      try {
        const status = await fetchAnalysisStatus(statusRequestId);
        if (requestId !== detailRequestIdRef.current) {
          return;
        }
        setChartStatusMessage(status.message);
        setChartStatusProgress((prev) => Math.max(prev, chartProgressFromStatus(status.message)));
      } catch {
        // Ignore transient status polling failures while main request is in-flight.
      }
    };
    statusPollTimer = window.setInterval(pollStatus, 450);
    void pollStatus();

    try {
      const analysisResponse = await fetchSymbolAnalysisWithRequestId(selectedSymbol, timeframe, bufferPct, statusRequestId);
      if (requestId !== detailRequestIdRef.current) {
        clearStatusPolling();
        return;
      }
      clearStatusPolling();
      analysisCacheRef.current.set(analysisKey, analysisResponse);
      setAnalysis(analysisResponse);
      setError(undefined);
      setChartStatusMessage("Chart analysis complete.");
      setChartStatusProgress(100);

      void fetchBacktest(selectedSymbol, timeframe)
        .then((backtestResponse) => {
          if (requestId !== detailRequestIdRef.current) {
            return;
          }
          backtestCacheRef.current.set(symbolTimeframeKey, backtestResponse);
          setBacktest(backtestResponse);
        })
        .catch(() => {
          // Keep chart visible if backtest fails or stalls.
        });
    } catch (err) {
      if (requestId !== detailRequestIdRef.current) {
        clearStatusPolling();
        return;
      }
      clearStatusPolling();
      setError(err instanceof Error ? err.message : "Failed to run analysis.");
      setChartStatusMessage("Analysis request failed.");
      setChartStatusProgress(100);
    } finally {
      clearStatusPolling();
      if (requestId === detailRequestIdRef.current) {
        setDetailsLoading(false);
      }
    }
  };

  const hideAnalysis = () => {
    setAnalysis(undefined);
    setBacktest(undefined);
    setChartStatusMessage("Candlesticks loaded. Run analysis when ready.");
    setChartStatusProgress(100);
  };

  useEffect(() => {
    if (viewMode !== "portfolio") {
      return;
    }

    const loadPortfolio = async () => {
      setPortfolioLoading(true);
      try {
        const summary = await fetchPortfolioSummary();
        setPortfolio(summary);
        setPortfolioError(undefined);
      } catch (err) {
        setPortfolioError(err instanceof Error ? err.message : "Failed to load portfolio.");
      }
      setPortfolioLoading(false);
    };

    loadPortfolio();
  }, [viewMode]);

  const handleSelectSymbol = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      return;
    }

    setSelectedSymbol(normalized);
    setSearchSymbol(normalized);
    setViewMode("dashboard");
  };

  const handleSearchSubmit = () => {
    handleSelectSymbol(searchSymbol);
  };

  const handleAddTestSymbol = () => {
    const symbol = testSymbolDraft.trim().toUpperCase();
    if (!symbol) {
      return;
    }
    setTestSymbols((current) => (current.includes(symbol) ? current : [symbol, ...current]));
    setScannerActiveTab("test");
    setTestSymbolDraft("");
    handleSelectSymbol(symbol);
  };

  const handleRemoveTestSymbol = (symbol: string) => {
    setTestSymbols((current) => current.filter((value) => value !== symbol));
  };

  const handleToggleSavedTrack = () => {
    if (!selectedSymbol) {
      return;
    }
    setSavedSymbols((current) =>
      current.includes(selectedSymbol) ? current.filter((value) => value !== selectedSymbol) : [selectedSymbol, ...current]
    );
  };

  useEffect(() => {
    if (!dragMode) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (dragMode === "vertical" && layoutRef.current) {
        const rect = layoutRef.current.getBoundingClientRect();
        const next = ((event.clientX - rect.left) / rect.width) * 100;
        setLeftPanePct(Math.max(24, Math.min(62, next)));
      } else if (dragMode === "left-horizontal" && leftColumnRef.current) {
        const rect = leftColumnRef.current.getBoundingClientRect();
        const nextBottom = rect.bottom - event.clientY - SPLITTER_PX / 2;
        setLeftBottomPanePx(Math.max(MIN_BOTTOM_PANE_PX, Math.min(MAX_BOTTOM_PANE_PX, nextBottom)));
      } else if (dragMode === "right-horizontal" && rightColumnRef.current) {
        const rect = rightColumnRef.current.getBoundingClientRect();
        const nextBottom = rect.bottom - event.clientY - SPLITTER_PX / 2;
        setRightBottomPanePx(Math.max(MIN_BOTTOM_PANE_PX, Math.min(MAX_BOTTOM_PANE_PX, nextBottom)));
      }
    };

    const onMouseUp = () => {
      setDragMode(null);
      document.body.classList.remove("is-dragging");
    };

    document.body.classList.add("is-dragging");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.classList.remove("is-dragging");
    };
  }, [dragMode]);

  return (
    <main className="app app-shell">
      <aside className="taskbar">
        <div className="taskbar-brand">TT</div>
        <nav className="taskbar-nav">
          {(["dashboard", "portfolio", "help"] as ViewMode[]).map((item) => (
            <button
              key={item}
              type="button"
              className={`taskbar-button ${viewMode === item ? "active" : ""}`}
              onClick={() => setViewMode(item)}
              title={item}
            >
              <TaskbarIcon viewMode={item} />
              <span>{item[0].toUpperCase() + item.slice(1)}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="app-header glass">
          <div>
            <h1>Trendline Research & Paper-Trading Platform</h1>
            <p>LIVE TRADING DISABLED · Structured analysis + transparent risk controls.</p>
          </div>
          <div className="top-summary">
            <span className="summary-item">Symbol {selectedSymbol ?? "—"}</span>
            <span className="summary-item">Signal {selectedSignal?.signal ?? "—"}</span>
            <span className="summary-item">Score {formatFixed(selectedSignal?.score, 1)}</span>
            <span className="summary-item">Timeframe {timeframe}</span>
          </div>
        </header>

        {viewMode === "dashboard" && (
          <>
            {error && <div className="error">{error}</div>}
            <section className="overview-strip">
              <article className="overview-card">
                <span>Trend</span>
                <strong>{selectedSignal?.trendDirection ?? "—"}</strong>
              </article>
              <article className="overview-card">
                <span>Action Line</span>
                <strong>{formatFixed(selectedSignal?.actionLine, 2)}</strong>
              </article>
              <article className="overview-card">
                <span>Safety Line</span>
                <strong>{formatFixed(selectedSignal?.safetyLine, 2)}</strong>
              </article>
              <article className="overview-card">
                <span>Safety-loss</span>
                <strong>{formatFixed(selectedSignal?.safetyLossLine, 2)}</strong>
              </article>
              <article className="overview-card">
                <span>Backtest Return</span>
                <strong>{backtest ? `${formatFixed(backtest.totalReturnPct, 2)}%` : "—"}</strong>
              </article>
              <article className="overview-card">
                <span>Confidence</span>
                <strong>{selectedSignal ? `${formatFixed(selectedSignal.confidence, 1)}%` : "—"}</strong>
              </article>
            </section>
            <section
              className="layout"
              ref={layoutRef}
              style={{ gridTemplateColumns: `${leftPanePct}% ${SPLITTER_PX}px minmax(0, 1fr)` }}
            >
              <div
                className="left-column"
                ref={leftColumnRef}
                style={{ gridTemplateRows: `minmax(0, 1fr) ${SPLITTER_PX}px ${leftBottomPanePx}px` }}
              >
                <ScannerTable
                  rows={activeScannerRows}
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={handleSelectSymbol}
                  loading={activeScannerLoading}
                  activeTab={scannerActiveTab}
                  onActiveTabChange={setScannerActiveTab}
                  testSymbols={testSymbols}
                  testSymbolDraft={testSymbolDraft}
                  onTestSymbolDraftChange={setTestSymbolDraft}
                  onAddTestSymbol={handleAddTestSymbol}
                  onRemoveTestSymbol={handleRemoveTestSymbol}
                  timeframe={timeframe}
                  timeframeOptions={timeframeOptions}
                  onTimeframeChange={setTimeframe}
                  searchSymbol={searchSymbol}
                  onSearchSymbolChange={setSearchSymbol}
                  onSearchSubmit={handleSearchSubmit}
                  safetyLossBufferPct={safetyLossBufferPct}
                  onSafetyLossBufferPctChange={setSafetyLossBufferPct}
                  onRefreshScanner={() => setRefreshCounter((value) => value + 1)}
                />
                <div
                  className={`splitter splitter-horizontal ${dragMode === "left-horizontal" ? "active" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setDragMode("left-horizontal");
                  }}
                >
                  <span className="splitter-handle" aria-hidden="true" />
                </div>
                <SignalExplanation signal={selectedSignal} loading={detailsLoading && !selectedSignal} />
              </div>
              <div
                className={`splitter splitter-vertical ${dragMode === "vertical" ? "active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setDragMode("vertical");
                }}
              >
                <span className="splitter-handle" aria-hidden="true" />
              </div>
              <div
                className="right-column"
                ref={rightColumnRef}
                style={{ gridTemplateRows: `minmax(0, 1fr) ${SPLITTER_PX}px ${rightBottomPanePx}px` }}
              >
                <div className="panel chart-panel">
                  <div className="chart-panel-head">
                    <h2 className="title-with-hint">
                      {selectedSymbol ? `${selectedSymbol} Chart Inspection` : "Chart Inspection"}
                      <span className="title-hint">
                        Candles, volume, trend rays, Action/Safety/Safety-Loss lines, and backtest trade markers.
                      </span>
                    </h2>
                    <div className="chart-panel-actions">
                      <button
                        type="button"
                        className={`saved-track-toggle ${isSelectedSymbolSaved ? "active" : ""}`}
                        disabled={!selectedSymbol}
                        onClick={handleToggleSavedTrack}
                        title={isSelectedSymbolSaved ? "Remove from saved tracks" : "Save to tracked symbols"}
                        aria-label={isSelectedSymbolSaved ? "Remove from saved tracks" : "Save to tracked symbols"}
                      >
                        {isSelectedSymbolSaved ? "★" : "☆"}
                      </button>
                      <button
                        type="button"
                        className="analysis-run-button"
                        disabled={!selectedSymbol || chartBarsLoading || detailsLoading}
                        onClick={() => {
                          void runAnalysis();
                        }}
                      >
                        {detailsLoading ? "Running Analysis..." : "Run Analysis"}
                      </button>
                      {analysis && (
                        <button type="button" className="analysis-clear-button" onClick={hideAnalysis}>
                          Hide Analysis
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="chart-range-row" role="tablist" aria-label="Chart time range">
                    <span className="chart-range-label">Range</span>
                    {chartRangePresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        role="tab"
                        aria-selected={chartRangePreset === preset}
                        className={`chart-range-chip ${chartRangePreset === preset ? "active" : ""}`}
                        onClick={() => setChartRangePreset(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                    <span className="chart-range-interval">Bar interval: {chartInterval}</span>
                  </div>
                  {chartHistoryCoverageNote && <div className="chart-coverage-note">{chartHistoryCoverageNote}</div>}
                  {(chartBarsLoading || detailsLoading) && (
                    <div className="chart-inline-status" aria-live="polite">
                      <div
                        className={`status-progress-track ${chartStatusMessage.toLowerCase().includes("failed") ? "failed" : ""}`}
                      >
                        <div
                          className="status-progress-fill"
                          style={{ width: `${Math.max(0, Math.min(100, chartStatusProgress))}%` }}
                        />
                      </div>
                      <div className="status-progress-meta">
                        <span className="status-wave-text">{chartStatusMessage}</span>
                        <strong>{Math.round(chartStatusProgress)}%</strong>
                      </div>
                    </div>
                  )}
                  <div className="chart-host">
                    {chartBarsLoading && (!displayChartBars || displayChartBars.length === 0) ? (
                      <div className="chart-loading">
                        <div className="wave-loader" role="status" aria-label="Loading chart analysis">
                          <span className="wave-dot" />
                          <span className="wave-dot" />
                          <span className="wave-dot" />
                        </div>
                        <div className="status-progress" aria-live="polite">
                          <div
                            className={`status-progress-track ${chartStatusMessage.toLowerCase().includes("failed") ? "failed" : ""}`}
                          >
                            <div
                              className="status-progress-fill"
                              style={{ width: `${Math.max(0, Math.min(100, chartStatusProgress))}%` }}
                            />
                          </div>
                          <div className="status-progress-meta">
                            <span className="status-wave-text">{chartStatusMessage}</span>
                            <strong>{Math.round(chartStatusProgress)}%</strong>
                          </div>
                        </div>
                      </div>
                    ) : !displayChartBars || displayChartBars.length === 0 ? (
                      <div className="chart-loading">
                        <p className="muted">Select a symbol to load chart history.</p>
                      </div>
                    ) : (
                      <SymbolChart analysis={analysis} bars={displayChartBars} backtestTrades={backtest?.tradeList} />
                    )}
                  </div>
                </div>
                <div
                  className={`splitter splitter-horizontal ${dragMode === "right-horizontal" ? "active" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setDragMode("right-horizontal");
                  }}
                >
                  <span className="splitter-handle" aria-hidden="true" />
                </div>
                <BacktestSummary backtest={backtest} loading={detailsLoading && !backtest} />
              </div>
            </section>
          </>
        )}

        {viewMode === "portfolio" && (
          <PortfolioPage
            data={portfolio}
            loading={portfolioLoading}
            error={portfolioError}
            onSelectSymbol={handleSelectSymbol}
          />
        )}

        {viewMode === "help" && <HelpPage />}
      </section>
    </main>
  );
}
