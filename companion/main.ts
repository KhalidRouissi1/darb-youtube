import manifest from '../packages/darb-mcp/package.json';
import { interactiveSetupArgs } from './setup-wizard';
import { ZodError } from 'zod';
import { setupClient } from './setup';
import { setupForMode } from './client-setup';
import { readFile, stat } from 'node:fs/promises';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { makeServer, snapshotHandler } from './service';
import { installHost, liveRequest, nativeHost } from './native';
async function main() {
  const [mode, file, browser] = process.argv.slice(2);
  if (mode === '--version') console.log(manifest.version);
  else if (
    mode === '--help' ||
    mode === '-h' ||
    (mode === 'setup' && (file === '--help' || file === '-h'))
  )
    console.log(
      'Darb MCP\n\nEasy setup: darb-mcp setup\n\nAdvanced setup: darb-mcp setup --client codex|claude --connection /path/connection.json --browser chrome|brave|firefox\nRead-only: darb-mcp setup --client codex|claude --snapshot /path/export.json\n\nServer modes: --snapshot FILE | --live FILE | --native\nManual setup: --install FILE chrome|brave|firefox | --setup-snapshot FILE | --setup-live FILE\nLive browser installation currently supports Linux only.',
    );
  else if (mode === 'setup') {
    const args = process.argv.slice(3);
    const result = await setupClient(
      args.length ? args : await interactiveSetupArgs(),
    );
    console.log(
      args.length
        ? JSON.stringify(result, null, 2)
        : `\nConnected ${result.server} to ${result.client}.\n\n${result.next}\n\nCheck: ${result.verify}`,
    );
  } else if (mode === '--native') await nativeHost();
  else if (mode === '--install' && file)
    console.log(
      JSON.stringify(await installHost(file, browser ?? 'chrome'), null, 2),
    );
  else if ((mode === '--setup-snapshot' || mode === '--setup-live') && file) {
    await stat(file);
    console.log(
      JSON.stringify(
        setupForMode(mode === '--setup-live' ? 'live' : 'snapshot', file),
        null,
        2,
      ),
    );
  } else if (mode === '--snapshot' && file) {
    if ((await stat(file)).size > 10_000_000)
      throw new Error('Snapshot exceeds 10 MB.');
    const handler = snapshotHandler(JSON.parse(await readFile(file, 'utf8')));
    serveStdio(() => makeServer(handler));
  } else if (mode === '--live' && file)
    serveStdio(() =>
      makeServer((tool, args) => liveRequest(file, tool, args), true),
    );
  else {
    process.stderr.write(
      'Run darb-mcp setup to connect Darb, or darb-mcp --help for advanced options.\n',
    );
    process.exitCode = 1;
  }
}
main().catch((error: unknown) => {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  const message =
    error instanceof ZodError
      ? 'The connection or export file is invalid. Download a new file from Darb → Assistant.'
      : error instanceof SyntaxError
        ? 'The selected file is not valid JSON. Download a new file from Darb → Assistant.'
        : error instanceof Error && error.name === 'AbortError'
          ? 'Setup canceled.'
          : code === 'ENOENT'
            ? 'File or command not found. Run darb-mcp setup for guided setup.'
            : code === 'EACCES'
              ? 'Permission denied. Choose a file you can read or check your installation permissions.'
              : error instanceof Error
                ? error.message
                : 'Could not complete the command. Run darb-mcp --help.';
  process.stderr.write(`Darb: ${message}\n`);
  process.exitCode = 1;
});
