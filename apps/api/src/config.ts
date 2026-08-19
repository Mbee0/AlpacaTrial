import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_API_SECRET: z.string().optional(),
  ALPACA_DATA_BASE_URL: z.string().default("https://data.alpaca.markets"),
  ALPACA_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(12000),
  SCANNER_SYMBOL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  ANALYSIS_BARS_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20000),
  MARKET_BARS_TIMEOUT_MS: z.coerce.number().int().min(1000).default(12000),
  BACKTEST_BARS_TIMEOUT_MS: z.coerce.number().int().min(1000).default(12000),
  LIVE_TRADING_ENABLED: z.string().default("false"),
  DEFAULT_RISK_PCT: z.coerce.number().default(0.01),
  MAX_POSITION_SIZE: z.coerce.number().default(50000),
  MAX_ORDER_SIZE: z.coerce.number().default(25000),
  MAX_POSITIONS: z.coerce.number().default(8),
  MAX_DAILY_LOSS_PCT: z.coerce.number().default(0.03),
  MAX_DRAWDOWN_PCT: z.coerce.number().default(0.12),
  STOCK_UNIVERSE: z.string().default("AAPL,MSFT,NVDA,AMZN,META,GOOGL,TSLA,AMD,JPM,SPY")
});

export const env = envSchema.parse(process.env);

if (env.LIVE_TRADING_ENABLED.toLowerCase() === "true") {
  throw new Error("LIVE_TRADING_ENABLED must remain false for this milestone.");
}
