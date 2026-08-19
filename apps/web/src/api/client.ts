import {
  BacktestResponse,
  MarketBarsResponse,
  PortfolioSummaryResponse,
  ScannerResponse,
  SymbolAnalysisResponse
} from "../types";

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

export function fetchSymbolAnalysis(symbol: string, timeframe: string, safetyLossBufferPct: number) {
  return request<SymbolAnalysisResponse>(
    `/analysis/symbol/${symbol}?timeframe=${timeframe}&safetyLossBufferPct=${safetyLossBufferPct}`
  );
}

export interface AnalysisStatusResponse {
  requestId: string;
  state: "queued" | "running" | "completed" | "failed" | "unknown";
  message: string;
  updatedAtMs: number;
}

export function fetchSymbolAnalysisWithRequestId(
  symbol: string,
  timeframe: string,
  safetyLossBufferPct: number,
  requestId: string
) {
  return request<SymbolAnalysisResponse>(
    `/analysis/symbol/${symbol}?timeframe=${timeframe}&safetyLossBufferPct=${safetyLossBufferPct}&requestId=${encodeURIComponent(requestId)}`
  );
}

export function fetchAnalysisStatus(requestId: string) {
  return request<AnalysisStatusResponse>(`/analysis/status/${encodeURIComponent(requestId)}`);
}

export function fetchMarketBars(
  symbol: string,
  timeframe: string,
  range?: {
    start?: string;
    end?: string;
  }
) {
  const params = new URLSearchParams({
    symbol,
    timeframe
  });
  if (range?.start) {
    params.set("start", range.start);
  }
  if (range?.end) {
    params.set("end", range.end);
  }
  return request<MarketBarsResponse>(`/market/bars?${params.toString()}`);
}

export function fetchBacktest(symbol: string, timeframe: string) {
  return request<BacktestResponse>(
    `/backtest/run?symbol=${symbol}&timeframe=${timeframe}&startingBalance=10000&riskPct=0.01`
  );
}

export function fetchPortfolioSummary() {
  return request<PortfolioSummaryResponse>("/portfolio/summary");
}
