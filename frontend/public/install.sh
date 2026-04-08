#!/bin/bash
echo "Installing xyndicate-strategy-skill..."
mkdir -p ~/.mcp-skills/xyndicate
curl -fsSL https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/mcp/README.md -o ~/.mcp-skills/xyndicate/README.md
echo '{"name":"xyndicate-strategy-skill","mcp_url":"https://xyndicateprotocol.vercel.app/api/mcp","tools":["get_leaderboard","get_market_signal","get_squad_strategy","execute_route_query"]}' > ~/.mcp-skills/xyndicate/skill.json
echo "✓ xyndicate-strategy-skill installed. Run: cat ~/.mcp-skills/xyndicate/skill.json"
