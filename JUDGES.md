# For Judges

## Scoring criteria — how Xyndicate satisfies each

### Onchain OS / Uniswap integration (25%)
Xyndicate uses live OKX market inputs plus a real Uniswap v3 ETH/USDC pool reference price inside the production runtime. The live Oracle path is implemented in `frontend/server/run-cycle-core.ts`, with Uniswap fetch logic in `frontend/server/uniswap.mjs`, and public exposure in `frontend/app/api/signal/route.ts` plus the MCP server at `frontend/app/api/mcp/route.ts`. The runtime emits route-aware decisions using `spreadBps` and `betterRoute`, while the Arena UI surfaces dual-source routing, live prices, and best-rate badges per decision. The Uniswap v3 ETH/USDC pool (0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640) is read on-chain every cycle. Near-zero spread between Uniswap and OKX reflects efficient market arbitrage, not a missing integration. Both prices are logged in cycle_state.json Oracle agentLog entries per cycle. Related proof txs include the live DecisionLog deployment `0xa067aca1038b431a789fa7a63cafeaee98af52382ef96df00f97e47fdcdc1d34`, StrategyVault deployment `0xe371b795f2ac92d0c7919497f9a8e70f099ff5f1c88088c2c39955d835e0034c`, and executor swap proof `0x2ae68eaa64e4d1dd42e8be751fac6faa5baf1052a3c45ee755fcc7ade2587ad6`.

### X Layer ecosystem integration (25%)
The live protocol runs on X Layer mainnet and exposes multiple contracts with visible history. Core live addresses are: DecisionLog `0xC9E69be5ecD65a9106800E07E05eE44a63559F8b`, SeasonManagerV2 `0x0E6619188f19872554789a84F6E9150EA7b78d48`, StrategyVault `0x6002767f909B3049d5A65beAD84A843a385a61aC`, StrategyLicense `0x8AbaCE8Ea22A591CE3109599449776A2cb96B186`, and StrategyRegistry `0x8d486C3d45dc9C23500e3bF9781124eF149277f0`. Public proof artifacts currently expose over 100 decision tx references and the Arena ambient live signal reads total on-chain tx count from `frontend/txhashes.json`. OKLink entry points: `<https://www.oklink.com/xlayer/address/0xC9E69be5ecD65a9106800E07E05eE44a63559F8b>`, `<https://www.oklink.com/xlayer/address/0x6002767f909B3049d5A65beAD84A843a385a61aC>`, `<https://www.oklink.com/xlayer/address/0x8AbaCE8Ea22A591CE3109599449776A2cb96B186>`, `<https://www.oklink.com/xlayer/address/0x8d486C3d45dc9C23500e3bF9781124eF149277f0>`.

### AI interactive experience (25%)
The product is a real multi-page agent experience, not a static demo. Judges can use the Deploy wizard to walk through squad setup, use the Docs page live tester to call real MCP tools, purchase access through x402-backed Market flows, watch a server-authoritative Arena cycle update from GitHub-published scheduler state, and inspect the Economy loop showing value moving between autonomous agent roles. The Arena now displays a live agent status board, countdown progress, route-aware decision feed, and on-chain tx pulse. MCP tools include `get_market_signal`, `get_leaderboard`, `execute_route_query`, and `get_economy_snapshot`.

### Product completeness (25%)
Xyndicate ships seven production pages with live data, empty/error/loading states, mobile responsiveness, wallet flows, MCP server integration, proof export visibility, and a dedicated Economy loop page. Public artifact-backed APIs keep production reliable under unstable RPC conditions while still preserving chain truth through DecisionLog, StrategyVault, and payment/history artifacts. The submission contains contracts, scheduler, Vercel frontend, Railway runtime, MCP layer, licensing/payment flows, and a judge-focused docs experience.

## Live demo walkthrough

1. Open `https://xyndicateprotocol.vercel.app`
   - See the Home page with live counts and links into the product.
2. Open `/arena`
   - See the live agent status board, server-authoritative countdown, dual-squad leaderboard, route-aware decision feed, and on-chain live indicator.
3. Open `/deploy`
   - Walk through the live deploy/enroll wizard wired for X Layer wallet flow.
4. Open `/market`
   - View x402 tiers and trigger real strategy license or direct-wallet payment flows.
5. Open `/economy`
   - See the animated earn → pay → earn loop with real aggregated payment/economy metrics.
6. Open `/proofs`
   - Inspect live proof rows, contract cards, and on-chain evidence references.
7. Open `/docs`
   - Use the live tester to call MCP tools and inspect MCP usage telemetry.

## MCP skill test

Exact curl command:

```bash
curl -X POST https://xyndicateprotocol.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -d '{"tool":"get_market_signal","params":{"pair":"ETH/USDC"}}'
```

Expected response format:

```json
{
  "tool": "get_market_signal",
  "result": [
    {
      "pair": "ETH/USDC",
      "okxPrice": 0,
      "uniswapPrice": 0,
      "spreadBps": 0,
      "recommendedAction": "BUY|SELL|HOLD",
      "confidence": 0.0,
      "betterRoute": "okx|uniswap",
      "timestamp": "ISO-8601"
    }
  ],
  "responseTime": 0,
  "caller": "anonymous"
}
```

This file is intended to make the judging path obvious. Judges should not have to hunt for what is live, where the contracts are, or how to test the MCP skill.
