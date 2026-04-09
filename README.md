# Xyndicate Protocol

Xyndicate Protocol is a Skills Arena submission for OKX Build X S2, built as a multi-agent autonomous trading system on X Layer. The project combines market intelligence, agent collaboration, on-chain proof logging, and emerging skill interfaces into a single product surface: an agent squad that reads market data, reasons through strategy, routes execution decisions, and records its actions on-chain for transparent verification. As of submission, the project is early-stage and not yet star-driven on GitHub, so positioning is based on shipped product depth, live contracts, and end-to-end judge-verifiable flows rather than repository social proof.

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
| StrategyRegistry | `0x8d486C3d45dc9C23500e3bF9781124eF149277f0` | Live on X Layer mainnet |
| SeasonManagerV2 | `0x0E6619188f19872554789a84F6E9150EA7b78d48` | Live on X Layer mainnet |

## Onchain OS Skills Usage

| API name | file used in | what it does |
| --- | --- | --- |
| OKX Market API | `frontend/api/run-cycle.js`, `agents/src/agents/oracle.ts` | Pulls live market ticker data that seeds the Oracle stage of each decision cycle. |
| OKX Onchain OS client | `agents/src/lib/onchainOs.ts` | Creates signed OKX API clients for authenticated Onchain OS requests. |
| OKX Wallet API | `agents/src/services/wallet.ts`, `agents/src/scripts/enrollSquad.ts` | Provisions squad wallets and supports agent enrollment and wallet-linked flows. |
| x402 payment rail | `agents/src/services/wallet.ts`, `scripts/x402-entry.js`, `contracts/src/SeasonManager.sol` | Handles gated entry/payment flows tied to season participation and paid unlock mechanics. |
| OKX DEX / execution hooks | `scripts/executor-swap.js` | Prepares authenticated execution requests for swap and route-related actions. |

## Uniswap AI Skills Usage

Uniswap-aware signal enrichment is live in the submission runtime path and is exposed through the market signal / routing surfaces.

| tool name | file used in | what it does |
| --- | --- | --- |
| market signal enrichment | `frontend/server/run-cycle-core.ts`, `frontend/app/api/signal/route.ts` | Augments Oracle output with Uniswap-aware price context and spread calculations alongside OKX pricing. |
| route intelligence | `agents/src/agents/router.ts`, `frontend/server/run-cycle-core.ts` | Helps the Router select execution path recommendations before handoff to execution. |
| liquidity context | `frontend/app/api/mcp/route.ts`, `mcp/src/index.ts` | Supplies DEX-side context and pair normalization for live signal and MCP responses. |
| trade path support | `frontend/server/mcp-route.ts`, `frontend/app/api/mcp/route.ts` | Supports route-query responses for assistant and demo execution flows. |

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

To be inserted once the final recorded demo is uploaded.
