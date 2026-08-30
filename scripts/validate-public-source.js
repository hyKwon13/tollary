import { lstatSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.codex',
  '.ssh',
  '.npm',
  '.cache',
  '.config',
  '.local',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results'
]);

const FORBIDDEN_NAMES = [
  /^\.env(?:\..+)?$/i,
  /^(?:cdp[_-])?api[_-]?key.*\.json$/i,
  /^auth\.json$/i,
  /^mcp-registry-auth-key(?:\..+)?$/i,
  /private[_-]?key/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.(?:pem|key|p12|pfx|jks)$/i,
  /^ssh-key/i
];

function forbiddenName(name) {
  return FORBIDDEN_NAMES.some((pattern) => pattern.test(name));
}

export function validatePublicSource({ root = resolve(import.meta.dirname, '..') } = {}) {
  const absoluteRoot = resolve(root);
  const violations = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isDirectory() && entry.name.startsWith('.legacy-')) continue;
      const absolute = join(directory, entry.name);
      const item = lstatSync(absolute);
      const path = relative(absoluteRoot, absolute);
      if (item.isSymbolicLink()) {
        violations.push(`${path}: symbolic links are not allowed in the public source`);
        continue;
      }
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!item.isFile()) {
        violations.push(`${path}: unsupported filesystem entry`);
        continue;
      }
      if (forbiddenName(basename(path))) {
        violations.push(`${path}: credential-like filename is forbidden`);
      }
    }
  }

  walk(absoluteRoot);
  if (violations.length) {
    throw new Error(`Public source preflight failed:\n${violations.join('\n')}`);
  }
  return { valid: true, checkedRoot: absoluteRoot };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(validatePublicSource()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
