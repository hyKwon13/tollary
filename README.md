# Tollary

Tollary is a non-custodial Agent Transaction Guard for autonomous Base USDC
payments. It checks an exact, owner-mandated transaction immediately before a
customer-owned AWS KMS signer can sign it.

This repository contains the open-source local fit-check/MCP client, immutable
publication metadata, and guarded npm/MCP release workflows. It does **not**
contain customer keys, payment credentials, hosted-service state, or private
backend operations.

## Try the client

```sh
npx tollary fit-check --project .
npx tollary inspect
npx --yes --package tollary tollary-mcp
```

The client never accepts a raw wallet or AWS private key. The fit check is
local and skips credentials, dependencies, vendor directories, and build
output. Inspect mode reads only Tollary's public metadata endpoints.

The hosted service currently exposes Base Sepolia testnet payment terms only.
A published package does not mean that Base Mainnet sales are active. Check
[`/api/readiness`](https://tollary.p-e.kr/api/readiness) and
[`/api/legal`](https://tollary.p-e.kr/api/legal) before every purchase.

## Repository layout

- `packages/tollary` — npm CLI and stdio MCP server
- `distribution/github-action` — local, bounded fit-check action
- `.github/workflows` — manual, environment-protected npm/MCP publishing
- `scripts` — fail-closed publication and namespace validation

The local client is MIT-licensed. Tollary's hosted API, service logic,
trademarks, and commercial output are not granted under that license.
