import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const directory = new URL('./', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('package.json', directory), 'utf8'),
);
const program = fileURLToPath(new URL('dist/darb-mcp.mjs', directory));
try {
  const code = await readFile(program, 'utf8');
  if (!code.startsWith('#!/usr/bin/env node\n'))
    throw new Error('Missing CLI shebang.');
  const version = execFileSync(process.execPath, [program, '--version'], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
  if (version !== manifest.version)
    throw new Error('Built CLI version differs from package.json.');
} catch (error) {
  throw new Error(
    'MCP package is missing or stale. From the Darb repository run npm run build:mcp, then retry.',
    { cause: error },
  );
}
