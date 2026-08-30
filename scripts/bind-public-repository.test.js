import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bindPublicRepository } from './bind-public-repository.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tollary-repository-bind-'));
  const packageRoot = join(root, 'packages', 'tollary');
  cpSync(resolve(import.meta.dirname, '../packages/tollary'), packageRoot, { recursive: true });
  const manifestFile = join(packageRoot, 'package.json');
  const serverFile = join(packageRoot, 'server.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const server = JSON.parse(readFileSync(serverFile, 'utf8'));
  delete manifest.repository;
  delete manifest.bugs;
  delete server.repository;
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(serverFile, JSON.stringify(server, null, 2) + '\n');
  return { root, packageRoot };
}

test('binds one exact GitHub source to both npm provenance and MCP metadata', () => {
  const files = fixture();
  const result = bindPublicRepository({ root: files.root, repository: 'TollaryHQ/tollary' });
  assert.equal(result.bound, true);
  const manifest = JSON.parse(readFileSync(join(files.packageRoot, 'package.json')));
  const server = JSON.parse(readFileSync(join(files.packageRoot, 'server.json')));
  assert.equal(manifest.repository.url, 'git+https://github.com/TollaryHQ/tollary.git');
  assert.equal(manifest.bugs.url, 'https://github.com/TollaryHQ/tollary/issues');
  assert.deepEqual(server.repository, { url: 'https://github.com/TollaryHQ/tollary', source: 'github' });
  assert.equal(bindPublicRepository({ root: files.root, repository: 'TollaryHQ/tollary' }).bound, true);
});

test('rejects malformed or conflicting repository bindings', () => {
  const files = fixture();
  assert.throws(() => bindPublicRepository({ root: files.root, repository: 'not-a-slug' }), /OWNER\/REPOSITORY/);
  bindPublicRepository({ root: files.root, repository: 'TollaryHQ/tollary' });
  assert.throws(() => bindPublicRepository({ root: files.root, repository: 'other/repository' }), /different/);
});
