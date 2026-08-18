import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { fetchBacktest, fetchScanner, fetchSymbolAnalysis } from "./api/client";
import { BacktestSummary } from "./components/BacktestSummary";
import { ScannerTable } from "./components/ScannerTable";
import { SignalExplanation } from "./components/SignalExplanation";
import { SymbolChart } from "./components/SymbolChart";
import "./styles.css";
const timeframeOptions = ["1Day", "4Hour", "1Hour", "15Min"];
export default function App() {
    const [timeframe, setTimeframe] = useState("1Hour");
    const [scannerRows, setScannerRows] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState();
    const [analysis, setAnalysis] = useState();
    const [backtest, setBacktest] = useState();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState();
    const selectedSignal = useMemo(() => scannerRows.find((row) => row.symbol === selectedSymbol), [scannerRows, selectedSymbol]);
    useEffect(() => {
        const loadScanner = async () => {
            setLoading(true);
            setError(undefined);
            try {
                const scanner = await fetchScanner(timeframe);
                setScannerRows(scanner.rows);
                if (!selectedSymbol && scanner.rows.length > 0) {
                    setSelectedSymbol(scanner.rows[0].symbol);
                }
                else if (selectedSymbol && !scanner.rows.some((row) => row.symbol === selectedSymbol)) {
                    setSelectedSymbol(scanner.rows[0]?.symbol);
                }
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load scanner.");
            }
            finally {
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
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load details.");
            }
            finally {
                setLoading(false);
            }
        };
        loadDetails();
    }, [selectedSymbol, timeframe]);
    return (_jsxs("main", { className: "app", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { children: [_jsx("h1", { children: "Trendline Research & Paper-Trading Platform" }), _jsx("p", { children: "LIVE TRADING DISABLED \u00B7 Stage 1 Focus: historical analysis, explainable scanner, chart overlays." })] }), _jsxs("div", { className: "controls", children: [_jsx("label", { htmlFor: "timeframe", children: "Timeframe" }), _jsx("select", { id: "timeframe", value: timeframe, onChange: (event) => setTimeframe(event.target.value), children: timeframeOptions.map((option) => (_jsx("option", { value: option, children: option }, option))) }), _jsx("button", { type: "button", onClick: () => setSelectedSymbol(selectedSymbol), children: "Refresh" })] })] }), error && _jsx("div", { className: "error", children: error }), loading && _jsx("div", { className: "loading", children: "Loading analysis..." }), _jsxs("section", { className: "layout", children: [_jsxs("div", { className: "left-column", children: [_jsx(ScannerTable, { rows: scannerRows, selectedSymbol: selectedSymbol, onSelectSymbol: setSelectedSymbol }), _jsx(SignalExplanation, { signal: selectedSignal })] }), _jsxs("div", { className: "right-column", children: [_jsxs("div", { className: "panel", children: [_jsx("h2", { children: "Chart Inspection" }), _jsx("p", { className: "muted", children: "Candles, volume, trendline candidates, Action Line, Safety Line, and historical backtest trades." }), _jsx(SymbolChart, { analysis: analysis, backtestTrades: backtest?.tradeList })] }), _jsx(BacktestSummary, { backtest: backtest })] })] })] }));
}
