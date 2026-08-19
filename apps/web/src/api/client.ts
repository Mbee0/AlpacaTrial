import {
  BacktestResponse,
  MarketBarsResponse,
  PortfolioSummaryResponse,
  ScannerResponse,
  SymbolAnalysisResponse
} from "../types";

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").trim();

function normalizeBase(base: string) {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

function buildApiBaseCandidates() {
  const normalized = normalizeBase(RAW_API_BASE_URL);
  const candidates = [normalized];
  if (normalized.endsWith("/api")) {
    candidates.push(normalized.slice(0, -4));
  } else {
    candidates.push(`${normalized}/api`);
  }
  candidates.push("/api");
  candidates.push("http://localhost:4000/api");
  return unique(candidates.map(normalizeBase));
}

const API_BASE_CANDIDATES = buildApiBaseCandidates();

async function request<T>(path: string, timeoutMs = 30000): Promise<T> {
  const attemptErrors: string[] = [];

  for (const baseUrl of API_BASE_CANDIDATES) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const target = `${baseUrl}${path}`;
    try {
      const response = await fetch(target, { signal: controller.signal });
      if (!response.ok) {
        const body = await response.text();
        attemptErrors.push(`${target} -> ${response.status} ${body}`);
        if (response.status === 404) {
          continue;
        }
        throw new Error(`API request failed: ${response.status} ${body}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        attemptErrors.push(`${target} -> timed out after ${Math.round(timeoutMs / 1000)}s`);
        continue;
      }
      attemptErrors.push(`${target} -> ${error instanceof Error ? error.message : String(error)}`);
      continue;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error(
    `API request failed after trying ${API_BASE_CANDIDATES.length} base URL(s). ${attemptErrors.join(" | ")}`
  );
}

export function fetchScanner(timeframe: string, limit = 12, concurrency = 4) {
  return request<ScannerResponse>(
    `/analysis/scanner?timeframe=${timeframe}&limit=${limit}&concurrency=${concurrency}`
  );
}

export function fetchSymbolAnalysis(symbol: string, timeframe: string, safetyLossBufferPct: number) {
  return request<SymbolAnalysisResponse>(
    `/analysis/symbol/${symbol}?timeframe=${timeframe}&safetyLossBufferPct=${safetyLossBufferPct}`
  );
}

export function fetchMarketBars(symbol: string, timeframe: string) {
  return request<MarketBarsResponse>(`/market/bars?symbol=${symbol}&timeframe=${timeframe}`);
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
  return request<AnalysisStatusResponse>(`/analysis/status/${encodeURIComponent(requestId)}`, 2500);
}

export function fetchBacktest(symbol: string, timeframe: string) {
  return request<BacktestResponse>(
    `/backtest/run?symbol=${symbol}&timeframe=${timeframe}&startingBalance=10000&riskPct=0.01`
  );
}

export function fetchPortfolioSummary() {
  return request<PortfolioSummaryResponse>("/portfolio/summary");
}
