import axios, { AxiosResponse } from "axios";
import { addDays } from "date-fns";
import { OhlcvBar, Timeframe } from "@trader/shared";
import { env } from "../config.js";

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaBarsResponse {
  bars: AlpacaBar[];
  symbol: string;
  next_page_token?: string | null;
}

const hasCredentials = Boolean(env.ALPACA_API_KEY && env.ALPACA_API_SECRET);

const alpacaClient = axios.create({
  baseURL: env.ALPACA_DATA_BASE_URL,
  headers: hasCredentials
    ? {
        "APCA-API-KEY-ID": env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET
      }
    : undefined
});

function normalizeBar(symbol: string, bar: AlpacaBar): OhlcvBar {
  return {
    symbol,
    timestamp: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v
  };
}

export async function fetchHistoricalBars(params: {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
}): Promise<OhlcvBar[]> {
  if (!hasCredentials) {
    throw new Error("Alpaca API credentials missing. Set ALPACA_API_KEY and ALPACA_API_SECRET.");
  }

  const { symbol, timeframe, start, end } = params;
  const bars: OhlcvBar[] = [];
  let nextToken: string | undefined | null = undefined;

  do {
    const response: AxiosResponse<AlpacaBarsResponse> = await alpacaClient.get(`/v2/stocks/${symbol}/bars`, {
      params: {
        timeframe,
        start: start.toISOString(),
        end: end.toISOString(),
        limit: 10000,
        adjustment: "raw",
        feed: "iex",
        page_token: nextToken ?? undefined
      }
    });

    const payload: AlpacaBarsResponse = response.data;
    payload.bars.forEach((bar: AlpacaBar) => bars.push(normalizeBar(symbol, bar)));
    nextToken = payload.next_page_token;
  } while (nextToken);

  return bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function getDefaultDateRange(timeframe: Timeframe) {
  const end = new Date();
  const lookbackByTimeframe: Record<Timeframe, number> = {
    "1Day": 365,
    "4Hour": 180,
    "1Hour": 120,
    "15Min": 30
  };

  const start = addDays(end, -lookbackByTimeframe[timeframe]);
  return { start, end };
}
