import { readFileSync } from 'node:fs';

const packageMetadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const PACKAGE_VERSION = packageMetadata.version;
export const DEFAULT_ORIGIN = 'https://tollary.p-e.kr';
export const GUARD_PATH = '/api/v1/base/usdc/guard';
export const FIT_CHECK_SCHEMA = 'tollary-local-fit-check-v1';
export const OFFICIAL_BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

export const guardLinks = origin => Object.freeze({
  product: `${origin}/api/product`,
  readiness: `${origin}/api/readiness`,
  legal: `${origin}/legal`,
  privacyApi: `${origin}/api/legal`,
  openapi: `${origin}/openapi.guard.json`,
  paidGuard: `${origin}${GUARD_PATH}`,
  purchaseClient: `${origin}/sdk/guard-client-1.0.0.mjs`,
  purchaseManifest: `${origin}/sdk/guard-client.manifest.json`,
  purchaseGuide: `${origin}/sdk/guard-client-README.md`,
  verificationSdk: `${origin}/sdk/guarded-viem-3.0.0.mjs`,
  verificationManifest: `${origin}/sdk/guarded-viem.manifest.json`,
  integration: `${origin}/sdk/aws-kms-guard-gateway-README.md`
});
