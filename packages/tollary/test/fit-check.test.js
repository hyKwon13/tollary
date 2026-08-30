import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLocalFitCheck } from '../src/fit-check.js';

const fixture = async () => mkdtemp(join(tmpdir(), 'tollary-fit-'));

test('qualifies an AWS KMS official Base USDC autonomous payment project locally', async () => {
  const root = await fixture();
  await writeFile(join(root, 'payment.ts'), `
    const chainId = 8453;
    const token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const keySpec = 'ECC_SECG_P256K1';
    const action = 'kms:Sign';
    const protocol = 'x402 agent payment';
  `);
  const result = await runLocalFitCheck({ project: root, origin: 'https://tollary.p-e.kr' });
  assert.equal(result.fit, true);
  assert.equal(result.conversion.eligibleForPaidGuard, true);
  assert.equal(result.mode, 'local-read-only-no-network-no-secrets-no-funds');
  assert.deepEqual(result.evidence.awsKms, ['payment.ts']);
});

test('does not read secrets, .env files, symlinks, dependencies, or unrelated projects', async () => {
  const root = await fixture();
  const outside = await fixture();
  const tempting = `ECC_SECG_P256K1 kms:Sign chainId=8453
    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 x402 agent payment`;
  await writeFile(join(root, '.env'), tempting);
  await writeFile(join(root, 'wallet-private-key.ts'), tempting);
  await writeFile(join(outside, 'outside.ts'), tempting);
  await symlink(join(outside, 'outside.ts'), join(root, 'linked.ts'));
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'node_modules', 'dependency.js'), tempting);
  await writeFile(join(root, 'index.ts'), 'console.log("ordinary project")');
  const result = await runLocalFitCheck({ project: root, origin: 'https://tollary.p-e.kr' });
  assert.equal(result.fit, false);
  assert.equal(result.scanned.files, 1);
  assert.equal(result.conversion.eligibleForPaidGuard, false);
  assert.deepEqual(Object.values(result.evidence).flat(), []);
});

test('requires the complete architecture rather than keyword fragments', async () => {
  const root = await fixture();
  await writeFile(join(root, 'partial.ts'), 'kms:Sign ECC_SECG_P256K1 x402 agent payment');
  const result = await runLocalFitCheck({ project: root, origin: 'https://tollary.p-e.kr' });
  assert.equal(result.fit, false);
  assert.deepEqual(result.missing.sort(), ['baseMainnet', 'officialBaseUsdc']);
});

test('MCP-style root boundary prevents scanning a sibling directory', async () => {
  const root = await fixture();
  const outside = await fixture();
  await assert.rejects(
    () => runLocalFitCheck({ project: outside, allowedRoot: root, origin: 'https://tollary.p-e.kr' }),
    error => error?.code === 'project-outside-allowed-root'
  );
});
