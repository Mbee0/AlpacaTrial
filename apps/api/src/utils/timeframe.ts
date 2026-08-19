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
  const normalized = value.trim().replace(/;+$/, "");
  const valid: Timeframe[] = ["1Day", "4Hour", "1Hour", "15Min"];
  if (!valid.includes(normalized as Timeframe)) {
    throw new Error(`Unsupported timeframe: ${value}. Use one of: ${valid.join(", ")}.`);
  }

  return normalized as Timeframe;
}
