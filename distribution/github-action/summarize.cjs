#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

const [input, output, summary] = process.argv.slice(2);
if (!input || !output || !summary) throw new Error('Three protected runner paths are required.');
const result = JSON.parse(fs.readFileSync(input, 'utf8'));
if (result.schemaVersion !== 'tollary-local-fit-check-v1' || typeof result.fit !== 'boolean') {
  throw new Error('Unexpected Tollary result schema.');
}
const allowedSignals = new Set([
  'awsKms', 'secp256k1Signer', 'baseMainnet', 'officialBaseUsdc', 'autonomousExecution'
]);
if (!Array.isArray(result.missing) || result.missing.some(value => !allowedSignals.has(value))) {
  throw new Error('Unexpected Tollary signal name.');
}
const missing = result.missing.join(',');
const next = result.fit ? 'npx tollary@0.1.0 inspect' : '';
const fileCount = Number(result.scanned?.files);
if (!Number.isSafeInteger(fileCount) || fileCount < 0 || fileCount > 2_000) {
  throw new Error('Unexpected Tollary scan count.');
}
fs.appendFileSync(output, `fit=${result.fit}\nmissing=${missing}\nnext_step=${next}\n`);
fs.appendFileSync(summary, [
  '## Tollary local fit check',
  '',
  `- Fit: **${result.fit ? 'yes' : 'no'}**`,
  `- Files inspected locally: ${fileCount}`,
  `- Missing signals: ${missing || 'none'}`,
  '',
  result.fit
    ? 'Inspect the live price, readiness, legal disclosure, and contract with `npx tollary@0.1.0 inspect` before any purchase.'
    : 'No paid product is recommended for this repository.',
  '',
  'Source contents and evidence paths are intentionally not copied into the job summary.'
].join('\n') + '\n');
