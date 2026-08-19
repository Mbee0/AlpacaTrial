import { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { getDefaultDateRange } from "../services/alpacaDataService.js";
import { getBars } from "../services/marketDataService.js";
import { parseTimeframe } from "../utils/timeframe.js";

const barsQuerySchema = z.object({
  symbol: z.string().min(1).transform((value) => value.toUpperCase()),
  timeframe: z.string().default("1Hour"),
  start: z.string().optional(),
  end: z.string().optional(),
  forceRefresh: z.string().optional()
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

export async function registerMarketRoutes(app: FastifyInstance) {
  app.get("/market/bars", async (request, reply) => {
    const query = barsQuerySchema.parse(request.query);
    const timeframe = parseTimeframe(query.timeframe);
    const defaults = getDefaultDateRange(timeframe);
    const start = query.start ? new Date(query.start) : defaults.start;
    const end = query.end ? new Date(query.end) : defaults.end;

    let bars;
    try {
      bars = await withTimeout(
        getBars({
          symbol: query.symbol,
          timeframe,
          start,
          end,
          forceRefresh: query.forceRefresh === "true"
        }),
        env.MARKET_BARS_TIMEOUT_MS,
        `Timed out loading market bars after ${Math.round(env.MARKET_BARS_TIMEOUT_MS / 1000)}s.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.warn({ symbol: query.symbol, timeframe, error }, "market bars timeout/failure");
      return reply.code(504).send({
        symbol: query.symbol,
        timeframe,
        error: "Market bars request timed out.",
        message
      });
    }

    return reply.send({
      symbol: query.symbol,
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      bars
    });
  });
}
