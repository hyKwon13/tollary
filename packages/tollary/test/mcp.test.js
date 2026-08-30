import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const server = fileURLToPath(new URL('../bin/tollary-mcp.js', import.meta.url));
const defaultBin = fileURLToPath(new URL('../bin/tollary.js', import.meta.url));

test('MCP stdio initializes, lists safe tools, and returns the integration plan', async () => {
  const child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' }
  } }) + '\n');
  const initialized = JSON.parse((await iterator.next()).value);
  assert.equal(initialized.result.serverInfo.name, 'tollary');
  assert.equal(initialized.result.serverInfo.version, metadata.version);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
  const listed = JSON.parse((await iterator.next()).value);
  assert.deepEqual(listed.result.tools.map(tool => tool.name), [
    'tollary_free_lint', 'tollary_fit_check', 'tollary_inspect_offer', 'tollary_get_integration_plan'
  ]);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
    name: 'tollary_get_integration_plan', arguments: {}
  } }) + '\n');
  const called = JSON.parse((await iterator.next()).value);
  assert.equal(called.result.isError, false);
  assert.equal(called.result.structuredContent.custody, 'customer-owned-wallet-and-aws-kms');
  assert.equal(called.result.structuredContent.purchaseBoundary.listedPrice, '$0.01 USDC');
  child.stdin.end();
  await once(child, 'exit');
});

test('the npm default executable enters MCP mode when launched over stdio without CLI arguments', async () => {
  const child = spawn(process.execPath, [defaultBin], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'registry-test', version: '1' }
  } }) + '\n');
  const initialized = JSON.parse((await iterator.next()).value);
  assert.equal(initialized.result.serverInfo.name, 'tollary');
  child.stdin.end();
  await once(child, 'exit');
});
