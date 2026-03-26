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

## Status (March 26)
- ✅ DecisionLog contract deployed to X Layer mainnet (`0xC9E69be5ecD65a9106800E07E05eE44a63559F8b`).
- ✅ Agent decision recorded on-chain via `logDecision` (proves Oracle→Analyst→Strategist→Executor reasoning).
- ✅ Self-transfer proof TX to confirm wallet control.
- ✅ Wallet/x402 client + enrollment CLI scaffolded.
- ✅ Oracle / Strategist / Executor modules wired together.
- ⏳ Trade API execution + arena UI in progress.

### On-Chain Proofs
| Proof | Hash | Link |
| --- | --- | --- |
| Wallet funding | `0x8883af1b0...f5a8` | https://www.oklink.com/xlayer/tx/0x8883af1b0a659d5e1c0beff2ed5c34c4a8497427e9a84a0348ba1e38aa36f5a8 |
| Self-transfer (wallet control) | `0xa203c67d3a...3a7` | https://www.oklink.com/xlayer/tx/0xa203c67d3ac2ec36680580e488d299598b80b008fdba779cac3294f9d85003a7 |
| DecisionLog deploy | `0xa067aca103...d34` | https://www.oklink.com/xlayer/tx/0xa067aca1038b431a789fa7a63cafeaee98af52382ef96df00f97e47fdcdc1d34 |
| logDecision call | `0x335f27337c...0123` | https://www.oklink.com/xlayer/tx/0x335f27337c75547ce5f47562dd0d02563ecb04951bc596283ee41b7e3e500123 |

### Repo Layout
```
contracts/        // Hardhat project (DecisionLog, SeasonManager)
agents/           // Oracle → Strategist → Executor pipeline scaffolds
scripts/          // RPC utilities (self-transfer proof, etc.)
docs/             // Lean build plan + context
frontend/         // UI scaffold placeholder
```

## Running the Proof Scripts

### 1. Self-transfer proof (`scripts/get-tx-proof.js`)
```bash
cp .env.example .env  # fill SYNDICATE_MNEMONIC or PRIVATE_KEY + XLAYER_RPC
SYNDICATE_MNEMONIC="..." node scripts/get-tx-proof.js
```
Outputs wallet balance + TX hash proving control.

### 2. Deploy DecisionLog to X Layer
```bash
cd contracts
cp .env.example .env  # fill SYNDICATE_PRIVATE_KEY + X_LAYER_RPC
SYNDICATE_PRIVATE_KEY=0x... X_LAYER_RPC=https://rpc.xlayer.tech npx hardhat run scripts/deploy-decisionlog.ts --network xlayer
```

### 3. Log an agent decision
```bash
cd contracts
SYNDICATE_PRIVATE_KEY=0x... DECISION_LOG_ADDRESS=0x... X_LAYER_RPC=https://rpc.xlayer.tech npx hardhat run scripts/log-decision.ts --network xlayer
```

## Next Steps
- Integrate Wallet/x402 client with live Trade API once wallet IDs are exposed.
- Build arena dashboard with your mockups + x402 gated reasoning viewer.
- Expand agent prompts/personas and add Narrator module for spectator feed.

## Agents (v0)
| Agent | Repo path | Status |
| --- | --- | --- |
| Oracle | `agents/src/agents/oracle.ts` | Fetch scaffold ready; waits for Wallet/Market API credentials. |
| Strategist | `agents/src/agents/strategist.ts` | GPT-4.1 mini reasoning + DecisionLog logging (active). |
| Executor | `agents/src/agents/executor.ts` | Trade API stub ready; pending walletId exposure to hit live endpoint. |

`agents/src/index.ts` wires the 3-agent loop; swap execution is paused until the Wallet API returns walletId metadata. Decision hashes are already logged on-chain via the Strategist (proof above).

## Wallet/x402 Status
- `agents/src/lib/onchainOs.ts` – signed OKX client (API key + secret + passphrase).
- `agents/src/services/wallet.ts` – wallet creation + x402 payment helpers.
- `agents/src/scripts/enrollSquad.ts` – CLI: create wallet → pay entry → call `SeasonManager.enroll`.
- `.env.example` contains all required env vars; README retains the step-by-step instructions.

Pending unblock: Onchain OS currently requires a `walletId` in the Trade API payloads. Once we can fetch that ID (or OKX exposes it via API/UI) the CLI can run end-to-end with no further code changes.
