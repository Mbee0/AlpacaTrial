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
}): Promise<OhlcvBar[]> {
  const { symbol, timeframe, start, end, forceRefresh = false } = params;
  const asset = await ensureAsset(symbol);
  const tf = timeframeToPrisma(timeframe);

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
    const fetchedBars = await fetchHistoricalBars({ symbol, timeframe, start, end });
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

    return fetchedBars;
  }

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
