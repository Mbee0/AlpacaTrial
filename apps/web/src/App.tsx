import { useEffect, useMemo, useRef, useState } from "react";
import { ScannerRow, Timeframe } from "@trader/shared";
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
import { ScannerTable } from "./components/ScannerTable";
import { SignalExplanation } from "./components/SignalExplanation";
import { SymbolChart } from "./components/SymbolChart";
import { BacktestResponse, PortfolioSummaryResponse, SymbolAnalysisResponse } from "./types";
import "./styles.css";

const timeframeOptions: Timeframe[] = ["1Day", "4Hour", "1Hour", "15Min"];
type ViewMode = "dashboard" | "portfolio" | "help";
type DragMode =
  | "vertical"
  | "left-horizontal"
  | "right-horizontal"
  | "left-corner"
  | "right-corner"
  | null;
const APP_STATE_KEY = "trader-ui-state-v1";
const SPLITTER_PX = 4;
const MIN_BOTTOM_PANE_PX = 150;
const MAX_BOTTOM_PANE_PX = 460;

function progressFromStatus(message: string) {
  const text = message.toLowerCase();
  if (text.includes("queued") || text.includes("starting symbol analysis")) return 8;
  if (text.includes("preparing chart analysis")) return 12;
  if (text.includes("resolving asset metadata")) return 22;
  if (text.includes("checking local historical cache")) return 34;
  if (text.includes("using local cached bars")) return 52;
  if (text.includes("fetching candlestick history from alpaca") || text.includes("requesting missing bars")) return 52;
  if (text.includes("persisting bars")) return 66;
  if (text.includes("candlestick chart ready")) return 72;
  if (text.includes("candlestick history loaded")) return 74;
  if (text.includes("detecting swing points")) return 80;
  if (text.includes("scoring rays")) return 90;
  if (text.includes("finalizing chart payload")) return 96;
  if (text.includes("failed")) return 100;
  if (text.includes("complete")) return 100;
  return 14;
}

