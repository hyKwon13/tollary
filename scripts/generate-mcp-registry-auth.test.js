import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateMcpRegistryAuth } from './generate-mcp-registry-auth.js';

const PKCS8_ED25519_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tollary-mcp-auth-'));
  const publicDirectory = join(root, 'public', '.well-known');
  mkdirSync(publicDirectory, { recursive: true });
  return {
    domain: 'tollary.p-e.kr',
    privateOutput: join(root, 'secure-mcp-key'),
    publicOutput: join(publicDirectory, 'mcp-registry-auth')
  };
}

test('creates one protected Ed25519 seed and matching public HTTP marker', () => {
  const files = fixture();
  const result = generateMcpRegistryAuth(files);
  assert.equal(result.generated, true);
  assert.equal(statSync(files.privateOutput).mode & 0o777, 0o600);
  assert.equal(statSync(files.publicOutput).mode & 0o777, 0o644);
  const seedHex = readFileSync(files.privateOutput, 'utf8').trim();
  assert.match(seedHex, /^[a-f0-9]{64}$/);
  const marker = readFileSync(files.publicOutput, 'utf8').trim();
  const encodedPublic = marker.match(/^v=MCPv1; k=ed25519; p=([A-Za-z0-9+/]+={0,2})$/)?.[1];
  assert.ok(encodedPublic);
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_SEED_PREFIX, Buffer.from(seedHex, 'hex')]),
    format: 'der', type: 'pkcs8'
  });
  const derivedPublic = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x, 'base64url');
  assert.equal(derivedPublic.toString('base64'), encodedPublic);
  const message = Buffer.from('tollary-mcp-registry-auth-test');
  assert.equal(verify(null, message, createPublicKey(privateKey), sign(null, message, privateKey)), true);
});

test('refuses overwrite, wrong domain, and shared output paths', () => {
  const files = fixture();
  generateMcpRegistryAuth(files);
  assert.throws(() => generateMcpRegistryAuth(files), /exist|EEXIST/i);
  const wrong = fixture();
  assert.throws(() => generateMcpRegistryAuth({ ...wrong, domain: 'example.com' }), /tollary/);
  const same = fixture();
  assert.throws(() => generateMcpRegistryAuth({ ...same, publicOutput: same.privateOutput }), /Distinct/);
});
