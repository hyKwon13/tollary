# Tollary

> **Experimental beta — Base Sepolia testnet only.** This client and the
> hosted Guard do not guarantee transaction safety, recipient identity,
> legality, settlement, or loss prevention. Base Mainnet sales are disabled.

Tollary is a local fit-check and MCP discovery client for a non-custodial Base
USDC Agent Transaction Guard. The paid service checks one exact, owner-mandated
transaction immediately before a customer-owned AWS KMS signer can sign it.

```sh
npx tollary fit-check --project .
npx tollary inspect
npx tollary lint --input ./guard-request.json
npx tollary plan
```

The fit check is read-only and local. It skips `.env`, key, credential, vendor,
and build files. It reports only relative file paths and architecture signals;
it does not upload source code. `inspect` fetches public metadata only. None of
these commands accepts a private key, connects a wallet, signs, or pays.

`inspect` and `lint` send a fresh random per-command experiment session and a
short source label so Tollary can measure whether the public beta is useful.
The acquisition ledger stores only a SHA-256 session hash, event type, source,
and timestamp; it does not store the submitted request, project path, wallet,
credential, or raw identifier. Use `--source your-label` to identify a guide or
integration. Counts are anonymous telemetry, not verified unique people.

Only projects showing all five signals—AWS KMS, secp256k1, Base Mainnet,
official Base USDC, and autonomous/x402 execution—receive the paid Guard next
step. This avoids selling an irrelevant product to projects that do not fit.

When free lint returns `eligibleForPaidGuard: true`, the response includes the
exact versioned purchase client, its integrity manifest, the purchase guide,
and the verification SDK. The client accepts a caller-owned x402 payment
callback; it never accepts a raw wallet key. Reuse the same still-fresh signed
request and re-check `/api/readiness`, `/api/legal`, and the returned 402 terms
before allowing that callback to spend.

## MCP

Run the stdio server with:

```sh
npx --yes --package tollary tollary-mcp
```

It exposes `tollary_fit_check`, `tollary_inspect_offer`, `tollary_free_lint`, and
`tollary_get_integration_plan`. Payment remains under the caller's own x402
buyer. The MCP server never requests or stores wallet or AWS credentials.

Mainnet availability is separate from package publication. Always check live
`/api/readiness`, `/api/legal`, the 402 terms, and the OpenAPI contract before a
purchase. A published client does not mean that real-value sales are active.
The local client is MIT-licensed; Tollary's hosted API, service logic,
trademarks, and commercial output are not granted under that license.

Version 0.1.1 remains an experimental Base Sepolia beta. Install it with
`npm install tollary@0.1.1` or run it with `npx tollary@0.1.1`.
