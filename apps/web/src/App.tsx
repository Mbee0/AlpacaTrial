import { useEffect, useMemo, useState } from "react";
import { ScannerRow, Timeframe } from "@trader/shared";
import { fetchBacktest, fetchScanner, fetchSymbolAnalysis } from "./api/client";
import { BacktestSummary } from "./components/BacktestSummary";
import { ScannerTable } from "./components/ScannerTable";
import { SignalExplanation } from "./components/SignalExplanation";
import { SymbolChart } from "./components/SymbolChart";
import { BacktestResponse, SymbolAnalysisResponse } from "./types";
import "./styles.css";

const timeframeOptions: Timeframe[] = ["1Day", "4Hour", "1Hour", "15Min"];

export default function App() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1Hour");
  const [scannerRows, setScannerRows] = useState<ScannerRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>();
  const [analysis, setAnalysis] = useState<SymbolAnalysisResponse>();
  const [backtest, setBacktest] = useState<BacktestResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const selectedSignal = useMemo(
    () => scannerRows.find((row) => row.symbol === selectedSymbol),
    [scannerRows, selectedSymbol]
  );

  useEffect(() => {
    const loadScanner = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const scanner = await fetchScanner(timeframe);
        setScannerRows(scanner.rows);
        if (!selectedSymbol && scanner.rows.length > 0) {
          setSelectedSymbol(scanner.rows[0].symbol);
        } else if (selectedSymbol && !scanner.rows.some((row) => row.symbol === selectedSymbol)) {
          setSelectedSymbol(scanner.rows[0]?.symbol);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scanner.");
      } finally {
        setLoading(false);
      }
    };

    loadScanner();
  }, [timeframe, selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol) {
      return;
    }

    const loadDetails = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const [analysisResponse, backtestResponse] = await Promise.all([
          fetchSymbolAnalysis(selectedSymbol, timeframe),
          fetchBacktest(selectedSymbol, timeframe)
        ]);
        setAnalysis(analysisResponse);
        setBacktest(backtestResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load details.");
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [selectedSymbol, timeframe]);

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Trendline Research & Paper-Trading Platform</h1>
          <p>LIVE TRADING DISABLED · Stage 1 Focus: historical analysis, explainable scanner, chart overlays.</p>
        </div>
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
          <button type="button" onClick={() => setSelectedSymbol(selectedSymbol)}>
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Loading analysis...</div>}

      <section className="layout">
        <div className="left-column">
          <ScannerTable rows={scannerRows} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} />
          <SignalExplanation signal={selectedSignal} />
        </div>
        <div className="right-column">
          <div className="panel chart-panel">
            <h2>Chart Inspection</h2>
            <p className="muted">Candles, volume, trendline candidates, Action Line, Safety Line, and historical backtest trades.</p>
            <div className="chart-host">
              <SymbolChart analysis={analysis} backtestTrades={backtest?.tradeList} />
            </div>
          </div>
          <BacktestSummary backtest={backtest} />
        </div>
      </section>
    </main>
  );
}
