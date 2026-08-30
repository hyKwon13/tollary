import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function isDirectExecution(moduleUrl, entryPath = process.argv[1]) {
  if (!entryPath) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entryPath)).href;
  } catch {
    return false;
  }
}
