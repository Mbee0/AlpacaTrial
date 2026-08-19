import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeSymbol, scannerRowFromSignal } from "../strategy/strategyEngine.js";
import { getDefaultDateRange } from "../services/alpacaDataService.js";
import {
  completeAnalysisStatus,
  failAnalysisStatus,
  getAnalysisStatus,
  initAnalysisStatus,
  updateAnalysisStatus
} from "../services/analysisStatusService.js";
import { getBars, listUniverseSymbols } from "../services/marketDataService.js";
import { parseTimeframe } from "../utils/timeframe.js";

export async function registerAnalysisRoutes(app: FastifyInstance) {
  app.get("/analysis/status/:requestId", async (request, reply) => {
    const params = z.object({ requestId: z.string().min(1) }).parse(request.params);
    const status = getAnalysisStatus(params.requestId);
    if (!status) {
      return reply.send({
        requestId: params.requestId,
        state: "unknown",
        message: "No status available yet.",
        updatedAtMs: Date.now()
      });
    }

    return reply.send(status);
  });

  app.get("/analysis/symbol/:symbol", async (request) => {
    const params = z.object({ symbol: z.string().min(1) }).parse(request.params);
    const query = z
      .object({
        timeframe: z.string().default("1Hour"),
        safetyLossBufferPct: z.coerce.number().default(0.01),
        requestId: z.string().optional()
      })
      .parse(request.query);
    const timeframe = parseTimeframe(query.timeframe);
    const symbol = params.symbol.toUpperCase();
    const { start, end } = getDefaultDateRange(timeframe);
    const requestId = query.requestId;
    if (requestId) {
      initAnalysisStatus(requestId, "Starting symbol analysis...");
    }

    try {
      requestId && updateAnalysisStatus(requestId, "Fetching candlestick history...");
      const bars = await getBars({
        symbol,
        timeframe,
        start,
        end,
        onProgress: requestId ? (message) => updateAnalysisStatus(requestId, message) : undefined
      });
      requestId && updateAnalysisStatus(requestId, "Candlestick history loaded. Detecting swing points...");
      const analysis = analyzeSymbol({
        symbol,
        timeframe,
        bars,
        safetyLossBufferPct: query.safetyLossBufferPct
      });
      requestId && updateAnalysisStatus(requestId, "Scoring rays and selecting action/safety lines...");
      const lastPrice = bars[bars.length - 1]?.close ?? 0;
      requestId && updateAnalysisStatus(requestId, "Finalizing chart payload...");
      requestId && completeAnalysisStatus(requestId, "Chart analysis complete.");

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
    } catch (error) {
      requestId && failAnalysisStatus(requestId, "Analysis failed while loading or scoring data.");
      throw error;
    }
  });

  app.get("/analysis/scanner", async (request) => {
    const query = z
      .object({
        timeframe: z.string().default("1Hour"),
        symbols: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(8)
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

        const analysis = analyzeSymbol({ symbol, timeframe, bars, safetyLossBufferPct: 0.01 });
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
