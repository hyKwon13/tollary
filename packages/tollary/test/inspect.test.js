import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOffer, integrationPlan, lintGuardRequest } from '../src/inspect.js';

const response = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

test('inspects only the three public metadata endpoints', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith('/api/product')) return response(200, { product: { id: 'agent-transaction-guard' } });
    if (url.endsWith('/api/readiness')) return response(503, { ready: false });
    if (url.endsWith('/api/legal')) return response(200, { commercial: false });
    throw new Error('unexpected URL');
  };
  const result = await inspectOffer({ origin: 'https://tollary.p-e.kr', fetchImpl });
  assert.equal(result.mode, 'metadata-only-no-payment-no-wallet-no-funds');
  assert.equal(result.readiness.status, 503);
  assert.deepEqual(seen.map(item => new URL(item.url).pathname).sort(),
    ['/api/legal', '/api/product', '/api/readiness']);
  assert.ok(seen.every(item => item.options.method === 'GET'));
});

test('adds anonymous experiment headers when the CLI supplies them', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push(options.headers);
    if (url.endsWith('/api/product')) return response(200, {});
    if (url.endsWith('/api/readiness')) return response(200, {});
    return response(200, {});
  };
  await inspectOffer({
    fetchImpl,
    experiment: { session: '12345678-1234-4123-8123-123456789abc', source: 'guide-x402' }
  });
  assert.ok(seen.every(headers => headers['x-tollary-experiment-source'] === 'guide-x402'));
  assert.ok(seen.every(headers => headers['x-tollary-experiment-session'].startsWith('12345678')));
});

test('rejects non-HTTPS remote origins', async () => {
  await assert.rejects(() => inspectOffer({ origin: 'http://example.com' }), /HTTPS/);
});

test('integration plan keeps secrets and Mainnet activation outside Tollary', () => {
  const plan = integrationPlan();
  assert.match(plan.prohibited.join(' '), /private key/);
  assert.match(plan.prohibited.join(' '), /Mainnet/);
  assert.equal(plan.custody, 'customer-owned-wallet-and-aws-kms');
  assert.equal(plan.purchaseBoundary.listedPrice, '$0.01 USDC');
  assert.match(plan.purchaseBoundary.client, /guard-client-1\.0\.0\.mjs$/);
  assert.match(plan.purchaseBoundary.clientIntegrity, /guard-client\.manifest\.json$/);
  assert.equal(plan.purchaseBoundary.tollaryReceivesWalletKey, false);
});

test('free lint promotes only a server ALLOW and never creates a payment request itself', async () => {
  let observed;
  const fetchImpl = async (url, options) => {
    observed = { url, options };
    return response(200, { decision: 'ALLOW', intentId: 'sha256:test' });
  };
  const request = { transaction: { type: '0x2' }, mandate: { message: {}, signature: '0x00' } };
  const result = await lintGuardRequest({ request, origin: 'https://tollary.p-e.kr', fetchImpl });
  assert.equal(result.mode, 'free-structural-lint-no-payment-no-rpc-no-funds');
  assert.equal(result.conversion.eligibleForPaidGuard, true);
  assert.match(result.conversion.purchaseClient, /guard-client-1\.0\.0\.mjs$/);
  assert.match(result.conversion.purchaseManifest, /guard-client\.manifest\.json$/);
  assert.equal(observed.url, 'https://tollary.p-e.kr/api/v1/base/usdc/guard/lint');
  assert.equal(observed.options.method, 'POST');
  assert.equal(Object.hasOwn(observed.options.headers, 'payment-signature'), false);
});

test('free lint rejects secret-like fields before any network call', async () => {
  let called = false;
  await assert.rejects(() => lintGuardRequest({
    request: { transaction: { privateKey: 'never' }, mandate: {} },
    fetchImpl: async () => { called = true; return response(200, {}); }
  }), error => error?.code === 'secret-field-prohibited');
  assert.equal(called, false);
});
