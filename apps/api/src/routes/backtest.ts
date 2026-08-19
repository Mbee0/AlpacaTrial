import { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function registerBacktestRoutes(app: FastifyInstance) {
  app.get("/backtest/run", async (request, reply) => {
    const query = backtestSchema.parse(request.query);
    const timeframe = parseTimeframe(query.timeframe);
    const fallbackRange = getDefaultDateRange(timeframe);
    const start = query.start ? new Date(query.start) : fallbackRange.start;
    const end = query.end ? new Date(query.end) : fallbackRange.end;
    let bars;
    try {
      bars = await withTimeout(
        getBars({
          symbol: query.symbol,
          timeframe,
          start,
          end,
          forceRefresh: false
        }),
        env.BACKTEST_BARS_TIMEOUT_MS,
        `Timed out loading bars for backtest after ${Math.round(env.BACKTEST_BARS_TIMEOUT_MS / 1000)}s.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.warn({ symbol: query.symbol, timeframe, error }, "backtest bars timeout/failure");
      return reply.code(504).send({
        symbol: query.symbol,
        timeframe,
        error: "Backtest data load timed out.",
        message
      });
    }

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
