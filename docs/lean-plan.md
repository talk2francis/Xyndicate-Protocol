# Xyndicate Lean Plan (3-Day Sprint)

## Scope (Non-Negotiable)
- Three-agent pipeline (Oracle -> Strategist -> Executor)
- Decision hash logged on-chain before trade execution (`DecisionLog.sol`)
- One real swap via Onchain OS Trade API + Wallet API
- x402 fee collection (squad enrollment or reasoning unlock)
- Single-page arena dashboard (leaderboard + reasoning log)
- Demo video + README + explorer links

## Timeline
| Day | Focus |
| --- | --- |
| 0 (tonight) | Repo setup, docs, contract + agent scaffolds |
| 1 | Implement + deploy `DecisionLog` & `SeasonManager`, Wallet/x402 hooks |
| 2 | Agent pipeline + Trade API integration, minimal frontend |
| 3 | Polish, x402 gating on reasoning viewer, demo + submission package |

## TODO Kanban
- [ ] Contracts scaffolded (DecisionLog, SeasonManager, Foundry setup)
- [ ] Agent workspace scaffolded (env, shared utils, stub agents)
- [ ] Wallet API/x402 config placeholders
- [ ] Frontend stub (Next/Vite) with basic layout
- [ ] Day 1 tasks (contracts + deployment script)
- [ ] Day 2 tasks (agents + Trade API + UI data fetch)
- [ ] Day 3 tasks (polish + demo + docs)
