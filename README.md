# Xyndicate Protocol

Xyndicate Protocol is an OKX Build X S2 Skills Arena submission built on X Layer mainnet. It ships a live multi-agent trading arena, MCP skill layer, x402-powered strategy licensing, on-chain proof logging, StrategyVault PnL tracking, and a judge-facing Next.js product surface that is fully navigable in production.

## Live URLs

- Production app: `https://xyndicateprotocol.vercel.app`
- MCP server: `https://xyndicateprotocol.vercel.app/api/mcp`
- MCP usage telemetry: `https://xyndicateprotocol.vercel.app/api/mcp-usage`
- Docs live tester: `https://xyndicateprotocol.vercel.app/docs`

## Architecture

- App: `https://xyndicateprotocol.vercel.app`
- Architecture diagram: `https://xyndicateprotocol.vercel.app/docs`
- Demo video: `RECORDING IN PROGRESS`

## Deployed X Layer mainnet contracts

| Contract | Address | Deploy TX |
| --- | --- | --- |
| DecisionLog | `0xC9E69be5ecD65a9106800E07E05eE44a63559F8b` | `0xa067aca1038b431a789fa7a63cafeaee98af52382ef96df00f97e47fdcdc1d34` |
| SeasonManager | `0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1` | season contract in live history |
| SeasonManagerV2 | `0x0E6619188f19872554789a84F6E9150EA7b78d48` | `0xe5023ee0a0074502acea7f0c0e99b00edf82b5d5f21e1faf40d92854b660b32b` |
| StrategyVault | `0x6002767f909B3049d5A65beAD84A843a385a61aC` | `0xe371b795f2ac92d0c7919497f9a8e70f099ff5f1c88088c2c39955d835e0034c` |
| StrategyLicense | `0x8AbaCE8Ea22A591CE3109599449776A2cb96B186` | `0x1ff8a1f8462003b2a17c5acddc5d856199c130b6df9c9fb4dbf6b92e6dfd915d` |
| StrategyRegistry | `0x8d486C3d45dc9C23500e3bF9781124eF149277f0` | `0x6f45d581cc8b7aada8c7199a6cddcc0a4555c74aa39782763b914bc57087f4f9` |

## Product surface

Production pages:
- `/`
- `/arena`
- `/deploy`
- `/market`
- `/economy`
- `/proofs`
- `/docs`

## Agent pipeline

```text
OKX Market API + Uniswap v3 Subgraph
                |
                v
             Oracle
                |
                v
             Analyst
                |
                v
           Strategist
                |
                v
              Router
                |
                v
             Executor
                |
                v
             Narrator
                |
                v
DecisionLog.sol + StrategyVault.sol + public proof artifacts
```

## Uniswap integration

| tool | file | output |
| --- | --- | --- |
| Uniswap v3 Subgraph ETH/USDC pool | `frontend/server/run-cycle-core.ts` Oracle step, `frontend/server/uniswap.mjs`, `frontend/app/api/signal/route.ts` | `spreadBps` + `betterRoute` |

Uniswap integration is surfaced live in:
- Oracle runtime logs
- Arena spread stats
- signal API
- Router/decision route badging
- MCP market signal responses

## MCP skill layer

Confirmed live endpoint:

```bash
curl -X POST https://xyndicateprotocol.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -d '{"tool":"get_market_signal","params":{"pair":"ETH/USDC"}}'
```

Available tools:
- `get_leaderboard`
- `get_market_signal`
- `get_squad_strategy`
- `execute_route_query`
- `get_economy_snapshot`

## S1 → S2 evolution

Season 1 used single-page HTML with 12h scheduler. Season 2 upgrades to multi-page Next.js, dual-squad 30min pipeline, MCP skill layer, real Uniswap v3 integration, and StrategyVault on-chain PnL tracking.

## What judges can verify immediately

- Live dual-squad Arena with server-authoritative cycle state
- Wallet-based Deploy and Market flows on X Layer
- Proofs page with on-chain TX visibility and exportable evidence
- Docs page with live MCP tester and MCP usage telemetry
- Economy page with explicit earn → pay → earn loop visualization
- StrategyVault, StrategyLicense, StrategyRegistry, and SeasonManagerV2 all live on X Layer mainnet

## Repository and live app

- GitHub: `https://github.com/talk2francis/Xyndicate-Protocol`
- Live app: `https://xyndicateprotocol.vercel.app`
