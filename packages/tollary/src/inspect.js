import { DEFAULT_ORIGIN, PACKAGE_VERSION, guardLinks } from './constants.js';

function canonicalOrigin(value = DEFAULT_ORIGIN) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw Object.assign(new Error('origin must use HTTPS'), { code: 'https-origin-required' });
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.origin;
}

const experimentHeaders = experiment => experiment?.session && experiment?.source ? {
  'x-tollary-experiment-session': experiment.session,
  'x-tollary-experiment-source': experiment.source
} : {};

async function getJson(url, fetchImpl, timeoutMs, experiment) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'application/json', 'user-agent': `tollary-cli/${PACKAGE_VERSION}`, ...experimentHeaders(experiment) },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error'
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw Object.assign(new Error(`unexpected content type from ${new URL(url).pathname}`), {
      code: 'unexpected-content-type'
    });
  }
  return { status: response.status, body: await response.json() };
}

export async function inspectOffer({ origin = DEFAULT_ORIGIN, fetchImpl = fetch, timeoutMs = 8_000, experiment = null } = {}) {
  const safeOrigin = canonicalOrigin(origin);
  const links = guardLinks(safeOrigin);
  const [product, readiness, legal] = await Promise.all([
    getJson(links.product, fetchImpl, timeoutMs, experiment),
    getJson(links.readiness, fetchImpl, timeoutMs, experiment),
    getJson(links.privacyApi, fetchImpl, timeoutMs, experiment)
  ]);
  return Object.freeze({
    schemaVersion: 'tollary-offer-inspection-v1',
    mode: 'metadata-only-no-payment-no-wallet-no-funds',
    origin: safeOrigin,
    product,
    readiness,
    legal,
    links
  });
}

function assertPublicGuardRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 2
      || !Object.hasOwn(value, 'transaction') || !Object.hasOwn(value, 'mandate')) {
    throw Object.assign(new Error('request must be exactly {transaction, mandate}'), { code: 'invalid-guard-request-shape' });
  }
  const prohibited = /^(?:privateKey|private_key|seed|seedPhrase|mnemonic|credential|apiKey|api_key|secret)$/i;
  const visit = input => {
    if (!input || typeof input !== 'object') return;
    for (const [key, child] of Object.entries(input)) {
      if (prohibited.test(key)) throw Object.assign(new Error('secret-like field is prohibited'), { code: 'secret-field-prohibited' });
      visit(child);
    }
  };
  visit(value);
}

export async function lintGuardRequest({
  request, origin = DEFAULT_ORIGIN, fetchImpl = fetch, timeoutMs = 8_000, experiment = null
} = {}) {
  assertPublicGuardRequest(request);
  const safeOrigin = canonicalOrigin(origin);
  const response = await fetchImpl(`${safeOrigin}/api/v1/base/usdc/guard/lint`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': `tollary-cli/${PACKAGE_VERSION}`, ...experimentHeaders(experiment) },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error'
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw Object.assign(new Error('unexpected lint response'), { code: 'unexpected-content-type' });
  const result = await response.json();
  const eligible = response.ok && result?.decision === 'ALLOW';
  return Object.freeze({
    schemaVersion: 'tollary-free-lint-result-v1',
    mode: 'free-structural-lint-no-payment-no-rpc-no-funds',
    status: response.status,
    result,
    conversion: eligible ? {
      eligibleForPaidGuard: true,
      endpoint: `${safeOrigin}/api/v1/base/usdc/guard`,
      price: '$0.01 USDC',
      action: 'Submit the same still-fresh request through a caller-owned x402 buyer.',
      purchaseClient: `${safeOrigin}/sdk/guard-client-1.0.0.mjs`,
      purchaseManifest: `${safeOrigin}/sdk/guard-client.manifest.json`,
      purchaseGuide: `${safeOrigin}/sdk/guard-client-README.md`,
      verificationSdk: `${safeOrigin}/sdk/guarded-viem-3.0.0.mjs`,
      legal: `${safeOrigin}/legal`,
      openapi: `${safeOrigin}/openapi.guard.json`
    } : { eligibleForPaidGuard: false }
  });
}

export function integrationPlan({ origin = DEFAULT_ORIGIN } = {}) {
  const safeOrigin = canonicalOrigin(origin);
  const links = guardLinks(safeOrigin);
  return Object.freeze({
    schemaVersion: 'tollary-integration-plan-v1',
    custody: 'customer-owned-wallet-and-aws-kms',
    steps: [
      { order: 1, action: 'Run tollary fit-check locally. Do not upload credentials or source code.' },
      { order: 2, action: `Review the exact input/output contract at ${links.openapi}.` },
      { order: 3, action: 'Create and sign a short-lived owner mandate outside the agent runtime.' },
      { order: 4, action: `Use the pinned purchase client and manifest at ${links.purchaseGuide} to let a customer-owned x402 buyer answer the $0.01 challenge.` },
      { order: 5, action: `Verify both the x402 receipt and Tollary Ed25519 attestation with ${links.verificationManifest} before KMS signing.` }
    ],
    purchaseBoundary: {
      endpoint: links.paidGuard,
      listedPrice: '$0.01 USDC',
      client: links.purchaseClient,
      clientIntegrity: links.purchaseManifest,
      guide: links.purchaseGuide,
      verificationSdk: links.verificationSdk,
      verificationIntegrity: links.verificationManifest,
      paymentCapability: 'caller-owned-x402-buyer-callback',
      tollaryReceivesWalletKey: false
    },
    prohibited: [
      'Do not send a private key, seed phrase, AWS credential, or generic signing capability to Tollary.',
      'Do not enable Mainnet until the customer has completed its own legal, security, and testnet review.'
    ],
    links
  });
}
