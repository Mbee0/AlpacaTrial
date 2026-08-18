import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeSymbol, scannerRowFromSignal } from "../strategy/strategyEngine.js";
import { getDefaultDateRange } from "../services/alpacaDataService.js";
import { getBars, listUniverseSymbols } from "../services/marketDataService.js";
import { parseTimeframe } from "../utils/timeframe.js";

export async function registerAnalysisRoutes(app: FastifyInstance) {
  app.get("/analysis/symbol/:symbol", async (request) => {
    const params = z.object({ symbol: z.string().min(1) }).parse(request.params);
    const query = z.object({ timeframe: z.string().default("1Hour") }).parse(request.query);
    const timeframe = parseTimeframe(query.timeframe);
    const symbol = params.symbol.toUpperCase();
    const { start, end } = getDefaultDateRange(timeframe);
    const bars = await getBars({ symbol, timeframe, start, end });
    const analysis = analyzeSymbol({ symbol, timeframe, bars });
    const lastPrice = bars[bars.length - 1]?.close ?? 0;

    return {
      symbol,
      timeframe,
      lastPrice,
      bars,
      swings: analysis.swings,
      trendlines: analysis.trendlines,
      signal: analysis.signal,
      scannerRow: scannerRowFromSignal({ signal: analysis.signal, lastPrice })
    };
  });

  app.get("/analysis/scanner", async (request) => {
    const query = z
      .object({
        timeframe: z.string().default("1Hour"),
        symbols: z.string().optional(),
        limit: z.coerce.number().default(30)
      })
      .parse(request.query);

    const timeframe = parseTimeframe(query.timeframe);
    const { start, end } = getDefaultDateRange(timeframe);
    const sourceSymbols = query.symbols
      ? query.symbols.split(",").map((symbol) => symbol.trim().toUpperCase())
      : await listUniverseSymbols();

    const rows = [];
    for (const symbol of sourceSymbols.slice(0, query.limit)) {
      try {
        const bars = await getBars({ symbol, timeframe, start, end });
        if (bars.length < 100) {
          continue;
        }

        const analysis = analyzeSymbol({ symbol, timeframe, bars });
        rows.push(scannerRowFromSignal({ signal: analysis.signal, lastPrice: bars[bars.length - 1].close }));
      } catch (error) {
        request.log.warn({ symbol, error }, "scanner symbol failed");
      }
    }

    return {
      timeframe,
      count: rows.length,
      rows: rows.sort((a, b) => b.score - a.score)
    };
  });
}
