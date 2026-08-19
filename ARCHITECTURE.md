# Trendline Research Platform Architecture (Milestone 1)

## Goal

Build an explainable trading-research and paper-trading platform around trendline strategy logic while keeping **live trading disabled** by default.

## Safety Stages

1. **Backtesting only** (current focus)
2. Real-time market analysis + paper account read/write
3. Fully automated paper trading
4. Live trading only by explicit, guarded enablement

## System Layout

- `apps/api`:
  - Market-data ingestion/cache from Alpaca historical bars
  - Strategy engine (swing points, trendline candidates, Action/Safety Lines, scoring)
  - Scanner, per-symbol analysis, and backtesting APIs
  - Risk-control configuration and portfolio endpoints
- `apps/web`:
  - Scanner table (ranked opportunities)
  - Symbol detail chart with candles, volume, trendlines, Action/Safety Lines
  - Backtest summary and trade overlays
  - Signal explanation panel with score breakdown
- `apps/api/prisma/schema.prisma`:
  - Normalized persistent schema for assets, bars, swing points, trendlines, signals, orders, trades, positions, and portfolio snapshots

## Data Flow

1. Request scanner/analysis/backtest for symbol(s)
2. API reads cached bars from PostgreSQL
3. Missing bars fetched from Alpaca and upserted
4. Strategy engine computes structure:
   - Swing highs/lows
   - Trend direction (HH/HL vs LH/LL)
   - Candidate trendlines + scores
   - Action and Safety lines
5. Signal score and explanation emitted to frontend
6. Backtest replays chronologically to avoid look-ahead bias

## Point-in-Time Integrity

- Bars are stored by `(asset, timeframe, timestamp)` with immutable timestamps
- Signals include `observedAt` and `modelVersion`
- Position and portfolio snapshots are timestamped for audit and replay

## Current Limitations (expected for Milestone 1)

- Real-time WebSocket ingestion not wired yet
- Paper order execution pipeline not wired yet
- Backtester currently long-first and simplified transaction model
- No benchmark comparison module yet (buy-and-hold/momentum to be added next)

## Incremental Next Steps

1. Add WebSocket stream ingestion (same normalized bar pipeline)
2. Persist computed swings/trendlines/signals
3. Add robust multi-timeframe consensus scoring
4. Add portfolio/risk engine with broker reconciliation loops
5. Implement guarded paper execution with kill-switch and hard caps
