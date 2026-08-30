import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateNpmPublishContext } from './validate-npm-publish-context.js';

function workspace(repository = 'git+https://github.com/owner/tollary.git') {
  const root = mkdtempSync(join(tmpdir(), 'tollary-publish-'));
  const target = join(root, 'packages/tollary');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'tollary', version: '0.1.0', mcpName: 'kr.p-e.tollary/agent-transaction-guard',
    homepage: 'https://tollary.p-e.kr/', repository,
    publishConfig: { access: 'public', provenance: true }
  }));
  writeFileSync(join(target, 'README.md'), 'A published client does not mean that real-value sales are active.');
  return root;
}

function fetchFixture({ npm = null, mcp = { servers: [] }, live = false } = {}) {
  return async url => {
    if (url.includes('registry.npmjs.org')) return { status: npm === null ? 404 : 200, json: async () => npm };
    if (url.includes('registry.modelcontextprotocol.io')) return { status: 200, json: async () => mcp };
    if (url.endsWith('/api/readiness')) return { status: 200, json: async () => ({ readiness: { paymentMode: live ? 'mainnet' : 'testnet', livePayments: live } }) };
    if (url.endsWith('/api/legal')) return { status: 200, json: async () => ({ ready: live, salesStatus: live ? 'ready-for-mainnet-sales' : 'test-only-no-mainnet-sales' }) };
    throw new Error('unexpected URL');
  };
}

test('bootstrap accepts only an unclaimed distribution while real-value sales stay closed', async () => {
  const result = await validateNpmPublishContext({
    root: workspace(), mode: 'bootstrap', githubRepository: 'owner/tollary', fetchImpl: fetchFixture()
  });
  assert.deepEqual(result, {
    valid: true, mode: 'bootstrap', package: 'tollary@0.1.0', repository: 'owner/tollary',
    realValueSales: false, npmNameUnclaimed: true, mcpNameUnclaimed: true
  });
});

test('bootstrap rejects provenance mismatch, claimed names, and accidental live sales', async () => {
  await assert.rejects(validateNpmPublishContext({
    root: workspace(), mode: 'bootstrap', githubRepository: 'another/repository', fetchImpl: fetchFixture()
  }), /provenance/);
  await assert.rejects(validateNpmPublishContext({
    root: workspace(), mode: 'bootstrap', githubRepository: 'owner/tollary',
    fetchImpl: fetchFixture({ npm: { versions: {} } })
  }), /unclaimed/);
  await assert.rejects(validateNpmPublishContext({
    root: workspace(), mode: 'bootstrap', githubRepository: 'owner/tollary', fetchImpl: fetchFixture({ live: true })
  }), /fail-closed/);
});

test('trusted publishing accepts only a new immutable version of an existing package', async () => {
  const root = workspace();
  const manifestPath = join(root, 'packages/tollary/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = '0.2.0';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const result = await validateNpmPublishContext({
    root, mode: 'trusted', githubRepository: 'owner/tollary',
    fetchImpl: fetchFixture({ npm: { versions: { '0.1.0': {} } } })
  });
  assert.equal(result.package, 'tollary@0.2.0');
  await assert.rejects(validateNpmPublishContext({
    root, mode: 'trusted', githubRepository: 'owner/tollary',
    fetchImpl: fetchFixture({ npm: { versions: { '0.1.0': {}, '0.2.0': {} } } })
  }), /new immutable version/);
});
