import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerMarketRoutes } from "./routes/market.js";
import { registerAnalysisRoutes } from "./routes/analysis.js";
import { registerBacktestRoutes } from "./routes/backtest.js";
import { registerPortfolioRoutes } from "./routes/portfolio.js";

export async function createApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({
    status: "ok",
    liveTradingEnabled: false
  }));

  await app.register(async (instance) => {
    await registerMarketRoutes(instance);
    await registerAnalysisRoutes(instance);
    await registerBacktestRoutes(instance);
    await registerPortfolioRoutes(instance);
  }, { prefix: "/api" });

  return app;
}
