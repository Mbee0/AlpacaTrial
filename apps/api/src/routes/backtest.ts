import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDefaultDateRange } from "../services/alpacaDataService.js";
import { runBacktest } from "../services/backtestService.js";
import { getBars } from "../services/marketDataService.js";
import { parseTimeframe } from "../utils/timeframe.js";

const backtestSchema = z.object({
  symbol: z.string().min(1).transform((value) => value.toUpperCase()),
  timeframe: z.string().default("1Hour"),
  start: z.string().optional(),
  end: z.string().optional(),
  startingBalance: z.coerce.number().default(10000),
  riskPct: z.coerce.number().default(0.01),
  slippagePct: z.coerce.number().default(0.0005),
  feePerTrade: z.coerce.number().default(1)
});

export async function registerBacktestRoutes(app: FastifyInstance) {
  app.get("/backtest/run", async (request) => {
    const query = backtestSchema.parse(request.query);
    const timeframe = parseTimeframe(query.timeframe);
    const fallbackRange = getDefaultDateRange(timeframe);
    const start = query.start ? new Date(query.start) : fallbackRange.start;
    const end = query.end ? new Date(query.end) : fallbackRange.end;
    const bars = await getBars({
      symbol: query.symbol,
      timeframe,
      start,
      end,
      forceRefresh: false
    });

    const result = runBacktest({
      symbol: query.symbol,
      timeframe,
      bars,
      startingBalance: query.startingBalance,
      riskPct: query.riskPct,
      slippagePct: query.slippagePct,
      feePerTrade: query.feePerTrade
    });

    return {
      symbol: query.symbol,
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      ...result
    };
  });
}
