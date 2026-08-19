import { useEffect, useMemo, useRef, useState } from "react";
import { ScannerRow, Timeframe } from "@trader/shared";
import {
  fetchBacktest,
  fetchPortfolioSummary,
  fetchScanner,
  fetchSymbolAnalysis
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
const APP_STATE_KEY = "trader-ui-state-v1";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [timeframe, setTimeframe] = useState<Timeframe>("1Hour");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [safetyLossBufferPct, setSafetyLossBufferPct] = useState(1);
  const [scannerRows, setScannerRows] = useState<ScannerRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>();
  const [analysis, setAnalysis] = useState<SymbolAnalysisResponse>();
  const [backtest, setBacktest] = useState<BacktestResponse>();
  const [portfolio, setPortfolio] = useState<PortfolioSummaryResponse>();
  const [portfolioError, setPortfolioError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshCounter, setRefreshCounter] = useState(0);
  const scannerCacheRef = useRef<Map<string, ScannerRow[]>>(new Map());
  const analysisCacheRef = useRef<Map<string, SymbolAnalysisResponse>>(new Map());
  const backtestCacheRef = useRef<Map<string, BacktestResponse>>(new Map());
  const detailRequestIdRef = useRef(0);

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
    } catch {
      // Ignore invalid persisted UI state.
    }
  }, []);

  useEffect(() => {
    const payload = {
      timeframe,
      selectedSymbol,
      safetyLossBufferPct,
      scannerRows: scannerRows.slice(0, 50)
    };
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(payload));
  }, [timeframe, selectedSymbol, safetyLossBufferPct, scannerRows]);

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

      setLoading(true);
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
      setLoading(false);
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

      setLoading(true);
      try {
        const [analysisResponse, backtestResponse] = await Promise.all([
          fetchSymbolAnalysis(selectedSymbol, timeframe, bufferPct),
          fetchBacktest(selectedSymbol, timeframe)
        ]);
        if (requestId !== detailRequestIdRef.current) {
          return;
        }
        analysisCacheRef.current.set(cacheKey, analysisResponse);
        backtestCacheRef.current.set(backtestKey, backtestResponse);
        setAnalysis(analysisResponse);
        setBacktest(backtestResponse);
        setError(undefined);
      } catch (err) {
        if (requestId !== detailRequestIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load details.");
      }
      if (requestId === detailRequestIdRef.current) {
        setLoading(false);
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

  return (
    <main className="app app-shell">
      <header className="app-header glass">
        <div>
          <h1>Trendline Research & Paper-Trading Platform</h1>
          <p>LIVE TRADING DISABLED · Stage 2 Focus: responsive UI, progressive rays, explainable data dictionary.</p>
        </div>
        <div className="header-right">
          <nav className="menu-tabs">
            <button
              type="button"
              className={viewMode === "dashboard" ? "active" : ""}
              onClick={() => setViewMode("dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={viewMode === "portfolio" ? "active" : ""}
              onClick={() => setViewMode("portfolio")}
            >
              Portfolio
            </button>
            <button
              type="button"
              className={viewMode === "help" ? "active" : ""}
              onClick={() => setViewMode("help")}
            >
              Help
            </button>
          </nav>

          <div className="controls">
            <label htmlFor="timeframe">Timeframe</label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value as Timeframe)}
            >
              {timeframeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label htmlFor="safetyLossBufferPct">Safety-loss %</label>
            <input
              id="safetyLossBufferPct"
              type="number"
              min={0.1}
              max={20}
              step={0.1}
              value={safetyLossBufferPct}
              onChange={(event) => setSafetyLossBufferPct(Number(event.target.value) || 1)}
            />

            <input
              type="text"
              value={searchSymbol}
              placeholder="Search symbol (e.g. AAPL)"
              onChange={(event) => setSearchSymbol(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearchSubmit();
                }
              }}
            />
            <button type="button" onClick={handleSearchSubmit}>
              Load Symbol
            </button>
            <button type="button" onClick={() => setRefreshCounter((value) => value + 1)}>
              Refresh Scanner
            </button>
          </div>
        </div>
      </header>

      {viewMode === "dashboard" && (
        <>
          {error && <div className="error">{error}</div>}
          {loading && <div className="loading">Loading analysis...</div>}
          <section className="overview-strip">
            <article className="overview-card">
              <span>Selected Symbol</span>
              <strong>{selectedSymbol ?? "—"}</strong>
            </article>
            <article className="overview-card">
              <span>Signal</span>
              <strong>{selectedSignal?.signal ?? "—"}</strong>
            </article>
            <article className="overview-card">
              <span>Strategy Score</span>
              <strong>{selectedSignal ? selectedSignal.score.toFixed(1) : "—"}</strong>
            </article>
            <article className="overview-card">
              <span>Trend</span>
              <strong>{selectedSignal?.trendDirection ?? "—"}</strong>
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
          <section className="layout">
            <div className="left-column">
              <ScannerTable rows={scannerRows} selectedSymbol={selectedSymbol} onSelectSymbol={handleSelectSymbol} />
              <SignalExplanation signal={selectedSignal} />
            </div>
            <div className="right-column">
              <div className="panel chart-panel">
                <h2>{selectedSymbol ? `${selectedSymbol} Chart Inspection` : "Chart Inspection"}</h2>
                <p className="muted">
                  Candles, volume, progressive bullish/bearish rays, Action Line, Safety Line, Safety-Loss Line, and backtest trade markers.
                </p>
                <div className="chart-host">
                  <SymbolChart analysis={analysis} backtestTrades={backtest?.tradeList} />
                </div>
              </div>
              <BacktestSummary backtest={backtest} />
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
    </main>
  );
}
