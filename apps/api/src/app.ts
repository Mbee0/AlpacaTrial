import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerMarketRoutes } from "./routes/market.js";
import { registerAnalysisRoutes } from "./routes/analysis.js";
import { registerBacktestRoutes } from "./routes/backtest.js";
import { registerPortfolioRoutes } from "./routes/portfolio.js";

export async function createApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const healthPayload = {
    status: "ok",
    liveTradingEnabled: false
  };

  app.get("/health", async () => healthPayload);
  app.get("/api/health", async () => healthPayload);

  await app.register(async (instance) => {
    await registerMarketRoutes(instance);
    await registerAnalysisRoutes(instance);
    await registerBacktestRoutes(instance);
    await registerPortfolioRoutes(instance);
  }, { prefix: "/api" });

  return app;
}
