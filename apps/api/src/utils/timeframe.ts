import { Timeframe } from "@trader/shared";
import { Timeframe as PrismaTimeframe } from "@prisma/client";

const timeframeToPrismaMap: Record<Timeframe, PrismaTimeframe> = {
  "1Day": PrismaTimeframe.ONE_DAY,
  "4Hour": PrismaTimeframe.FOUR_HOUR,
  "1Hour": PrismaTimeframe.ONE_HOUR,
  "15Min": PrismaTimeframe.FIFTEEN_MIN
};

export function timeframeToPrisma(timeframe: Timeframe): PrismaTimeframe {
  return timeframeToPrismaMap[timeframe];
}

export function parseTimeframe(value: string): Timeframe {
  const valid: Timeframe[] = ["1Day", "4Hour", "1Hour", "15Min"];
  if (!valid.includes(value as Timeframe)) {
    throw new Error(`Unsupported timeframe: ${value}`);
  }

  return value as Timeframe;
}
