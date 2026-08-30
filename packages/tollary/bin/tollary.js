#!/usr/bin/env node
import { resolve } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { DEFAULT_ORIGIN } from '../src/constants.js';
import { runLocalFitCheck } from '../src/fit-check.js';
import { inspectOffer, integrationPlan, lintGuardRequest } from '../src/inspect.js';

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw Object.assign(new Error(`${name} requires a value`), { code: 'missing-option-value' });
  return value;
}

function help() {
  return [
    'Tollary — local discovery and safe integration for Agent Transaction Guard',
    '',
    'Usage:',
    '  tollary fit-check [--project .] [--origin https://tollary.p-e.kr] [--json]',
    '  tollary inspect [--origin https://tollary.p-e.kr] [--json]',
    '  tollary lint --input ./guard-request.json [--origin https://tollary.p-e.kr] [--json]',
    '  tollary plan [--origin https://tollary.p-e.kr] [--json]',
    '',
    'fit-check is local/read-only and skips .env, keys, credentials, vendor, and build directories.',
    'inspect fetches public metadata only. No command accepts a private key or sends funds.'
  ].join('\n');
}

function print(value, json) {
  if (json) process.stdout.write(JSON.stringify(value) + '\n');
  else process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(help() + '\n');
    return 0;
  }
  const json = args.includes('--json');
  const origin = option(args, '--origin', DEFAULT_ORIGIN);
  if (command === 'fit-check') {
    const project = resolve(option(args, '--project', '.'));
    const result = await runLocalFitCheck({ project, origin });
    print(result, json);
    return 0;
  }
  if (command === 'inspect') {
    print(await inspectOffer({ origin }), json);
    return 0;
  }
  if (command === 'lint') {
    const inputOption = option(args, '--input', null);
    if (!inputOption) throw Object.assign(new Error('--input is required'), { code: 'missing-input-file' });
    const input = resolve(inputOption);
    const metadata = await lstat(input);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 2 || metadata.size > 128 * 1024) {
      throw Object.assign(new Error('input must be a regular JSON file up to 128 KiB'), { code: 'invalid-input-file' });
    }
    let request;
    try { request = JSON.parse(await readFile(input, 'utf8')); } catch { throw Object.assign(new Error(), { code: 'invalid-input-json' }); }
    print(await lintGuardRequest({ request, origin }), json);
    return 0;
  }
  if (command === 'plan') {
    print(integrationPlan({ origin }), json);
    return 0;
  }
  throw Object.assign(new Error(`unknown command: ${command}`), { code: 'unknown-command' });
}

try {
  if (process.argv.length === 2 && !process.stdin.isTTY) await import('./tollary-mcp.js');
  else process.exitCode = await main();
} catch (error) {
  process.stderr.write(JSON.stringify({
    schemaVersion: 'tollary-cli-error-v1',
    ok: false,
    errorCode: typeof error?.code === 'string' ? error.code : error?.name || 'Error'
  }) + '\n');
  process.exitCode = 1;
}
