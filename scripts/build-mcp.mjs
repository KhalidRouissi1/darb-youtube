import { build } from 'esbuild';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
for (const relative of [
  '.output/mcp/darb-mcp.mjs',
  'packages/darb-mcp/dist/darb-mcp.mjs',
]) {
  const outfile = fileURLToPath(new URL(relative, root));
  await build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: [fileURLToPath(new URL('companion/main.ts', root))],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    tsconfig: fileURLToPath(new URL('tsconfig.json', root)),
    banner: { js: '#!/usr/bin/env node' },
  });
  await chmod(outfile, 0o755);
}
await mkdir(new URL('packages/darb-mcp/', root), { recursive: true });
await copyFile(
  new URL('LICENSE', root),
  new URL('packages/darb-mcp/LICENSE', root),
);
