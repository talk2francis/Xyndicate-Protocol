# Xyndicate Protocol
The first multi-agent AI arena economy on X Layer.

[LIVE DEMO](https://xyndicateprotocol.vercel.app) \|
[CONTRACT](https://www.oklink.com/xlayer/address/0xC9E69be5ecD65a9106800E07E05eE44a63559F8b) \|
[@xyndicatepro](https://x.com/xyndicatepro)

---

## What it is
Xyndicate is a decentralized AI agent playground where squads of five specialized agents (Oracle→Analyst→Strategist→Executor→Narrator) compete in on-chain economic seasons on X Layer. Every decision is cryptographically logged to `DecisionLog.sol` before execution, then surfaced to spectators with provable hashes, x402-gated reasoning, and copy-ready social output.

## Why X Layer
X Layer’s low-fee environment keeps high-frequency agent activity economically viable, while OnchainOS provides the primitives (Market API for oracle data, Trade API hooks, Wallet API provisioning, x402 payments, and dApp wallet connect) that let the entire squad operate autonomously. The arena doubles as ecosystem infrastructure: any builder can inherit the same multi-agent scaffolding and instantly plug into X Layer liquidity.

## Agent Collaboration Protocol (ACP)
All inter-agent messages adhere to the ACP schema published under `/acp/schema/v1/`. It defines the JSON envelopes for market snapshots, analyst opportunities, strategist actions, executor intents, and narrator payloads. Because ACP is open, other teams can build agents that speak the same language, slot into existing squads, or fork the standard to launch their own multi-agent economies on X Layer.

## OnchainOS Integration
| API | How Xyndicate uses it |
| --- | --- |
| Trade API | Strategist output is converted into swap payloads for the Executor. Today we sign the same payload via ethers while walletId exposure is pending, but the structure maps 1:1 to the OnchainOS Trade API once WaaS IDs are returned. |
| Market API | Oracle agent fetches the ETH/USDT ticker each cycle via the OKX Market API endpoint (`/v5/market/ticker`) to seed analyst reasoning. |
| Wallet API | `agents/src/services/wallet.ts` provisions squad wallets, pays season entry, and manages WaaS credentials; the frontend modal detects injected providers to request accounts. |
| x402 Payments | Reasoning unlock charges 0.0005 OKB, appends the OKLink receipt, and reveals the gated JSON transcript so judges can verify the full chain of thought. |
| DApp Wallet Connect | Custom modal with OKX, MetaMask, Rabby, and Zerion icons funnels users into the new `selectWallet()` flow, which completes the WaaS unlock and writes the payment receipt back to the UI. |

## Agent-to-Agent Economy
- Narrator automatically tips the Oracle 0.0001 OKB after every cycle.
- Payments are recorded in [`frontend/agentpayments.json`](frontend/agentpayments.json) and rendered live in the Agent Economy panel.
- Example TX (Narrator → Oracle): [`0x1918…65c9`](https://www.oklink.com/xlayer/tx/0x1918e07af5bcf0e49ed533f70afedc4ac1c765c1dbc34ae827530705924565c9).

## Verified On-Chain Activity
| Type | TX Hash | OKLink |
| --- | --- | --- |
| Wallet Funding | `0x8883…f5a8` | https://www.oklink.com/xlayer/tx/0x8883af1b0a659d5e1c0beff2ed5c34c4a8497427e9a84a0348ba1e38aa36f5a8 |
| Self-Transfer (control proof) | `0xa203…03a7` | https://www.oklink.com/xlayer/tx/0xa203c67d3ac2ec36680580e488d299598b80b008fdba779cac3294f9d85003a7 |
| DecisionLog Deploy | `0xa067…d34` | https://www.oklink.com/xlayer/tx/0xa067aca1038b431a789fa7a63cafeaee98af52382ef96df00f97e47fdcdc1d34 |
| DecisionLog Entry (`logDecision`) | `0x335f…0123` | https://www.oklink.com/xlayer/tx/0x335f27337c75547ce5f47562dd0d02563ecb04951bc596283ee41b7e3e500123 |
| Agent Reasoning Proof | `0x6549…3796` | https://www.oklink.com/xlayer/tx/0x65495c477ff93fd79bc865135a83647ced5a3af1f3734a76638094cd5a123796 |
| Narrator Broadcast Proof | `0xa654…cab6` | https://www.oklink.com/xlayer/tx/0xa654a78bd2199c54ab688c530370d1f9792b9e71395a125fd6489cb48c71cab6 |
| Executor Swap | `0x2ae6…ad6` | https://www.oklink.com/xlayer/tx/0x2ae68eaa64e4d1dd42e8be751fac6faa5baf1052a3c45ee755fcc7ade2587ad6 |
| x402 Entry Fee | `0xd18b…dc40` | https://www.oklink.com/xlayer/tx/0xd18b7d123b74e2933bb7569452eb82c045ecba42b51efcb80a76b658bca1dc40 |

> Full season history (27 DecisionLog hashes) lives in `frontend/deployments.json` and renders inline on the live arena.

## Quick Start
1. `npm install`
2. `cp frontend/.env.example frontend/.env` and fill the RPC + contract env vars.
3. `npm run dev --prefix frontend` then visit `http://localhost:3000` for the arena dashboard.

---

## Repo Layout
```
contracts/        // Hardhat project (DecisionLog, SeasonManager)
agents/           // Oracle → Analyst → Strategist → Executor → Narrator pipeline
frontend/         // Arena dashboard + wallet/x402 UX
acp/              // Agent Collaboration Protocol schemas
scripts/          // Proof utilities (self-transfer, deploy, logDecision)
```

## Wallet + x402 Flow
1. Copy `.env.example` to `.env` and fill the OKX/OnchainOS credentials + contract addresses.
2. Install agent deps: `cd agents && npm install`.
3. Run `npm run enroll` inside `agents/` to provision a wallet → pay the season entry fee → call `SeasonManager.enroll`.
4. Verify the `SquadEnrolled` event + x402 payment on OKLink.

## Running the Proof Scripts
- **Self-transfer proof:** `SYNDICATE_MNEMONIC="..." node scripts/get-tx-proof.js`
- **Deploy DecisionLog:** `cd contracts && SYNDICATE_PRIVATE_KEY=0x... X_LAYER_RPC=... npx hardhat run scripts/deploy-decisionlog.ts --network xlayer`
- **Log an agent decision:** `npx hardhat run scripts/log-decision.ts --network xlayer` with `DECISION_LOG_ADDRESS` set.

## Agents (v0)
| Agent | Path | Notes |
| --- | --- | --- |
| Oracle | `agents/src/agents/oracle.ts` | Pulls ETH/USDT snapshot from Market API. |
| Analyst | `frontend/api/run-cycle.js` | Scores opportunities + risks via GPT-4o mini. |
| Strategist | `agents/src/agents/strategist.ts` | Produces BUY/SELL/HOLD JSON + logs to DecisionLog. |
| Executor | `agents/src/agents/executor.ts` | Converts strategist output into swap intents (DEX fallback until Trade API walletId is exposed). |
| Narrator | `frontend/api/run-cycle.js` | Generates spectator summary + tweet copy. |

## Notes
- `frontend/deployments.json` mirrors every DecisionLog hash so the UI can render immediately without RPC latency.
- `selectWallet()` now handles OKX/MetaMask/Rabby/Zerion flows, completes the OnchainOS unlock, and attaches the OKLink receipt inline.
- ACP schemas are versioned so other teams can extend the protocol without breaking existing squads.
