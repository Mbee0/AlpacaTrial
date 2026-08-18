const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
async function request(path) {
    const response = await fetch(`${API_BASE_URL}${path}`);
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`API request failed: ${response.status} ${body}`);
    }
    return response.json();
}
export function fetchScanner(timeframe) {
    return request(`/analysis/scanner?timeframe=${timeframe}`);
}
export function fetchSymbolAnalysis(symbol, timeframe) {
    return request(`/analysis/symbol/${symbol}?timeframe=${timeframe}`);
}
export function fetchBacktest(symbol, timeframe) {
    return request(`/backtest/run?symbol=${symbol}&timeframe=${timeframe}&startingBalance=10000&riskPct=0.01`);
}
