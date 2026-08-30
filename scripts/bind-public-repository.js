#!/usr/bin/env node
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isDirectExecution } from './direct-execution.js';

const REPOSITORY_SLUG = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PACKAGE_NAME = 'tollary';
const MCP_NAME = 'kr.p-e.tollary/agent-transaction-guard';

const syncDirectory = directory => {
  const descriptor = openSync(directory, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
};

const atomicJson = (file, value) => {
  const temporary = `${file}.${process.pid}.bind.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    const descriptor = openSync(temporary, 'r');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    renameSync(temporary, file);
    syncDirectory(dirname(file));
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
};

export function bindPublicRepository({ root = resolve(import.meta.dirname, '..'), repository } = {}) {
  if (!REPOSITORY_SLUG.test(String(repository || ''))) {
    throw new Error('Repository must be the exact GitHub OWNER/REPOSITORY slug.');
  }
  const packageFile = resolve(root, 'packages/tollary/package.json');
  const serverFile = resolve(root, 'packages/tollary/server.json');
  const manifest = JSON.parse(readFileSync(packageFile, 'utf8'));
  const server = JSON.parse(readFileSync(serverFile, 'utf8'));
  if (manifest.name !== PACKAGE_NAME || manifest.mcpName !== MCP_NAME
      || server.name !== MCP_NAME || server.version !== manifest.version) {
    throw new Error('Tollary package and MCP identities are inconsistent.');
  }
  const packageRepository = `git+https://github.com/${repository}.git`;
  const serverRepository = `https://github.com/${repository}`;
  const currentPackageRepository = typeof manifest.repository === 'string'
    ? manifest.repository : manifest.repository?.url;
  const currentServerRepository = server.repository?.url;
  if ((currentPackageRepository && currentPackageRepository !== packageRepository)
      || (currentServerRepository && currentServerRepository !== serverRepository)) {
    throw new Error('A different public repository is already bound.');
  }
  manifest.repository = { type: 'git', url: packageRepository };
  manifest.bugs = { url: `${serverRepository}/issues` };
  server.repository = { url: serverRepository, source: 'github' };
  atomicJson(packageFile, manifest);
  atomicJson(serverFile, server);
  return Object.freeze({
    bound: true,
    repository,
    packageRepository,
    mcpRepository: serverRepository
  });
}

const parse = args => {
  if (args.length !== 2 || args[0] !== '--repository') {
    throw new Error('Usage: --repository OWNER/REPOSITORY');
  }
  return { repository: args[1] };
};

if (isDirectExecution(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(bindPublicRepository(parse(process.argv.slice(2)))) + '\n'); }
  catch (error) {
    process.stderr.write(JSON.stringify({ bound: false, error: error.message }) + '\n');
    process.exitCode = 2;
  }
}
