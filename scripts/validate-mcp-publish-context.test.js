import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateMcpPublishContext } from './validate-mcp-publish-context.js';

const key = (() => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicValue = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x, 'base64url').toString('base64');
  return { seed: Buffer.from(privateJwk.d, 'base64url').toString('hex'), marker: `v=MCPv1; k=ed25519; p=${publicValue}` };
})();

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'tollary-mcp-publish-'));
  const target = join(root, 'packages/tollary');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'tollary', version: '0.1.0', mcpName: 'kr.p-e.tollary/agent-transaction-guard',
    repository: { type: 'git', url: 'git+https://github.com/owner/tollary.git' }
  }));
  writeFileSync(join(target, 'server.json'), JSON.stringify({
    name: 'kr.p-e.tollary/agent-transaction-guard', version: '0.1.0',
    repository: { url: 'https://github.com/owner/tollary', source: 'github' }
  }));
  return root;
}

function fetchFixture({ published = false, marker = key.marker, live = false, npmPresent = true } = {}) {
  return async url => {
    if (url.includes('registry.npmjs.org')) return { status: 200, json: async () => ({ versions: npmPresent ? { '0.1.0': {} } : {} }) };
    if (url.includes('registry.modelcontextprotocol.io')) return { status: 200, json: async () => ({ servers: published ? [{ server: { name: 'kr.p-e.tollary/agent-transaction-guard', version: '0.1.0' } }] : [] }) };
    if (url.endsWith('/api/readiness')) return { status: 200, json: async () => ({ readiness: { paymentMode: live ? 'mainnet' : 'testnet', livePayments: live } }) };
    if (url.endsWith('/api/legal')) return { status: 200, json: async () => ({ ready: live, salesStatus: live ? 'commercial-disclosure-complete' : 'test-only-no-mainnet-sales' }) };
    if (url.includes('.well-known')) return { status: 200, text: async () => marker + '\n' };
    throw new Error('unexpected URL');
  };
}

test('requires npm first, exact domain key, closed sales, and an unpublished immutable MCP version', async () => {
  const result = await validateMcpPublishContext({
    root: workspace(), githubRepository: 'owner/tollary', privateKeyHex: key.seed,
    phase: 'before', fetchImpl: fetchFixture()
  });
  assert.equal(result.domainMarkerBound, true);
  assert.equal(result.registryVersionPresent, false);
  const verified = await validateMcpPublishContext({
    root: workspace(), githubRepository: 'owner/tollary', privateKeyHex: key.seed,
    phase: 'after', fetchImpl: fetchFixture({ published: true })
  });
  assert.equal(verified.registryVersionPresent, true);
});

test('rejects mismatched marker, absent npm, duplicate version, live sales, and provenance mismatch', async () => {
  const base = { root: workspace(), githubRepository: 'owner/tollary', privateKeyHex: key.seed, phase: 'before' };
  await assert.rejects(validateMcpPublishContext({ ...base, fetchImpl: fetchFixture({ marker: 'wrong' }) }), /marker/);
  await assert.rejects(validateMcpPublishContext({ ...base, fetchImpl: fetchFixture({ npmPresent: false }) }), /npm/);
  await assert.rejects(validateMcpPublishContext({ ...base, fetchImpl: fetchFixture({ published: true }) }), /already/);
  await assert.rejects(validateMcpPublishContext({ ...base, fetchImpl: fetchFixture({ live: true }) }), /fail-closed/);
  await assert.rejects(validateMcpPublishContext({ ...base, githubRepository: 'other/repo', fetchImpl: fetchFixture() }), /identities/);
});
