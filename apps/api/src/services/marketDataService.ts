import { Timeframe, OhlcvBar } from "@trader/shared";
import { prisma } from "../db.js";
import { timeframeToPrisma } from "../utils/timeframe.js";
import { fetchHistoricalBars } from "./alpacaDataService.js";

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

  const needsFetch = forceRefresh || cachedBars.length < 50;
  if (needsFetch) {
    onProgress?.("Fetching candlestick history from Alpaca...");
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
    onProgress?.("Historical bars ready.");

    return fetchedBars;
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
