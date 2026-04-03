# FRANCC_CONTEXT

## Overview
- **Project:** Xyndicate Protocol — multi-agent (Oracle → Analyst → Strategist → Executor → Narrator) arena on X Layer.
- **Goal:** Keep frontend instantly populated with DecisionLog proofs, run scheduler every ~12h, surface x402 unlock UX, and now log Narrator→Oracle micropayments.
- **Monorepo structure:**
  - `contracts/` Hardhat (DecisionLog, SeasonManager)
  - `agents/` TypeScript services for Oracle/Strategist/etc.
  - `frontend/` Vercel Nextless static site (pure HTML/JS/CSS)
  - `scripts/` Node utilities including `scheduler.js` worker.
  - `acp/` JSON schemas for agent messages.

## Deployments & Services
- **Vercel:** Project `xyngate` (alias https://xyndicateprotocol.vercel.app). Deploy via `npx vercel --token $VERCEL_TOKEN --cwd frontend --prod --yes` (token stored in env, not committed).
- **Railway worker:** Runs `node scripts/scheduler.js`. Scheduler now executes once per start, sleeps 12h, exits (Railway restart enforces cadence).
- **GitHub:** Repo `talk2francis/Xyndicate-Protocol`. Scheduler writes hashes/payments via REST using `GITHUB_TOKEN` with repo scope.

## Wallets & Contracts
- **Base / Locus wallet:** `0xdf17b4c0394ef7f231e1db629018a1189ff9cdaf` (used on Base for Locus Budget Broker transactions).
- **Narrator/Strategist wallet:** Derived from `STRATEGIST_KEY` (Railway env) on X Layer. Pays DecisionLog gas + Narrator→Oracle tip.
- **Oracle receiver wallet:** `ORACLE_WALLET_ADDRESS` env (user-provided second wallet).
- **Contracts:**
  - DecisionLog: `0xC9E69be5ecD65a9106800E07E05eE44a63559F8b` (logs pipeline decisions).
  - SeasonManager: `0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1` (enrollment + season logic).
  - Proof TX hashes referenced in README + frontend (OKLink links only).

## Environment Variables (Railway/Vercel)
| Variable | Purpose / Notes |
| --- | --- |
| `STRATEGIST_KEY` | Narrator/Strategist EOA private key (never committed; used by scheduler + executor). |
| `ORACLE_WALLET_ADDRESS` | Recipient address for 0.0001 OKB micropayment. |
| `OPENAI_API_KEY` | Used in `frontend/api/run-cycle.js` (model now `gpt-3.5-turbo`). |
| `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_PASSPHRASE`, `OKX_BASE_URL` | Oracle Market API + future Trade API hooks. |
| `XLAYER_RPC` | Shared RPC endpoint for scheduler + frontend fallback fetches. |
| `DECISION_LOG_ADDRESS`, `SEASON_MANAGER_ADDRESS` | Contract addresses consumed by agents and frontend gating copy. |
| `GITHUB_TOKEN` | Repo write access so scheduler can update `frontend/txhashes.json` + `frontend/agentpayments.json`. |
| `X402_CONTRACT_ADDRESS` / `X402_API_KEY` | x402 unlock flow (if configured). |
| `VERCEL_TOKEN` | Deploy frontend from CI/local CLI. |
| `RAILWAY_TOKEN` | Provision worker restarts (not stored in repo). |
| `SYNTHESIS_BEARER` (`sk-synth-...`) | Token for Locus/Serotone agent messaging. |
| `TELEGRAM_BOT_TOKEN` (`860854...`) | Locus Telegram bot. |
| `CLAW_DEV_TOKEN` (`claw_dev_TUNj...`) | OpenClaw dev token for status integrations. |

_All secrets remain in Railway/Vercel env dashboards; only variable names + usage are tracked here._

## Data Files / Frontend Expectations
- `frontend/deployments.json`: fallback DecisionLog entries (indexes + stats) for immediate UI render.
- `frontend/txhashes.json`: scheduler-appended array mapping decision indexes → OKLink hashes (scheduler logs to local file + GitHub).
- `frontend/agentpayments.json`: new file storing `{from,to,amount,txHash,timestamp}` records so UI shows Narrator→Oracle payments.
- `frontend/index.html`: static landing page with inline `DECISIONS` fallback + staged reveal script; final `<script>` block handles DOM init.
- `frontend/styles.css`: Candara aesthetic, dark mode, new `.agent-payment` styles.
- `/api/decisions`: serverless endpoint (Node, plain JS) hitting RPC via ethers to fetch latest DecisionLog entries (returns 30 entries, CORS enabled).

## Scheduler Logic (`scripts/scheduler.js`)
1. `executeOnce()` calls remote `/api/run-cycle` (Railway env `RUN_CYCLE_URL`) to execute agents.
2. On success:
   - `saveTxHash()` writes to JSON + GitHub.
   - `narratorPaysOracle()` uses `STRATEGIST_KEY` + `XLAYER_RPC` to send 0.0001 OKB to `ORACLE_WALLET_ADDRESS`, waits 1 confirmation.
   - `recordAgentPayment()` appends entry locally + via GitHub.
3. Logs progress and sleeps `12 * 60 * 60 * 1000` ms before exiting (Railway restarts process on schedule).
4. Error handling logs and still sleeps before exit.

## GitHub Token Usage
- Scheduler hits `https://api.github.com/repos/talk2francis/Xyndicate-Protocol/contents/frontend/txhashes.json` (and `agentpayments.json`), fetches current file SHA, pushes new version with message `Store decision tx hash …` / `Log narrator→oracle payment …`.
- Local development uses same token for CLI pushes via credential-in-URL pattern (see previous commits); rotate token if exposed.

## Hosting / Tooling Notes
- `npm install` at repo root installs workspace deps; `frontend` also has its own `package.json` for build pipeline.
- `RUN_CYCLE` serverless code in `frontend/api/run-cycle.js` uses `gpt-3.5-turbo`, OKX ticker, composes ACP messages, and returns `txHash`, `narrative`, `tweet`.
- `agents/` directory houses TypeScript sources for Oracle/Strategist/Executor; compile via `ts-node` when running locally.
- Decision cards require OKLink-verified hashes; scheduler + manual entries must use legitimate transactions only.

## Outstanding Tasks / Constraints
- Backfill missing DecisionLog hashes (indexes 27–54/56/59/63) once Railway logs become available.
- Keep README framed as X Layer infrastructure doc.
- Maintain inline initializer script (final `<script>` near `</body>`); button IDs `unlock-chain`, `show-more-btn`, etc. must remain stable.
- Base transactions for Locus must originate from wallet `0xdf17…cdaf` with allowance logs.
- WaaS wallet APIs still return 404/405, so executor uses ethers direct signer.

_This file omits actual secret values by design; refer to Railway/Vercel dashboards or encrypted vaults for the concrete keys._
