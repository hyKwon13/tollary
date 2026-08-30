#!/usr/bin/env node
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDirectExecution } from './direct-execution.js';

const PACKAGE_NAME = 'tollary';
const MCP_NAME = 'kr.p-e.tollary/agent-transaction-guard';
const DOMAIN = 'tollary.p-e.kr';
const PRIVATE_SEED = /^[a-f0-9]{64}$/;
const PKCS8_ED25519_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

const exactRepository = (manifest, server, githubRepository) =>
  manifest.repository?.url === `git+https://github.com/${githubRepository}.git`
  && server.repository?.url === `https://github.com/${githubRepository}`
  && server.repository?.source === 'github';

const publicMarkerFromSeed = seedHex => {
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_SEED_PREFIX, Buffer.from(seedHex, 'hex')]),
    format: 'der', type: 'pkcs8'
  });
  const encoded = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x, 'base64url').toString('base64');
  return `v=MCPv1; k=ed25519; p=${encoded}`;
};

async function response(fetchImpl, url, type, accepted = [200]) {
  const result = await fetchImpl(url, { headers: { accept: type === 'json' ? 'application/json' : 'text/plain' } });
  if (!accepted.includes(result.status)) throw new Error(`Authoritative MCP preflight failed with HTTP ${result.status}.`);
  return type === 'json' ? result.json() : result.text();
}

export async function validateMcpPublishContext({
  root = resolve(import.meta.dirname, '..'),
  githubRepository,
  privateKeyHex,
  phase = 'before',
  fetchImpl = globalThis.fetch
} = {}) {
  if (!['before', 'after'].includes(phase)) throw new Error('Phase must be before or after.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository || '')) {
    throw new Error('GITHUB_REPOSITORY must be the exact owner/repository slug.');
  }
  const seed = String(privateKeyHex || '').trim();
  if (!PRIVATE_SEED.test(seed)) throw new Error('Protected MCP private key is missing or malformed.');
  const packageRoot = resolve(root, 'packages/tollary');
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  const server = JSON.parse(readFileSync(resolve(packageRoot, 'server.json'), 'utf8'));
  if (manifest.name !== PACKAGE_NAME || manifest.mcpName !== MCP_NAME || server.name !== MCP_NAME
      || manifest.version !== server.version || !exactRepository(manifest, server, githubRepository)) {
    throw new Error('npm, MCP, and GitHub repository identities are not exactly bound.');
  }
  const [npm, registry, readiness, legal, marker] = await Promise.all([
    response(fetchImpl, `https://registry.npmjs.org/${PACKAGE_NAME}`, 'json'),
    response(fetchImpl, `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(MCP_NAME)}`, 'json'),
    response(fetchImpl, 'https://tollary.p-e.kr/api/readiness', 'json'),
    response(fetchImpl, 'https://tollary.p-e.kr/api/legal', 'json'),
    response(fetchImpl, `https://${DOMAIN}/.well-known/mcp-registry-auth`, 'text')
  ]);
  if (!npm?.versions || !Object.hasOwn(npm.versions, manifest.version)) {
    throw new Error('The exact npm package version must exist before MCP publication.');
  }
  if (marker.trim() !== publicMarkerFromSeed(seed)) {
    throw new Error('Hosted MCP domain marker does not match the protected publisher key.');
  }
  if (readiness?.readiness?.paymentMode !== 'testnet'
      || readiness?.readiness?.livePayments !== false
      || legal?.ready !== false || legal?.salesStatus !== 'test-only-no-mainnet-sales') {
    throw new Error('MCP distribution publication requires real-value sales to remain fail-closed.');
  }
  const matchingVersion = Array.isArray(registry?.servers) && registry.servers.some(entry => {
    const record = entry?.server || entry;
    return record?.name === MCP_NAME && record?.version === manifest.version;
  });
  if ((phase === 'before' && matchingVersion) || (phase === 'after' && !matchingVersion)) {
    throw new Error(phase === 'before'
      ? 'The immutable MCP version is already published.'
      : 'The published MCP version is not visible in the official registry.');
  }
  return Object.freeze({
    valid: true,
    phase,
    server: `${MCP_NAME}@${manifest.version}`,
    repository: githubRepository,
    npmVersionPresent: true,
    domainMarkerBound: true,
    realValueSales: false,
    registryVersionPresent: matchingVersion
  });
}

const parse = args => {
  if (args.length !== 2 || args[0] !== '--phase') throw new Error('Usage: --phase before|after');
  return {
    phase: args[1],
    githubRepository: process.env.GITHUB_REPOSITORY,
    privateKeyHex: process.env.MCP_PRIVATE_KEY
  };
};

if (isDirectExecution(import.meta.url)) {
  validateMcpPublishContext({ root: process.cwd(), ...parse(process.argv.slice(2)) })
    .then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => {
      process.stderr.write(JSON.stringify({ valid: false, error: error.message }) + '\n');
      process.exitCode = 2;
    });
}
