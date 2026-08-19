import { Timeframe, OhlcvBar } from "@trader/shared";
import { prisma } from "../db.js";
import { timeframeToPrisma } from "../utils/timeframe.js";
import { fetchHistoricalBars } from "./alpacaDataService.js";

function timeframeMs(timeframe: Timeframe) {
  if (timeframe === "15Min") {
    return 15 * 60 * 1000;
  }
  if (timeframe === "1Hour") {
    return 60 * 60 * 1000;
  }
  if (timeframe === "4Hour") {
    return 4 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

function dedupeSortedBars(bars: OhlcvBar[]) {
  const byTimestamp = new Map<string, OhlcvBar>();
  for (const bar of bars) {
    byTimestamp.set(bar.timestamp, bar);
  }
  return Array.from(byTimestamp.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

async function ensureAsset(symbol: string) {
  return prisma.asset.upsert({
    where: { symbol },
    update: {},
    create: {
      symbol,
      isActive: true,
      isShortable: true
    }
  });
}

export async function getBars(params: {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end: Date;
  forceRefresh?: boolean;
  onProgress?: (message: string) => void;
}): Promise<OhlcvBar[]> {
  const { symbol, timeframe, start, end, forceRefresh = false, onProgress } = params;
  onProgress?.("Resolving asset metadata...");
  const asset = await ensureAsset(symbol);
  const tf = timeframeToPrisma(timeframe);

  onProgress?.("Checking local historical cache...");
  const cachedBars = await prisma.marketBar.findMany({
    where: {
      assetId: asset.id,
      timeframe: tf,
      timestamp: { gte: start, lte: end }
    },
    orderBy: { timestamp: "asc" }
  });

  const intervalMs = timeframeMs(timeframe);
  const requestedStartMs = start.getTime();
  const requestedEndMs = end.getTime();
  const cachedStartMs = cachedBars[0]?.timestamp.getTime();
  const cachedEndMs = cachedBars[cachedBars.length - 1]?.timestamp.getTime();
  const historicalWindowClosed = requestedEndMs < Date.now() - intervalMs * 8;
  const missingStartCoverage =
    cachedBars.length === 0 || !cachedStartMs || cachedStartMs > requestedStartMs + intervalMs * 2;
  const missingEndCoverage =
    historicalWindowClosed && (cachedBars.length === 0 || !cachedEndMs || cachedEndMs < requestedEndMs - intervalMs * 2);
  const needsFetch = forceRefresh || missingStartCoverage || missingEndCoverage;
  if (needsFetch) {
    onProgress?.("Requesting missing bars from Alpaca...");
    const fetchedBars = await fetchHistoricalBars({ symbol, timeframe, start, end });
    onProgress?.("Persisting bars to local database...");
    await prisma.$transaction(
      fetchedBars.map((bar) =>
        prisma.marketBar.upsert({
          where: {
            assetId_timeframe_timestamp: {
              assetId: asset.id,
              timeframe: tf,
              timestamp: new Date(bar.timestamp)
            }
          },
          update: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume
          },
          create: {
            assetId: asset.id,
            timeframe: tf,
            timestamp: new Date(bar.timestamp),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume
          }
        })
      )
    );
    const mergedBars = dedupeSortedBars([
      ...cachedBars.map((bar) => ({
        symbol,
        timestamp: bar.timestamp.toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      })),
      ...fetchedBars
    ]);
    const mergedStartMs = new Date(mergedBars[0]?.timestamp ?? 0).getTime();
    if (Number.isFinite(mergedStartMs) && mergedStartMs > requestedStartMs + intervalMs * 2) {
      onProgress?.(
        `History is source-limited for this request. Earliest available bar: ${mergedBars[0]?.timestamp?.slice(0, 10) ?? "unknown"}.`
      );
    } else {
      onProgress?.("Historical bars ready.");
    }

    return mergedBars;
  }

  onProgress?.("Using local cached bars.");

  return cachedBars.map((bar) => ({
    symbol,
    timestamp: bar.timestamp.toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume
  }));
}

export async function listUniverseSymbols() {
  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    orderBy: { symbol: "asc" },
    take: 300
  });

  return assets.map((asset) => asset.symbol);
}