function buildChartPreviewAnalysis(params: {
  symbol: string;
  timeframe: Timeframe;
  bars: SymbolAnalysisResponse["bars"];
  fallbackSignal?: ScannerRow;
}): SymbolAnalysisResponse {
  const fallbackSignal: ScannerRow =
    params.fallbackSignal ??
    ({
      symbol: params.symbol,
      timeframe: params.timeframe,
      signal: "HOLD",
      trendDirection: "SIDEWAYS",
      score: 0,
      confidence: 0,
      explanation: ["Candles loaded. Trendline analysis is still in progress."],
      breakdown: {
        trendStrength: 0,
        trendlineQuality: 0,
        breakoutStrength: 0,
        volumeConfirmation: 0,
        multiTimeframeAlignment: 0,
        volatilitySuitability: 0,
        riskReward: 0
      },
      lastPrice: params.bars[params.bars.length - 1]?.close ?? 0
    } satisfies ScannerRow);

  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    lastPrice: params.bars[params.bars.length - 1]?.close ?? 0,
    bars: params.bars,
    swings: [],
    trendlines: [],
    signal: fallbackSignal,
    scannerRow: fallbackSignal
  };
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
  const [searchSymbol, setSearchSymbol] = useState("AAPL");
  const [safetyLossBufferPct, setSafetyLossBufferPct] = useState(1);
  const [scannerRows, setScannerRows] = useState<ScannerRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [analysis, setAnalysis] = useState<SymbolAnalysisResponse>();
  const [backtest, setBacktest] = useState<BacktestResponse>();
  const [portfolio, setPortfolio] = useState<PortfolioSummaryResponse>();
  const [portfolioError, setPortfolioError] = useState<string>();
  const [scannerLoading, setScannerLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [chartBootstrapComplete, setChartBootstrapComplete] = useState(false);
  const [chartStatusMessage, setChartStatusMessage] = useState("Preparing chart analysis...");
  const [chartStatusTrail, setChartStatusTrail] = useState<string[]>([]);
  const [chartStatusProgress, setChartStatusProgress] = useState(8);
  const [error, setError] = useState<string>();
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [leftPanePct, setLeftPanePct] = useState(38);
  const [leftBottomPanePx, setLeftBottomPanePx] = useState(250);
  const [rightBottomPanePx, setRightBottomPanePx] = useState(230);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const scannerCacheRef = useRef<Map<string, ScannerRow[]>>(new Map());
  const analysisCacheRef = useRef<Map<string, SymbolAnalysisResponse>>(new Map());
  const backtestCacheRef = useRef<Map<string, BacktestResponse>>(new Map());
  const detailRequestIdRef = useRef(0);
  const layoutRef = useRef<HTMLElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);

  const selectedSignal = useMemo(
    () => scannerRows.find((row) => row.symbol === selectedSymbol),
    [scannerRows, selectedSymbol]
  );

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
        scannerRows?: ScannerRow[];
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
      if (Array.isArray(parsed.scannerRows) && parsed.scannerRows.length > 0) {
        setScannerRows(parsed.scannerRows);
        scannerCacheRef.current.set(parsed.timeframe ?? "1Hour", parsed.scannerRows);
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
      scannerRows: scannerRows.slice(0, 50),
      leftPanePct,
      leftBottomPanePx,
      rightBottomPanePx
    };
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(payload));
  }, [
    timeframe,
    selectedSymbol,
    safetyLossBufferPct,
    scannerRows,
    leftPanePct,
    leftBottomPanePx,
    rightBottomPanePx
  ]);

  useEffect(() => {
    const loadScanner = async () => {
      const cacheKey = timeframe;
      const cachedRows = scannerCacheRef.current.get(cacheKey);
      const hasCachedRows = Boolean(cachedRows && cachedRows.length > 0);
      if (!chartBootstrapComplete && !hasCachedRows && refreshCounter === 0) {
        return;
      }
      if (cachedRows && cachedRows.length > 0 && refreshCounter === 0) {
        setScannerRows(cachedRows);
        if (!selectedSymbol) {
          setSelectedSymbol(cachedRows[0].symbol);
        }
      }

      setScannerLoading(true);
      try {
        const scanner = await fetchScanner(timeframe);
        scannerCacheRef.current.set(cacheKey, scanner.rows);
        setScannerRows(scanner.rows);
        if (!selectedSymbol && scanner.rows.length > 0) {
          setSelectedSymbol(scanner.rows[0].symbol);
        }
        setError(undefined);
      } catch (err) {
        if (!cachedRows) {
          setError(err instanceof Error ? err.message : "Failed to load scanner.");
        }
      }
      setScannerLoading(false);
    };

    loadScanner();
  }, [timeframe, refreshCounter, chartBootstrapComplete]);

  useEffect(() => {
    if (!selectedSymbol) {
      return;
    }

    const loadDetails = async () => {
      const requestId = detailRequestIdRef.current + 1;
      detailRequestIdRef.current = requestId;
      const statusRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const bufferPct = Math.max(0.1, safetyLossBufferPct) / 100;
      const cacheKey = `${selectedSymbol}:${timeframe}:${bufferPct.toFixed(4)}`;
      const backtestKey = `${selectedSymbol}:${timeframe}`;
      const cachedAnalysis = analysisCacheRef.current.get(cacheKey);
      const cachedBacktest = backtestCacheRef.current.get(backtestKey);
      if (cachedAnalysis) {
        setAnalysis(cachedAnalysis);
      }
      if (cachedBacktest) {
        setBacktest(cachedBacktest);
      }

      setDetailsLoading(true);
      setChartStatusMessage("Preparing chart analysis...");
      setChartStatusTrail(["Preparing chart analysis..."]);
      setChartStatusProgress(10);
      let statusPollTimer: number | undefined;
      const pushStatusMessage = (message: string) => {
        setChartStatusMessage(message);
        setChartStatusProgress((current) => Math.max(current, progressFromStatus(message)));
        setChartStatusTrail((existing) => {
          if (existing[existing.length - 1] === message) {
            return existing;
          }
          return [...existing.slice(-5), message];
        });
      };
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
          if (status.state !== "unknown") {
            pushStatusMessage(status.message);
          }
        } catch {
          // Ignore transient status polling failures while main request is in-flight.
        }
      };
      statusPollTimer = window.setInterval(pollStatus, 450);
      void pollStatus();

      const barsPrefetch = fetchMarketBars(selectedSymbol, timeframe)
        .then((barsResponse) => {
          if (requestId !== detailRequestIdRef.current) {
            return;
          }
          setAnalysis((current) => {
            if (current && current.symbol === selectedSymbol && current.timeframe === timeframe && current.bars.length > 0) {
              return current;
            }
            return buildChartPreviewAnalysis({
              symbol: selectedSymbol,
              timeframe,
              bars: barsResponse.bars,
              fallbackSignal: selectedSignal
            });
          });
          pushStatusMessage("Candlestick chart ready. Continuing line analysis...");
        })
        .catch(() => {
          // Keep going with full analysis path; it can still return bars.
        });

      try {
        const analysisResponse = await fetchSymbolAnalysisWithRequestId(selectedSymbol, timeframe, bufferPct, statusRequestId);
        if (requestId !== detailRequestIdRef.current) {
          clearStatusPolling();
          return;
        }
        await barsPrefetch;
        clearStatusPolling();
        analysisCacheRef.current.set(cacheKey, analysisResponse);
        setAnalysis(analysisResponse);
        setError(undefined);
        pushStatusMessage("Chart analysis complete.");
        setChartStatusProgress(100);

        if (!cachedBacktest) {
          void fetchBacktest(selectedSymbol, timeframe)
            .then((backtestResponse) => {
              if (requestId !== detailRequestIdRef.current) {
                return;
              }
              backtestCacheRef.current.set(backtestKey, backtestResponse);
              setBacktest(backtestResponse);
            })
            .catch(() => {
              // Backtest is secondary to chart inspection; keep the chart visible if it fails.
            });
        }
      } catch (err) {
        if (requestId !== detailRequestIdRef.current) {
          clearStatusPolling();
          return;
        }
        clearStatusPolling();
        setError(err instanceof Error ? err.message : "Failed to load details.");
        pushStatusMessage("Analysis request failed.");
        setChartStatusProgress(100);
      } finally {
        clearStatusPolling();
      }
      if (requestId === detailRequestIdRef.current) {
        setDetailsLoading(false);
        setChartBootstrapComplete(true);
      }
    };

    loadDetails();
  }, [selectedSymbol, timeframe, safetyLossBufferPct]);

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

  useEffect(() => {
    if (!dragMode) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      if (
        (dragMode === "vertical" || dragMode === "left-corner" || dragMode === "right-corner") &&
        layoutRef.current
      ) {
        const rect = layoutRef.current.getBoundingClientRect();
        const next = ((event.clientX - rect.left) / rect.width) * 100;
        setLeftPanePct(Math.max(24, Math.min(62, next)));
      }
      if ((dragMode === "left-horizontal" || dragMode === "left-corner") && leftColumnRef.current) {
        const rect = leftColumnRef.current.getBoundingClientRect();
        const nextBottom = rect.bottom - event.clientY - SPLITTER_PX / 2;
        setLeftBottomPanePx(Math.max(MIN_BOTTOM_PANE_PX, Math.min(MAX_BOTTOM_PANE_PX, nextBottom)));
      }
      if ((dragMode === "right-horizontal" || dragMode === "right-corner") && rightColumnRef.current) {
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
            <span className="summary-item">Score {selectedSignal ? selectedSignal.score.toFixed(1) : "—"}</span>
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
                <strong>{selectedSignal?.actionLine?.toFixed(2) ?? "—"}</strong>
              </article>
              <article className="overview-card">
                <span>Safety Line</span>
                <strong>{selectedSignal?.safetyLine?.toFixed(2) ?? "—"}</strong>
              </article>
              <article className="overview-card">
                <span>Safety-loss</span>
                <strong>{selectedSignal?.safetyLossLine?.toFixed(2) ?? "—"}</strong>
              </article>
              <article className="overview-card">
                <span>Backtest Return</span>
                <strong>{backtest ? `${backtest.totalReturnPct.toFixed(2)}%` : "—"}</strong>
              </article>
              <article className="overview-card">
                <span>Confidence</span>
                <strong>{selectedSignal ? `${selectedSignal.confidence.toFixed(1)}%` : "—"}</strong>
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
                  rows={scannerRows}
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={handleSelectSymbol}
                  loading={scannerLoading}
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
                  className={`splitter splitter-horizontal ${
                    dragMode === "left-horizontal" || dragMode === "left-corner" ? "active" : ""
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setDragMode("left-horizontal");
                  }}
                >
                  <div
                    className={`splitter-corner-handle splitter-corner-left ${
                      dragMode === "left-corner" ? "active" : ""
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragMode("left-corner");
                    }}
                    title="Drag corner to resize both panes"
                  />
                </div>
                <SignalExplanation signal={selectedSignal} loading={detailsLoading && !selectedSignal} />
              </div>
              <div
                className={`splitter splitter-vertical ${
                  dragMode === "vertical" || dragMode === "left-corner" || dragMode === "right-corner"
                    ? "active"
                    : ""
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setDragMode("vertical");
                }}
              />
              <div
                className="right-column"
                ref={rightColumnRef}
                style={{ gridTemplateRows: `minmax(0, 1fr) ${SPLITTER_PX}px ${rightBottomPanePx}px` }}
              >
                <div className="panel chart-panel">
                  <h2 className="title-with-hint">
                    {selectedSymbol ? `${selectedSymbol} Chart Inspection` : "Chart Inspection"}
                    <span className="title-hint">
                      Candles, volume, trend rays, Action/Safety/Safety-Loss lines, and backtest trade markers.
                    </span>
                  </h2>
                  <div className="chart-host">
                    {detailsLoading && !analysis ? (
                      <div className="chart-loading">
                        <div className="wave-loader" role="status" aria-label="Loading chart analysis">
                          <span className="wave-dot" />
                          <span className="wave-dot" />
                          <span className="wave-dot" />
                        </div>
                        <div className="status-wave-text" aria-live="polite">
                          {chartStatusMessage}
                        </div>
                        <div className="chart-progress-track" aria-hidden="true">
                          <span className="chart-progress-fill" style={{ width: `${chartStatusProgress}%` }} />
                        </div>
                        <div className="chart-progress-label">{Math.round(chartStatusProgress)}%</div>
                      </div>
                    ) : (
                      <SymbolChart analysis={analysis} backtestTrades={backtest?.tradeList} />
                    )}
                  </div>
                  {detailsLoading && analysis && (
                    <div className="chart-inline-progress">
                      <div className="status-wave-text">{chartStatusMessage}</div>
                      <div className="chart-progress-track" aria-hidden="true">
                        <span className="chart-progress-fill" style={{ width: `${chartStatusProgress}%` }} />
                      </div>
                      <div className="chart-progress-label">{Math.round(chartStatusProgress)}%</div>
                    </div>
                  )}
                </div>
                <div
                  className={`splitter splitter-horizontal ${
                    dragMode === "right-horizontal" || dragMode === "right-corner" ? "active" : ""
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setDragMode("right-horizontal");
                  }}
                >
                  <div
                    className={`splitter-corner-handle splitter-corner-right ${
                      dragMode === "right-corner" ? "active" : ""
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragMode("right-corner");
                    }}
                    title="Drag corner to resize both panes"
                  />
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
