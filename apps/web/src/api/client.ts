import {
  BacktestResponse,
  MarketBarsResponse,
  PortfolioSummaryResponse,
  ScannerResponse,
  SymbolAnalysisResponse
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

const DEFAULT_TIMEOUT_MS = 20000;

interface RequestOptions {
  timeoutMs?: number;
  allowBaseFallback?: boolean;
}

function buildCandidateBaseUrls(allowBaseFallback = true) {
  const primary = API_BASE_URL.replace(/\/+$/, "");
  if (!allowBaseFallback) {
    return [primary];
  }

  const candidates = [primary];

  if (primary.endsWith("/api")) {
    candidates.push(primary.slice(0, -4));
  } else {
    candidates.push(`${primary}/api`);
  }
  if (!primary.startsWith("http://") && !primary.startsWith("https://")) {
    candidates.push("");
  }

  return Array.from(new Set(candidates));
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts: string[] = [];
  for (const baseUrl of buildCandidateBaseUrls(options.allowBaseFallback ?? true)) {
    const url = baseUrl ? `${baseUrl}${path}` : path;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const body = await response.text();
        attempts.push(`${url} -> ${response.status} ${body}`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        attempts.push(`${url} -> expected JSON but received content-type "${contentType || "unknown"}"`);
        continue;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        attempts.push(`${url} -> timed out after ${timeoutMs}ms`);
      } else {
        attempts.push(`${url} -> ${error instanceof Error ? error.message : "request failed"}`);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error(`API request failed after trying ${attempts.length} base URL(s). ${attempts.join(" | ")}`);
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
  const rangeStartMs = range?.start ? new Date(range.start).getTime() : NaN;
  const rangeEndMs = range?.end ? new Date(range.end).getTime() : NaN;
  const rangeDays =
    Number.isFinite(rangeStartMs) && Number.isFinite(rangeEndMs)
      ? Math.max(1, (rangeEndMs - rangeStartMs) / (24 * 60 * 60 * 1000))
      : 30;
  const timeoutMs = rangeDays > 2000 ? 120000 : rangeDays > 365 ? 90000 : 45000;

  return request<MarketBarsResponse>(`/market/bars?${params.toString()}`, {
    timeoutMs,
    allowBaseFallback: false
  });
}

export function fetchBacktest(symbol: string, timeframe: string) {
  return request<BacktestResponse>(
    `/backtest/run?symbol=${symbol}&timeframe=${timeframe}&startingBalance=10000&riskPct=0.01`
  );
}

export function fetchPortfolioSummary() {
  return request<PortfolioSummaryResponse>("/portfolio/summary");
}
