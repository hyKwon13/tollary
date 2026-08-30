#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDirectExecution } from './direct-execution.js';

const PACKAGE_NAME = 'tollary';
const MCP_NAME = 'kr.p-e.tollary/agent-transaction-guard';
const HOMEPAGE = 'https://tollary.p-e.kr/';
const BOOTSTRAP_VERSION = '0.1.0';

function exactRepositoryUrl(repository, githubRepository) {
  const value = typeof repository === 'string' ? repository : repository?.url;
  return value === `git+https://github.com/${githubRepository}.git`;
}

function exactVersion(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

async function jsonResponse(fetchImpl, url, accepted) {
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!accepted.includes(response.status)) throw new Error(`Authoritative preflight failed with HTTP ${response.status}.`);
  if (response.status === 404) return null;
  return response.json();
}

export async function validateNpmPublishContext({
  root = resolve(import.meta.dirname, '..'),
  mode,
  githubRepository,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!['bootstrap', 'trusted'].includes(mode)) throw new Error('Mode must be bootstrap or trusted.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be the exact owner/repository slug.');
  }
  const packageRoot = resolve(root, 'packages/tollary');
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8');
  if (manifest.name !== PACKAGE_NAME || !exactVersion(manifest.version)
      || (mode === 'bootstrap' && manifest.version !== BOOTSTRAP_VERSION)
      || manifest.mcpName !== MCP_NAME || manifest.homepage !== HOMEPAGE
      || manifest.publishConfig?.access !== 'public'
      || !exactRepositoryUrl(manifest.repository, githubRepository)) {
    throw new Error('Package identity or repository provenance binding is incomplete.');
  }
  if (/not yet published|publication-preparation/i.test(readme)
      || !/published client does not mean that real-value sales are active/i.test(readme)) {
    throw new Error('README publication and sales-state boundary is stale.');
  }

  const [npm, mcp, readiness, legal] = await Promise.all([
    jsonResponse(fetchImpl, `https://registry.npmjs.org/${PACKAGE_NAME}`, [200, 404]),
    jsonResponse(fetchImpl, `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(MCP_NAME)}`, [200]),
    jsonResponse(fetchImpl, 'https://tollary.p-e.kr/api/readiness', [200]),
    jsonResponse(fetchImpl, 'https://tollary.p-e.kr/api/legal', [200])
  ]);
  const versions = npm?.versions && typeof npm.versions === 'object' ? npm.versions : {};
  const matchingMcp = Array.isArray(mcp?.servers)
    ? mcp.servers.filter(entry => entry?.server?.name === MCP_NAME || entry?.name === MCP_NAME)
    : [];
  if (mode === 'bootstrap' && (npm !== null || matchingMcp.length !== 0)) {
    throw new Error('Bootstrap requires an unclaimed npm name and absent MCP record.');
  }
  if (mode === 'trusted' && (npm === null || Object.hasOwn(versions, manifest.version))) {
    throw new Error('Trusted publishing requires an existing package and a new immutable version.');
  }
  if (readiness?.readiness?.paymentMode !== 'testnet'
      || readiness?.readiness?.livePayments !== false
      || legal?.ready !== false
      || legal?.salesStatus !== 'test-only-no-mainnet-sales') {
    throw new Error('Distribution-only publication requires the hosted service to remain fail-closed for real-value sales.');
  }
  return Object.freeze({
    valid: true,
    mode,
    package: `${manifest.name}@${manifest.version}`,
    repository: githubRepository,
    realValueSales: false,
    npmNameUnclaimed: npm === null,
    mcpNameUnclaimed: matchingMcp.length === 0
  });
}

function parse(args) {
  if (args.length !== 2 || args[0] !== '--mode') throw new Error('Usage: --mode bootstrap|trusted');
  return { mode: args[1], githubRepository: process.env.GITHUB_REPOSITORY };
}

if (isDirectExecution(import.meta.url)) {
  validateNpmPublishContext({ root: process.cwd(), ...parse(process.argv.slice(2)) })
    .then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => {
      process.stderr.write(JSON.stringify({ valid: false, error: error.message }) + '\n');
      process.exitCode = 2;
    });
}
