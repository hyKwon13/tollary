'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = join(__dirname, 'summarize.cjs');

test('GitHub Action exposes only bounded qualification output and no evidence paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'tollary-action-'));
  const input = join(root, 'input.json');
  const output = join(root, 'output');
  const summary = join(root, 'summary');
  writeFileSync(input, JSON.stringify({
    schemaVersion: 'tollary-local-fit-check-v1', fit: true, missing: [],
    scanned: { files: 12 }, evidence: { awsKms: ['sensitive/internal/path.ts'] }
  }));
  const result = spawnSync(process.execPath, [script, input, output, summary], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(output, 'utf8'), /fit=true/);
  assert.match(readFileSync(output, 'utf8'), /next_step=npx tollary@0\.1\.0 inspect/);
  assert.doesNotMatch(readFileSync(summary, 'utf8'), /sensitive|internal\/path/);
});

test('GitHub Action rejects injected output names and impossible scan counts', () => {
  const root = mkdtempSync(join(tmpdir(), 'tollary-action-invalid-'));
  const input = join(root, 'input.json');
  writeFileSync(input, JSON.stringify({
    schemaVersion: 'tollary-local-fit-check-v1', fit: false,
    missing: ['awsKms\nowned=true'], scanned: { files: 5_000 }
  }));
  const result = spawnSync(process.execPath, [script, input, join(root, 'output'), join(root, 'summary')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
});
