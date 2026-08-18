import { FastifyInstance } from "fastify";
import { env } from "../config.js";
import { prisma } from "../db.js";

export async function registerPortfolioRoutes(app: FastifyInstance) {
  app.get("/portfolio/summary", async () => {
    const latest = await prisma.portfolioSnapshot.findFirst({
      where: { executionMode: "PAPER" },
      orderBy: { observedAt: "desc" }
    });
    const positions = await prisma.positionSnapshot.findMany({
      orderBy: { observedAt: "desc" },
      take: 50,
      include: { asset: true }
    });

    return {
      liveTradingEnabled: false,
      riskControls: {
        defaultRiskPct: env.DEFAULT_RISK_PCT,
        maxPositionSize: env.MAX_POSITION_SIZE,
        maxOrderSize: env.MAX_ORDER_SIZE,
        maxPositions: env.MAX_POSITIONS,
        maxDailyLossPct: env.MAX_DAILY_LOSS_PCT,
        maxDrawdownPct: env.MAX_DRAWDOWN_PCT
      },
      latestSnapshot: latest,
      positions: positions.map((position) => ({
        symbol: position.asset.symbol,
        side: position.side,
        qty: position.qty,
        avgEntryPrice: position.avgEntryPrice,
        currentPrice: position.markPrice,
        marketValue: position.marketValue,
        unrealizedPnl: position.unrealizedPnl,
        realizedPnl: position.realizedPnl,
        stop: position.stopPrice,
        riskAmount: position.riskAmount,
        observedAt: position.observedAt
      }))
    };
  });
}
