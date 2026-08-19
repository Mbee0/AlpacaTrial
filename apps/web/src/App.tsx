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
const DETAIL_RETRY_THRESHOLD_MS = 12_000;

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
  const [chartBars, setChartBars] = useState<OhlcvBar[]>();
  const [analysis, setAnalysis] = useState<SymbolAnalysisResponse>();
  const [backtest, setBacktest] = useState<BacktestResponse>();
  const [portfolio, setPortfolio] = useState<PortfolioSummaryResponse>();
  const [portfolioError, setPortfolioError] = useState<string>();
  const [scannerLoading, setScannerLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string>();
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [chartError, setChartError] = useState<string>();
  const [chartStatusMessage, setChartStatusMessage] = useState("Preparing chart analysis...");
  const [showDetailRetryPrompt, setShowDetailRetryPrompt] = useState(false);
  const [detailFetchElapsedSec, setDetailFetchElapsedSec] = useState(0);
  const [detailRefreshCounter, setDetailRefreshCounter] = useState(0);
  const [error, setError] = useState<string>();
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [leftPanePct, setLeftPanePct] = useState(38);
  const [leftBottomPanePx, setLeftBottomPanePx] = useState(250);
  const [rightBottomPanePx, setRightBottomPanePx] = useState(230);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const scannerCacheRef = useRef<Map<string, ScannerRow[]>>(new Map());
  const barsCacheRef = useRef<Map<string, OhlcvBar[]>>(new Map());
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
        if (scanner.rows.length === 0 && scanner.diagnostics && scanner.diagnostics.length > 0) {
          setError(scanner.diagnostics.join(" "));
        } else {
          setError(undefined);
        }
      } catch (err) {
        if (!cachedRows) {
          setError(err instanceof Error ? err.message : "Failed to load scanner.");
        }
      }
      setScannerLoading(false);
    };

    loadScanner();
  }, [timeframe, refreshCounter]);

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
      const barsKey = `${selectedSymbol}:${timeframe}`;
      const cacheKey = `${selectedSymbol}:${timeframe}:${bufferPct.toFixed(4)}`;
      const backtestKey = `${selectedSymbol}:${timeframe}`;
      const cachedBars = barsCacheRef.current.get(barsKey);
      const cachedAnalysis = analysisCacheRef.current.get(cacheKey);
      const cachedBacktest = backtestCacheRef.current.get(backtestKey);
      if (cachedBars) {
        setChartBars(cachedBars);
      } else {
        setChartBars(undefined);
      }
      if (cachedAnalysis) {
        setAnalysis(cachedAnalysis);
        setChartBars(cachedAnalysis.bars);
      } else {
        setAnalysis(undefined);
      }
      if (cachedBacktest) {
        setBacktest(cachedBacktest);
      } else {
        setBacktest(undefined);
      }

      setDetailsLoading(true);
      setBacktestLoading(!cachedBacktest);
      setBacktestError(undefined);
      setChartError(undefined);
      setChartStatusMessage("Preparing chart analysis...");
      setShowDetailRetryPrompt(false);
      setDetailFetchElapsedSec(0);
      let statusPollTimer: number | undefined;
      let retryPromptTimer: number | undefined;
      let elapsedTimer: number | undefined;
      const startedAt = Date.now();
      const clearStatusPolling = () => {
        if (statusPollTimer) {
          window.clearInterval(statusPollTimer);
          statusPollTimer = undefined;
        }
      };
      const clearRequestTimers = () => {
        clearStatusPolling();
        if (retryPromptTimer) {
          window.clearTimeout(retryPromptTimer);
          retryPromptTimer = undefined;
        }
        if (elapsedTimer) {
          window.clearInterval(elapsedTimer);
          elapsedTimer = undefined;
        }
      };
      const pollStatus = async () => {
        try {
          const status = await fetchAnalysisStatus(statusRequestId);
          if (requestId !== detailRequestIdRef.current) {
            return;
          }
          if (status.state !== "unknown") {
            setChartStatusMessage(status.message);
          }
        } catch {
          // Ignore transient status polling failures while main request is in-flight.
        }
      };

      try {
        let barsForChart = cachedBars ?? cachedAnalysis?.bars;
        if (!barsForChart || barsForChart.length === 0) {
          setChartStatusMessage("Fetching candlestick history...");
          const barsResponse = await fetchMarketBars(selectedSymbol, timeframe);
          if (requestId !== detailRequestIdRef.current) {
            return;
          }
          barsForChart = barsResponse.bars;
          barsCacheRef.current.set(barsKey, barsForChart);
          setChartBars(barsForChart);
        } else {
          barsCacheRef.current.set(barsKey, barsForChart);
          setChartBars(barsForChart);
        }
        if (!barsForChart || barsForChart.length === 0) {
          throw new Error(`No historical bars available for ${selectedSymbol} on ${timeframe}.`);
        }

        setChartStatusMessage("Candles loaded. Computing trendlines...");
        statusPollTimer = window.setInterval(pollStatus, 450);
        void pollStatus();
        elapsedTimer = window.setInterval(() => {
          if (requestId !== detailRequestIdRef.current) {
            return;
          }
          setDetailFetchElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        retryPromptTimer = window.setTimeout(() => {
          if (requestId !== detailRequestIdRef.current) {
            return;
          }
          setShowDetailRetryPrompt(true);
        }, DETAIL_RETRY_THRESHOLD_MS);

        const analysisResponse = await fetchSymbolAnalysisWithRequestId(
          selectedSymbol,
          timeframe,
          bufferPct,
          statusRequestId
        );
        if (requestId !== detailRequestIdRef.current) {
          clearRequestTimers();
          return;
        }
        clearRequestTimers();
        analysisCacheRef.current.set(cacheKey, analysisResponse);
        barsCacheRef.current.set(barsKey, analysisResponse.bars);
        setAnalysis(analysisResponse);
        setChartBars(analysisResponse.bars);
        setError(undefined);
        setChartError(undefined);
        setChartStatusMessage("Chart analysis complete.");
        setShowDetailRetryPrompt(false);
        setDetailFetchElapsedSec(0);

        if (!cachedBacktest) {
          setBacktestLoading(true);
          void fetchBacktest(selectedSymbol, timeframe)
            .then((backtestResponse) => {
              if (requestId !== detailRequestIdRef.current) {
                return;
              }
              backtestCacheRef.current.set(backtestKey, backtestResponse);
              setBacktest(backtestResponse);
              setBacktestError(undefined);
            })
            .catch((err) => {
              if (requestId !== detailRequestIdRef.current) {
                return;
              }
              setBacktestError(err instanceof Error ? err.message : "Backtest request failed.");
            })
            .finally(() => {
              if (requestId === detailRequestIdRef.current) {
                setBacktestLoading(false);
              }
            });
        } else {
          setBacktestLoading(false);
        }
      } catch (err) {
        if (requestId !== detailRequestIdRef.current) {
          clearRequestTimers();
          return;
        }
        clearRequestTimers();
        setBacktestLoading(false);
        const message = err instanceof Error ? err.message : "Failed to load details.";
        setError(message);
        setChartError(message);
        setChartStatusMessage("Analysis request failed.");
        setShowDetailRetryPrompt(true);
      } finally {
        clearRequestTimers();
      }
      if (requestId === detailRequestIdRef.current) {
        setDetailsLoading(false);
      }
    };

    loadDetails();
  }, [selectedSymbol, timeframe, safetyLossBufferPct, detailRefreshCounter]);

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

  const handleRetryDetails = () => {
    setShowDetailRetryPrompt(false);
    setDetailFetchElapsedSec(0);
    setChartError(undefined);
    setDetailRefreshCounter((value) => value + 1);
  };

  const chartFallbackMessage = useMemo(() => {
    if (!selectedSymbol) {
      return "No symbol selected yet. Choose a symbol in Market Scanner or search for one to load the chart.";
    }
    if (chartError) {
      return `Chart load failed for ${selectedSymbol}: ${chartError}`;
    }
    return `No chart data loaded for ${selectedSymbol} yet. Click Retry chart fetch.`;
  }, [chartError, selectedSymbol]);

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
                    {!chartBars && detailsLoading ? (
                      <div className="chart-loading">
                        <div className="wave-loader" role="status" aria-label="Loading chart analysis">
                          <span className="wave-dot" />
                          <span className="wave-dot" />
                          <span className="wave-dot" />
                        </div>
                        <div className="status-wave-text" aria-live="polite">
                          {chartStatusMessage}
                        </div>
                      </div>
                    ) : chartBars && chartBars.length > 0 ? (
                      <SymbolChart
                        bars={chartBars}
                        trendlines={analysis?.trendlines}
                        backtestTrades={backtest?.tradeList}
                      />
                    ) : (
                      <div className="chart-empty-state">
                        <p>{chartFallbackMessage}</p>
                        {selectedSymbol && (
                          <button type="button" className="chart-retry-button" onClick={handleRetryDetails}>
                            Retry chart fetch
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {detailsLoading && chartBars && chartBars.length > 0 && (
                    <div className="chart-analysis-row">Chart loaded. {chartStatusMessage}</div>
                  )}
                  {showDetailRetryPrompt && (
                    <div className="chart-retry-row">
                      <span>
                        {detailsLoading
                          ? `Still fetching after ${detailFetchElapsedSec}s.`
                          : "Latest fetch did not complete."}
                      </span>
                      <button type="button" className="chart-retry-button" onClick={handleRetryDetails}>
                        Retry chart fetch
                      </button>
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
                <BacktestSummary backtest={backtest} loading={backtestLoading && !backtest} error={backtestError} />
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
