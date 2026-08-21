import { FastifyInstance } from "fastify";
import { z } from "zod";
import { StrategySettingsInput } from "@trader/shared";
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

const strategySettingsSchema = z.object({
  weights: z
    .object({
      trendStrength: z.coerce.number().optional(),
      trendlineQuality: z.coerce.number().optional(),
      breakoutStrength: z.coerce.number().optional(),
      volumeConfirmation: z.coerce.number().optional(),
      multiTimeframeAlignment: z.coerce.number().optional(),
      volatilitySuitability: z.coerce.number().optional(),
      riskReward: z.coerce.number().optional()
    })
    .partial()
    .optional(),
  thresholds: z
    .object({
      longScore: z.coerce.number().optional(),
      shortScore: z.coerce.number().optional(),
      breakoutScore: z.coerce.number().optional(),
      watchScore: z.coerce.number().optional(),
      watchConfidencePenalty: z.coerce.number().optional()
    })
    .partial()
    .optional()
});

function parseStrategySettings(raw: string | undefined): StrategySettingsInput | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    const validated = strategySettingsSchema.parse(parsed);
    return validated;
  } catch {
    return undefined;
  }
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

  app.get("/analysis/symbol/:symbol", async (request, reply) => {
    const params = z.object({ symbol: z.string().min(1) }).parse(request.params);
    const query = z
      .object({
        timeframe: z.string().default("1Hour"),
        safetyLossBufferPct: z.coerce.number().default(0.01),
        adjustment: z.enum(["raw", "split", "all"]).default("raw"),
        start: z.string().optional(),
        end: z.string().optional(),
        strategySettings: z.string().optional(),
        requestId: z.string().optional()
      })
      .parse(request.query);
    const strategySettings = parseStrategySettings(query.strategySettings);
    const timeframe = parseTimeframe(query.timeframe);
    const symbol = params.symbol.toUpperCase();
    const fallbackRange = getDefaultDateRange(timeframe);
    const start = query.start ? new Date(query.start) : fallbackRange.start;
    const end = query.end ? new Date(query.end) : fallbackRange.end;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return reply.status(400).send({
        message: "Invalid start/end range supplied for analysis request."
      });
    }
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
        adjustment: query.adjustment,
        onProgress: requestId ? (message) => updateAnalysisStatus(requestId, message) : undefined
      });
      requestId && updateAnalysisStatus(requestId, "Detecting swing points...");
      const analysis = analyzeSymbol({
        symbol,
        timeframe,
        bars,
        safetyLossBufferPct: query.safetyLossBufferPct,
        strategySettings
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

  app.get("/analysis/scanner", async (request) => {
    const query = z
      .object({
        timeframe: z.string().default("1Hour"),
        symbols: z.string().optional(),
        adjustment: z.enum(["raw", "split", "all"]).default("raw"),
        strategySettings: z.string().optional(),
        limit: z.coerce.number().default(30)
      })
      .parse(request.query);

    const strategySettings = parseStrategySettings(query.strategySettings);
    const timeframe = parseTimeframe(query.timeframe);
    const { start, end } = getDefaultDateRange(timeframe);
    const sourceSymbols = query.symbols
      ? query.symbols.split(",").map((symbol) => symbol.trim().toUpperCase())
      : await listUniverseSymbols();

    const rows = [];
    for (const symbol of sourceSymbols.slice(0, query.limit)) {
      try {
        const bars = await getBars({ symbol, timeframe, start, end, adjustment: query.adjustment });
        if (bars.length < 100) {
          continue;
        }

        const analysis = analyzeSymbol({
          symbol,
          timeframe,
          bars,
          safetyLossBufferPct: 0.01,
          strategySettings
        });
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
