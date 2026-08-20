import { Timeframe } from "@trader/shared";

const timeframeToPrismaMap = {
  "1Day": "ONE_DAY",
  "4Hour": "FOUR_HOUR",
  "1Hour": "ONE_HOUR",
  "15Min": "FIFTEEN_MIN"
} as const satisfies Record<Timeframe, string>;

export type PrismaTimeframe = (typeof timeframeToPrismaMap)[Timeframe];

const validTimeframes: Timeframe[] = ["1Day", "4Hour", "1Hour", "15Min"];

function normalizeTimeframe(raw: string): string {
  return raw.trim().replace(/;+$/g, "");
}

export function timeframeToPrisma(timeframe: Timeframe): PrismaTimeframe {
  return timeframeToPrismaMap[timeframe];
}

export function parseTimeframe(value: string): Timeframe {
  const normalized = normalizeTimeframe(value);
  if (!validTimeframes.includes(normalized as Timeframe)) {
    throw new Error(`Unsupported timeframe: ${value}`);
  }

  return normalized as Timeframe;
}
