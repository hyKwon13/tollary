import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { FIT_CHECK_SCHEMA, OFFICIAL_BASE_USDC, guardLinks } from './constants.js';

const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_DEPTH = 12;
const SKIP_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.next', '.nuxt', '.terraform', '.venv',
  'build', 'coverage', 'dist', 'node_modules', 'target', 'vendor'
]);
const SAFE_FILENAMES = new Set([
  'dockerfile', 'makefile', 'package.json', 'package-lock.json', 'pnpm-lock.yaml',
  'yarn.lock', 'pyproject.toml', 'requirements.txt', 'cargo.toml',
  '.env.example', '.env.sample'
]);
const SAFE_EXTENSIONS = new Set([
  '.cjs', '.go', '.hcl', '.java', '.js', '.json', '.jsx', '.md', '.mjs', '.py',
  '.rs', '.sh', '.tf', '.toml', '.ts', '.tsx', '.yaml', '.yml'
]);
const SECRET_NAME = /(?:^|[._-])(secret|private|credential|mnemonic|seed|keystore|wallet)(?:[._-]|$)/i;
const SECRET_EXTENSION = new Set(['.key', '.pem', '.p12', '.pfx', '.jks', '.kdbx']);

const detectors = Object.freeze({
  awsKms: [/kms\s*:\s*Sign/i, /KMS_KEY_(?:ARN|ID)/i, /@aws-sdk\/client-kms/i],
  secp256k1Signer: [/(?:ECC_SECG_P256K1|secp256k1)/i],
  baseMainnet: [/(?:chainId|chain_id)\s*[:=]\s*["']?(?:8453|0x2105)\b/i, /base-mainnet|mainnet\.base\.org/i],
  officialBaseUsdc: [new RegExp(OFFICIAL_BASE_USDC, 'i')],
  autonomousExecution: [/\bx402\b/i, /(?:agent|autonomous).{0,80}(?:pay|payment|transfer|wallet|sign|broadcast)/is,
    /(?:pay|payment|transfer|wallet|sign|broadcast).{0,80}(?:agent|autonomous)/is]
});

function safeRelative(root, path) {
  const value = relative(root, path);
  return value.split(sep).join('/');
}

function shouldRead(name) {
  const lower = name.toLowerCase();
  if (lower === '.env' || lower.startsWith('.env.') && !SAFE_FILENAMES.has(lower)) return false;
  const extension = extname(lower);
  if (SECRET_EXTENSION.has(extension) || SECRET_NAME.test(lower)) return false;
  return SAFE_FILENAMES.has(lower) || SAFE_EXTENSIONS.has(extension);
}

async function readPrefix(path, size) {
  const handle = await open(path, 'r');
  try {
    const length = Math.min(size, MAX_FILE_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

async function collectFiles(root) {
  const files = [];
  let totalBytes = 0;
  let truncated = false;
  async function walk(directory, depth) {
    if (depth > MAX_DEPTH || truncated) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (truncated) break;
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name.toLowerCase())) await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile() || !shouldRead(entry.name)) continue;
      const metadata = await lstat(path);
      if (metadata.size > MAX_FILE_BYTES) continue;
      if (files.length >= MAX_FILES || totalBytes + metadata.size > MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      totalBytes += metadata.size;
      files.push({ path, size: metadata.size });
    }
  }
  await walk(root, 0);
  return { files, totalBytes, truncated };
}

export async function runLocalFitCheck({ project = '.', origin, allowedRoot = null } = {}) {
  const requestedRoot = resolve(project);
  const rootMetadata = await lstat(requestedRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw Object.assign(new Error('project must be a real directory'), { code: 'invalid-project-directory' });
  }
  const root = await realpath(requestedRoot);
  if (allowedRoot !== null) {
    const boundary = await realpath(resolve(allowedRoot));
    if (root !== boundary && !root.startsWith(boundary + sep)) {
      throw Object.assign(new Error('project is outside the allowed root'), { code: 'project-outside-allowed-root' });
    }
  }
  const { files, totalBytes, truncated } = await collectFiles(root);
  const evidence = Object.fromEntries(Object.keys(detectors).map(name => [name, []]));
  for (const file of files) {
    const text = await readPrefix(file.path, file.size);
    for (const [name, patterns] of Object.entries(detectors)) {
      if (patterns.some(pattern => pattern.test(text))) evidence[name].push(safeRelative(root, file.path));
    }
  }
  const signals = Object.fromEntries(Object.entries(evidence).map(([name, paths]) => [name, paths.length > 0]));
  const fit = signals.awsKms && signals.secp256k1Signer && signals.baseMainnet
    && signals.officialBaseUsdc && signals.autonomousExecution;
  const missing = Object.entries(signals).filter(([, present]) => !present).map(([name]) => name);
  const links = guardLinks(origin);
  return Object.freeze({
    schemaVersion: FIT_CHECK_SCHEMA,
    mode: 'local-read-only-no-network-no-secrets-no-funds',
    fit,
    qualification: fit ? 'aws-kms-base-usdc-agent-payment' : 'not-yet-qualified',
    scanned: { files: files.length, bytes: totalBytes, truncated },
    signals,
    evidence,
    missing,
    conversion: fit ? {
      eligibleForPaidGuard: true,
      reason: 'The project appears to automate official Base USDC with an AWS KMS secp256k1 signer.',
      inspectOffer: `tollary inspect --origin ${origin}`,
      paidEndpoint: links.paidGuard,
      openapi: links.openapi,
      integration: links.integration,
      safety: 'The buyer keeps its wallet and AWS credentials. Never paste a private key into Tollary.'
    } : {
      eligibleForPaidGuard: false,
      reason: 'The paid Guard is intentionally not promoted until all four local fit signals are present.',
      next: 'Add or explicitly configure the missing architecture signals, then rerun the local check.'
    }
  });
}
