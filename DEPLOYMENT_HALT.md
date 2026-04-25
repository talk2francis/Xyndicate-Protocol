# Xyndicate deployment halt

Repo-side automation is intentionally halted to prevent further spend.

## Current default

`XYNDICATE_AUTOMATION_DISABLED=true`

This means:
- `scripts/scheduler.js` will not start automated cycles
- MCP self-call logging is disabled
- remote artifact publishing is disabled, even if `ENABLE_REMOTE_ARTIFACT_PUBLISH=true`

## To keep costs down

Also stop these in platform dashboards:
- Vercel auto-deploys / production builds
- Railway running services and cron/scheduler jobs

## To re-enable later

Set:
- `XYNDICATE_AUTOMATION_DISABLED=false`

Then only re-enable platform-side services deliberately.
