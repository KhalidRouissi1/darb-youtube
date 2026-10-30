// Install the candidate outside the checkout, then exercise the actual published CLI.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'darb-package-'));
const env = {
  ...process.env,
  PATH: dirname(process.execPath) + delimiter + (process.env.PATH ?? ''),
};
const run = (command, args, options = {}) =>
  execute(command, args, {
    env,
    cwd: directory,
    timeout: 120000,
    maxBuffer: 4_000_000,
    ...options,
  });
let client;
try {
  await run(process.execPath, [join(root, 'scripts/build-mcp.mjs')]);
  const packed = Object.values(
    JSON.parse(
      (
        await run('npm', [
          'pack',
          join(root, 'packages/darb-mcp'),
          '--json',
          '--pack-destination',
          directory,
        ])
      ).stdout,
    ),
  )[0];
  const allowed = new Set([
    'package.json',
    'README.md',
    'LICENSE',
    'check-package.mjs',
    'dist/darb-mcp.mjs',
  ]);
  assert.deepEqual(new Set(packed.files.map((f) => f.path)), allowed);
  assert.equal(packed.name, '@khalidrouissi/darb-mcp');
  const prefix = join(directory, 'installed');
  await run('npm', [
    'install',
    '--global',
    '--prefix',
    prefix,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    join(directory, packed.filename),
  ]);
  const program = join(prefix, 'bin/darb-mcp');
  const manifest = JSON.parse(
    await readFile(join(root, 'packages/darb-mcp/package.json'), 'utf8'),
  );
  assert.equal(
    (await run(program, ['--version'])).stdout.trim(),
    manifest.version,
  );
  assert.match(
    (await run(program, ['--help'])).stdout,
    /setup --client codex\|claude/,
  );
  for (const args of [
    ['setup', '--client', '.codex', '--snapshot', '/missing.json'],
    ['setup'],
    ['--snapshot', '/missing.json'],
  ]) {
    const error = await run(program, args).then(
      () => null,
      (error) => error,
    );
    assert.ok(error, 'Expected a friendly CLI failure');
    assert.match(error.stderr, /Darb:/);
    assert.doesNotMatch(error.stderr, /ZodError|at parseSetup|file:\/\//);
  }
  const snapshot = join(directory, 'sample.json');
  await writeFile(
    snapshot,
    JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      courses: [],
      playlists: [],
    }),
  );
  client = new Client({ name: 'darb-package-smoke', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: program,
      args: ['--snapshot', snapshot],
      cwd: directory,
      stderr: 'pipe',
    }),
  );
  assert.equal((await client.listTools()).tools.length, 4);
  const response = await client.callTool({
    name: 'darb_list_courses',
    arguments: {},
  });
  assert.notEqual(response.isError, true);
  assert.match(JSON.stringify(response), /snapshot/);
  await client.close();
  client = undefined;
  // Fake clients record arguments in this temp directory; real user settings are untouched.
  const bin = join(directory, 'fake-clients');
  await mkdir(bin);
  for (const name of ['codex', 'claude']) {
    const capture = join(directory, name + '-args.json');
    const executable = join(bin, name);
    await writeFile(
      executable,
      `#!/usr/bin/env node\nconst fs=require('node:fs');if(process.argv[2]==='--version'){console.log('test-client');}else{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify(process.argv.slice(2)));}\n`,
      { mode: 0o755 },
    );
    const setup = await run(
      program,
      ['setup', '--client', name, '--snapshot', snapshot],
      { env: { ...env, PATH: bin + delimiter + env.PATH } },
    );
    assert.equal(JSON.parse(setup.stdout).server, 'darb-snapshot');
    const args = JSON.parse(await readFile(capture, 'utf8'));
    assert.deepEqual(args.slice(0, 2), ['mcp', 'add']);
    assert.ok(args.includes('darb-snapshot'));
    assert.ok(args.includes('--snapshot'));
    assert.ok(args.includes(snapshot));
    if (name === 'claude')
      assert.ok(args.includes('--scope') && args.includes('user'));
  }
  console.log(
    'Package allowlist, isolated global installation, CLI, MCP stdio tools, and Codex/Claude setup verified. No real client or browser configuration changed.',
  );
} finally {
  await client?.close();
  await rm(directory, { recursive: true, force: true });
}
