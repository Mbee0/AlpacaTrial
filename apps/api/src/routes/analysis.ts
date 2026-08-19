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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
      const bars = await getBars({
        symbol,
        timeframe,
        start,
        end,
        onProgress: requestId ? (message) => updateAnalysisStatus(requestId, message) : undefined
      });
      requestId && updateAnalysisStatus(requestId, "Detecting swing points...");
      const analysis = analyzeSymbol({
        symbol,
        timeframe,
        bars,
        safetyLossBufferPct: query.safetyLossBufferPct
      });
      requestId && updateAnalysisStatus(requestId, "Scoring rays and selecting action/safety lines...");
      const lastPrice = bars[bars.length - 1]?.close ?? 0;
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

  app.get("/analysis/scanner", async (request, reply) => {
    const query = z
      .object({
        timeframe: z.string().default("1Hour"),
        symbols: z.string().optional(),
        limit: z.coerce.number().default(30)
      })
      .parse(request.query);

    const timeframe = parseTimeframe(query.timeframe);
    const { start, end } = getDefaultDateRange(timeframe);
    let sourceSymbols: string[];
    try {
      sourceSymbols = query.symbols
        ? query.symbols.split(",").map((symbol) => symbol.trim().toUpperCase())
        : await listUniverseSymbols();
    } catch (error) {
      const message = errorMessage(error);
      request.log.error({ error }, "scanner universe resolution failed");
      return reply.code(503).send({
        timeframe,
        count: 0,
        rows: [],
        diagnostics: [
          "Scanner could not load symbol universe from the local database.",
          "Check DATABASE_URL, run migrations, and confirm PostgreSQL is reachable.",
          `Details: ${message}`
        ]
      });
    }

    if (sourceSymbols.length === 0) {
      return reply.send({
        timeframe,
        count: 0,
        rows: [],
        diagnostics: [
          "No active symbols found in the database.",
          "Run `npm run db:seed` to load starter symbols."
        ]
      });
    }

    const rows = [];
    const failures: Array<{ symbol: string; message: string }> = [];
    for (const symbol of sourceSymbols.slice(0, query.limit)) {
      try {
        const bars = await getBars({ symbol, timeframe, start, end });
        if (bars.length < 100) {
          continue;
        }

        const analysis = analyzeSymbol({ symbol, timeframe, bars, safetyLossBufferPct: 0.01 });
        rows.push(scannerRowFromSignal({ signal: analysis.signal, lastPrice: bars[bars.length - 1].close }));
      } catch (error) {
        const message = errorMessage(error);
        failures.push({ symbol, message });
        request.log.warn({ symbol, error }, "scanner symbol failed");
      }
    }

    const diagnostics: string[] = [];
    if (rows.length === 0 && failures.length > 0) {
      diagnostics.push("Scanner attempted symbols but all analyses failed.");
      if (failures.some((failure) => failure.message.includes("Alpaca API credentials missing"))) {
        diagnostics.push("Set ALPACA_API_KEY and ALPACA_API_SECRET in apps/api/.env.");
      }
    }
    if (rows.length === 0 && failures.length === 0) {
      diagnostics.push("No symbols had enough bar history for scoring in the selected window.");
    }

    return {
      timeframe,
      count: rows.length,
      rows: rows.sort((a, b) => b.score - a.score),
      diagnostics,
      failures: failures.slice(0, 5)
    };
  });
}
