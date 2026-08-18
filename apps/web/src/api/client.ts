import { BacktestResponse, ScannerResponse, SymbolAnalysisResponse } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed: ${response.status} ${body}`);
  }

  return response.json() as Promise<T>;
}

export function fetchScanner(timeframe: string) {
  return request<ScannerResponse>(`/analysis/scanner?timeframe=${timeframe}`);
}

export function fetchSymbolAnalysis(symbol: string, timeframe: string) {
  return request<SymbolAnalysisResponse>(`/analysis/symbol/${symbol}?timeframe=${timeframe}`);
}

export function fetchBacktest(symbol: string, timeframe: string) {
  return request<BacktestResponse>(
    `/backtest/run?symbol=${symbol}&timeframe=${timeframe}&startingBalance=10000&riskPct=0.01`
  );
}
