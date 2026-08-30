#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { DEFAULT_ORIGIN, PACKAGE_VERSION } from '../src/constants.js';
import { runLocalFitCheck } from '../src/fit-check.js';
import { inspectOffer, integrationPlan, lintGuardRequest } from '../src/inspect.js';

const tools = Object.freeze([
  {
    name: 'tollary_free_lint',
    description: 'Submit exactly {transaction, mandate} to the free structural lint. It makes no RPC, wallet, or payment call.',
    inputSchema: { type: 'object', required: ['request'], additionalProperties: false, properties: {
      request: { type: 'object', description: 'Public unsigned transaction and owner-signed mandate. Never include secrets.' },
      origin: { type: 'string', description: 'Tollary HTTPS origin.' }
    } }
  },
  {
    name: 'tollary_fit_check',
    description: 'Read-only local project fit check. It skips secrets and makes no network, wallet, or payment call.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      project: { type: 'string', description: 'Local project directory. Defaults to the MCP process working directory.' },
      origin: { type: 'string', description: 'Tollary HTTPS origin.' }
    } }
  },
  {
    name: 'tollary_inspect_offer',
    description: 'Fetch public product, readiness, and legal metadata without paying or connecting a wallet.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      origin: { type: 'string', description: 'Tollary HTTPS origin.' }
    } }
  },
  {
    name: 'tollary_get_integration_plan',
    description: 'Return the non-custodial integration sequence and prohibited secret-handling paths.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      origin: { type: 'string', description: 'Tollary HTTPS origin.' }
    } }
  }
]);

function response(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function callTool(name, args = {}) {
  if (name === 'tollary_fit_check') return runLocalFitCheck({
    project: args.project || process.cwd(),
    origin: args.origin || DEFAULT_ORIGIN,
    allowedRoot: process.cwd()
  });
  if (name === 'tollary_inspect_offer') return inspectOffer({ origin: args.origin || DEFAULT_ORIGIN });
  if (name === 'tollary_free_lint') return lintGuardRequest({ request: args.request, origin: args.origin || DEFAULT_ORIGIN });
  if (name === 'tollary_get_integration_plan') return integrationPlan({ origin: args.origin || DEFAULT_ORIGIN });
  throw Object.assign(new Error('Unknown tool.'), { code: -32602 });
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return errorResponse(message?.id ?? null, -32600, 'Invalid Request');
  }
  if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) return null;
  if (message.method === 'initialize') return response(message.id, {
    protocolVersion: message.params?.protocolVersion || '2025-06-18',
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'tollary', version: PACKAGE_VERSION },
    instructions: 'Run the local fit check first. Never provide private keys, seed phrases, or AWS credentials.'
  });
  if (message.method === 'ping') return response(message.id, {});
  if (message.method === 'tools/list') return response(message.id, { tools });
  if (message.method === 'tools/call') {
    try {
      const value = await callTool(message.params?.name, message.params?.arguments || {});
      return response(message.id, {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: value,
        isError: false
      });
    } catch (error) {
      return response(message.id, {
        content: [{ type: 'text', text: JSON.stringify({
          ok: false,
          errorCode: typeof error?.code === 'string' ? error.code : error?.name || 'Error'
        }) }],
        isError: true
      });
    }
  }
  return errorResponse(message.id ?? null, -32601, 'Method not found');
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  let output;
  try {
    if (Buffer.byteLength(line, 'utf8') > 1024 * 1024) throw Object.assign(new Error(), { mcpParseCode: -32700 });
    output = await handle(JSON.parse(line));
  } catch {
    output = errorResponse(null, -32700, 'Parse error');
  }
  if (output) process.stdout.write(JSON.stringify(output) + '\n');
}
