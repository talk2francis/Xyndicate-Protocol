# xyndicate-strategy-skill

MCP server package for the Xyndicate Protocol Skills Arena submission.

## Install

```bash
cd mcp
npm install
```

## Tools

### get_leaderboard
Returns public squad leaderboard data from frontend deployment artifacts.

### get_market_signal
Returns OKX plus Uniswap-style market signal data for requested pairs.

### get_squad_strategy
Returns licensed squad strategy config when the caller is licensed via StrategyLicense.

### execute_route_query
Compares OKX and Uniswap route outputs for a token pair and amount.

## Deployment

Primary live path is exposed through the existing Vercel project at `/api/mcp`.
