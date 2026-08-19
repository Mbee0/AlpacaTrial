import { FastifyInstance } from "fastify";
import { z } from "zod";
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

export async function registerMarketRoutes(app: FastifyInstance) {
  app.get("/market/bars", async (request, reply) => {
    const query = barsQuerySchema.parse(request.query);
    const timeframe = parseTimeframe(query.timeframe);
    const defaults = getDefaultDateRange(timeframe);
    const start = query.start ? new Date(query.start) : defaults.start;
    const end = query.end ? new Date(query.end) : defaults.end;

    const bars = await getBars({
      symbol: query.symbol,
      timeframe,
      start,
      end,
      forceRefresh: query.forceRefresh === "true"
    });

    return reply.send({
      symbol: query.symbol,
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      bars
    });
  });
}
