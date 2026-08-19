import {
  BacktestResponse,
  MarketBarsResponse,
  PortfolioSummaryResponse,
  ScannerResponse,
  SymbolAnalysisResponse
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`API request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed: ${response.status} ${body}`);
  }

  return response.json() as Promise<T>;
}

export function fetchScanner(timeframe: string) {
  return request<ScannerResponse>(`/analysis/scanner?timeframe=${timeframe}&limit=8`);
}

export function fetchSymbolAnalysis(symbol: string, timeframe: string, safetyLossBufferPct: number) {
  return request<SymbolAnalysisResponse>(
    `/analysis/symbol/${symbol}?timeframe=${timeframe}&safetyLossBufferPct=${safetyLossBufferPct}`
  );
}

export function fetchMarketBars(symbol: string, timeframe: string) {
  const end = new Date();
  const start = new Date(end);
  const lookbackDays =
    timeframe === "1Day" ? 220 : timeframe === "4Hour" ? 100 : timeframe === "1Hour" ? 45 : 14;
  start.setDate(end.getDate() - lookbackDays);
  return request<MarketBarsResponse>(
    `/market/bars?symbol=${symbol}&timeframe=${timeframe}&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    12000
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

export function fetchBacktest(symbol: string, timeframe: string) {
  return request<BacktestResponse>(
    `/backtest/run?symbol=${symbol}&timeframe=${timeframe}&startingBalance=10000&riskPct=0.01`
  );
}

export function fetchPortfolioSummary() {
  return request<PortfolioSummaryResponse>("/portfolio/summary");
}
