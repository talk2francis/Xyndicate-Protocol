# Xyndicate Protocol

Xyndicate Protocol is a Skills Arena submission for OKX Build X S2, built as a multi-agent autonomous trading system on X Layer. The project combines market intelligence, agent collaboration, on-chain proof logging, and emerging skill interfaces into a single product surface: an agent squad that reads market data, reasons through strategy, routes execution decisions, and records its actions on-chain for transparent verification.

## Architecture Overview

```text
OKX Market API + Uniswap AI Skills
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
DecisionLog.sol + StrategyVault.sol
```

## Deployment Addresses

| Contract | Address | Status |
| --- | --- | --- |
| DecisionLog | `0xC9E69be5ecD65a9106800E07E05eE44a63559F8b` | Live on X Layer mainnet |
| SeasonManager | `0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1` | Live on X Layer mainnet |
| StrategyVault | `0x6002767f909B3049d5A65beAD84A843a385a61aC` | Live on X Layer mainnet |
| StrategyLicense | `0x8AbaCE8Ea22A591CE3109599449776A2cb96B186` | Live on X Layer mainnet |

## Onchain OS Skills Usage

| API name | file used in | what it does |
| --- | --- | --- |
| OKX Market API | `frontend/api/run-cycle.js`, `agents/src/agents/oracle.ts` | Pulls live market ticker data that seeds the Oracle stage of each decision cycle. |
| OKX Onchain OS client | `agents/src/lib/onchainOs.ts` | Creates signed OKX API clients for authenticated Onchain OS requests. |
| OKX Wallet API | `agents/src/services/wallet.ts`, `agents/src/scripts/enrollSquad.ts` | Provisions squad wallets and supports agent enrollment and wallet-linked flows. |
| x402 payment rail | `agents/src/services/wallet.ts`, `scripts/x402-entry.js`, `contracts/src/SeasonManager.sol` | Handles gated entry/payment flows tied to season participation and paid unlock mechanics. |
| OKX DEX / execution hooks | `scripts/executor-swap.js` | Prepares authenticated execution requests for swap and route-related actions. |

## Uniswap AI Skills Usage

Uniswap integration is currently in progress and is part of the target submission state.

| tool name | file used in | what it does |
| --- | --- | --- |
| market signal enrichment | `TBD` | Will augment Oracle inputs with Uniswap-aware market intelligence before strategist reasoning. |
| route intelligence | `TBD` | Will help the Router select execution paths before handing off to the Executor. |
| liquidity context | `TBD` | Will supply additional DEX-side context for strategy quality and execution safety. |
| trade path support | `TBD` | Will support the future execution stack once Uniswap AI Skills are wired into the live pipeline. |

## MCP Skill Documentation

MCP server status: live.

Install command:

```bash
curl -fsSL https://xyndicateprotocol.vercel.app/install.sh | bash
```

Available tools:
- `get_leaderboard`
- `get_market_signal`
- `get_squad_strategy` (license gated via StrategyLicense on X Layer)
- `execute_route_query`

## Team

Solo builder:
- `@talk2francis`
- `@xyndicatepro`

## Scoring Criteria

**Onchain OS / Uniswap integration**
Xyndicate already uses OKX market and wallet-related infrastructure in the live codebase, with x402-linked payment logic and execution hooks present across the agent and scripting layers. The next submission milestone extends that foundation by wiring Uniswap AI Skills into the Oracle and Router path so market sensing and route planning become richer and more defensible.

**X Layer ecosystem**
The protocol is built directly around X Layer deployment and verification. Decision logging already runs against a live X Layer contract, season logic is anchored in `SeasonManager`, and the product story is centered on persistent on-chain proof rather than simulated agent output. This keeps the project native to the ecosystem instead of merely integrating it at the edge.

**AI interactive experience**
Xyndicate is designed as an interpretable agent product, not just a backend automation script. The user-facing experience surfaces strategy outputs, reasoning context, execution traces, and proof artifacts in a way that makes the AI system inspectable. The upcoming multi-page frontend and MCP skill layer push this further by making the system queryable, explorable, and useful to judges and users in real time.

**Product completeness**
The project already spans contracts, agents, API routes, scheduler automation, proof storage, and a live frontend deployment. The roadmap to submission is not a greenfield concept but an expansion of an existing working system. That improves product completeness because each remaining milestone, including the Router, MCP server, and new contracts, is being added onto a verifiable operational base.

## Live Demo

https://xyndicateprotocol.vercel.app

## Demo Video

[PENDING]
