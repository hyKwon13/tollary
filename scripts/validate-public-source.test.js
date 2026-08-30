import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validatePublicSource } from './validate-public-source.js';

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'tollary-public-source-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'index.js'), 'export const safe = true;\n');
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'ignored.key'), 'ignored');
  return root;
}

test('accepts a regular source tree while excluding generated dependency directories', () => {
  const root = workspace();
  mkdirSync(join(root, '.codex'));
  writeFileSync(join(root, '.codex', 'auth.json'), 'host-only');
  assert.deepEqual(validatePublicSource({ root }).valid, true);
});

test('ignores a build-managed node_modules symlink because it is never a publication input', () => {
  const root = mkdtempSync(join(tmpdir(), 'tollary-public-source-linked-deps-'));
  const external = mkdtempSync(join(tmpdir(), 'tollary-public-source-external-deps-'));
  symlinkSync(external, join(root, 'node_modules'));
  writeFileSync(join(root, 'index.js'), 'export const safe = true;\n');
  assert.deepEqual(validatePublicSource({ root }).valid, true);
});

test('rejects credential-like filenames before a public repository is created', () => {
  for (const name of ['.env.production', 'cdp_api_key.json', 'wallet.pem', 'ssh-key-2026.key', 'mcp-registry-auth-key']) {
    const root = workspace();
    writeFileSync(join(root, name), 'secret');
    assert.throws(() => validatePublicSource({ root }), /credential-like filename/);
  }
});

test('rejects symlinks so ignored credentials cannot be referenced indirectly', () => {
  const root = workspace();
  symlinkSync(join(root, 'src', 'index.js'), join(root, 'linked-source'));
  assert.throws(() => validatePublicSource({ root }), /symbolic links/);
});
