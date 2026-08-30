#!/usr/bin/env node
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  chmodSync, closeSync, constants, fsyncSync, openSync, rmSync, writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isDirectExecution } from './direct-execution.js';

export const MCP_AUTH_DOMAIN = 'tollary.p-e.kr';
const MARKER_PREFIX = 'v=MCPv1; k=ed25519; p=';

const syncDirectory = directory => {
  const descriptor = openSync(directory, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
};

const writeExclusive = (file, bytes, mode) => {
  const descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  chmodSync(file, mode);
  syncDirectory(dirname(file));
};

export function generateMcpRegistryAuth({ domain, privateOutput, publicOutput } = {}) {
  if (domain !== MCP_AUTH_DOMAIN) throw new Error(`Domain must be ${MCP_AUTH_DOMAIN}.`);
  if (!privateOutput || !publicOutput || resolve(privateOutput) === resolve(publicOutput)) {
    throw new Error('Distinct explicit private and public output paths are required.');
  }
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  const seed = Buffer.from(jwk.d, 'base64url');
  const publicKey = Buffer.from(jwk.x, 'base64url');
  if (seed.length !== 32 || publicKey.length !== 32) throw new Error('Generated Ed25519 key material is invalid.');
  const privateHex = seed.toString('hex') + '\n';
  const marker = `${MARKER_PREFIX}${publicKey.toString('base64')}\n`;
  let privateWritten = false;
  try {
    writeExclusive(privateOutput, privateHex, 0o600);
    privateWritten = true;
    writeExclusive(publicOutput, marker, 0o644);
  } catch (error) {
    if (privateWritten) rmSync(privateOutput, { force: true });
    throw error;
  }
  return Object.freeze({
    generated: true,
    domain,
    verificationUrl: `https://${domain}/.well-known/mcp-registry-auth`,
    publicKeyFingerprint: createHash('sha256').update(publicKey).digest('hex'),
    privateMode: '0600',
    publicMode: '0644'
  });
}

const parse = args => {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--domain', '--private-output', '--public-output'].includes(args[index]) || !args[index + 1]) {
      throw new Error('Usage: --domain tollary.p-e.kr --private-output /secure/key --public-output /public/.well-known/mcp-registry-auth');
    }
    values[args[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = args[index + 1];
  }
  if (args.length !== 6 || Object.keys(values).length !== 3) {
    throw new Error('Usage: --domain tollary.p-e.kr --private-output /secure/key --public-output /public/.well-known/mcp-registry-auth');
  }
  return values;
};

if (isDirectExecution(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(generateMcpRegistryAuth(parse(process.argv.slice(2)))) + '\n'); }
  catch (error) {
    process.stderr.write(JSON.stringify({ generated: false, error: error.message }) + '\n');
    process.exitCode = 2;
  }
}
