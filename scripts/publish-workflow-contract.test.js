import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('bootstrap publishing is manual, environment-protected, provenance-bearing, and single-version', () => {
  const workflow = read('bootstrap-tollary-npm.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: npm-production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /--mode bootstrap/);
  assert.match(workflow, /npm publish --access public --provenance --ignore-scripts/);
  assert.match(workflow, /NPM_BOOTSTRAP_TOKEN/);
  assert.match(workflow, /publish tollary@0\.1\.0 testnet client only/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
});

test('ongoing publishing uses OIDC without a reusable npm token or untrusted action tag', () => {
  const workflow = read('publish-tollary.yml');
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: npm-production/);
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(workflow, /--mode trusted/);
  assert.match(workflow, /npm publish --access public --ignore-scripts/);
  assert.match(workflow, /CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
});

test('MCP publishing is manual, domain-key-bound, npm-first, checksummed, and environment-protected', () => {
  const workflow = read('publish-tollary-mcp.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: mcp-production/);
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/);
  assert.match(workflow, /validate-mcp-publish-context\.js --phase before/);
  assert.match(workflow, /mcp-publisher_linux_amd64\.tar\.gz/);
  assert.match(workflow, /a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc/);
  assert.match(workflow, /login http --domain tollary\.p-e\.kr --private-key/);
  assert.match(workflow, /publish packages\/tollary\/server\.json/);
  assert.match(workflow, /validate-mcp-publish-context\.js --phase after/);
  assert.match(workflow, /MCP_PRIVATE_KEY: \$\{\{ secrets\.MCP_PRIVATE_KEY \}\}/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
});
