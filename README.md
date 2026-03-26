# Xyndicate Protocol (Lean Build)

Mission: deliver a proof-of-concept multi-agent arena on X Layer in 3 days.

This repo hosts:
- `docs/` — lean plan + architecture
- `contracts/` — `DecisionLog` + `SeasonManager`
- `agents/` — three-agent pipeline (Oracle → Strategist → Executor)
- `frontend/` — minimal arena dashboard (to be scaffolded Day 2)

Track progress in `docs/lean-plan.md`.

## Wallet + x402 Flow (WIP)
1. Copy `.env.example` to `.env` and fill the OKX/Onchain OS credentials + contract addresses.
2. Install agent deps: `cd agents && npm install` (already done once).
3. Run `npm run enroll` from `agents/` to trigger wallet provisioning → x402 entry fee → `SeasonManager.enroll`.
4. Check explorer for the `SquadEnrolled` event + entry payment log.

> NOTE: Requires real OKX Onchain OS project credentials and a funded x402 workspace.
