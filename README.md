# Alpaca Trendline Research Platform

This repository now contains an incremental foundation for a web-based trading research and paper-trading application based on top-down trendline analysis.

## What is implemented in this milestone

- Monorepo with:
  - `apps/api` (Fastify + Prisma + strategy engine)
  - `apps/web` (React + TypeScript + Lightweight Charts)
  - `packages/shared` (shared strategy/data types)
- PostgreSQL schema for:
  - assets, bars, swing points, trendlines, signals
  - broker orders, fills/trades, positions, portfolio snapshots
- Alpaca historical market-data ingestion + local cache in PostgreSQL
- Strategy engine that:
  - detects swing highs/lows
  - classifies trend direction
  - generates/scoring trendline candidates
  - selects Action and Safety Lines
  - emits explainable LONG/SHORT/WATCH/HOLD signals with breakdown
- Scanner endpoint that ranks symbols by strategy score
- Backtest endpoint (long-first implementation) with trade list and metrics
- Interactive frontend dashboard with:
  - scanner table
  - detailed chart (candles + volume + trendline overlays)
  - backtest summary
  - signal explanation panel
- Hard safety default:
  - `LIVE_TRADING_ENABLED=false` (startup fails if set to true)

## Project structure

```text
apps/
  api/
  web/
packages/
  shared/
ARCHITECTURE.md
docker-compose.yml
```

## Quick start

### 1) Start PostgreSQL

```bash
docker compose up -d postgres
```

### 2) Install dependencies

```bash
npm install
```

### 3) Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Add your Alpaca API keys in `apps/api/.env`.

### 4) Generate Prisma client + migrate + seed

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 5) Run API + web

In separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:5173`.

## API endpoints (current)

- `GET /health`
- `GET /api/market/bars`
- `GET /api/analysis/scanner`
- `GET /api/analysis/symbol/:symbol`
- `GET /api/backtest/run`
- `GET /api/portfolio/summary`

## Safety model

- Live trading is disabled by default and intentionally blocked in this milestone.
- Architecture separates:
  - historical analysis/backtesting
  - real-time analysis
  - paper execution
  - future live trading

## Next milestones

1. Real-time Alpaca WebSocket ingestion
2. Persistent signal/trendline history and journaling
3. Paper account order execution + broker reconciliation
4. Expanded risk engine and kill-switch controls
5. Baseline comparisons (buy-and-hold, momentum) and walk-forward analysis
