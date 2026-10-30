import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { installHost } from './native';

const execute = promisify(execFile);

/** Linux desktop installations can bundle Codex without adding it to PATH. */
export async function resolveClient(
  client: 'codex' | 'claude',
  desktopPaths = ['/usr/lib/chatgpt/resources/codex', '/opt/Codex/resources/codex'],
  probe: (command: string) => Promise<unknown> = (command) =>
    execute(command, ['--version'], { timeout: 10000 }),
) {
  for (const command of [client, ...(client === 'codex' ? desktopPaths : [])]) {
    try {
      await probe(command);
      return command;
    } catch {
      // Try the bundled desktop executable when the terminal CLI is unavailable.
    }
  }
  throw new Error(
    client === 'codex'
      ? 'Could not find Codex. Install Codex desktop or make the Codex CLI available in PATH.'
      : 'Install Claude Code first and make sure claude is available in PATH.',
  );
}
export function parseSetup(args: string[]) {
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (
      !key ||
      !['--client', '--browser', '--connection', '--snapshot'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      key in values
    )
      throw new Error(
        'Use setup --client codex|claude --connection /path/file.json --browser chrome|brave|firefox, or setup --client codex|claude --snapshot /path/export.json.',
      );
    values[key] = value;
  }
  if (values['--client'] === '.codex')
    throw new Error(
      'Your shell changed codex to .codex. Run darb-mcp setup with no options, or answer n to Zsh’s correction prompt.',
    );
  const parsed = z
    .object({
      '--client': z.enum(['codex', 'claude']),
      '--browser': z.enum(['chrome', 'brave', 'firefox']).optional(),
      '--connection': z.string().min(1).optional(),
      '--snapshot': z.string().min(1).optional(),
    })
    .safeParse(values);
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0];
    throw new Error(
      key === '--client'
        ? 'Choose --client codex or --client claude. For guided setup, run darb-mcp setup with no options.'
        : key === '--browser'
          ? 'Choose --browser brave, chrome or firefox.'
          : 'Invalid setup options. Run darb-mcp setup for guided setup.',
    );
  }
  const options = parsed.data;
  if (Boolean(options['--connection']) === Boolean(options['--snapshot']))
    throw new Error('Choose either --connection or --snapshot.');
  if (options['--connection'] && !options['--browser'])
    throw new Error(
      'Choose --browser chrome, brave or firefox for live setup.',
    );
  if (options['--snapshot'] && options['--browser'])
    throw new Error('--browser is only used with --connection.');
  return options;
}

/** Explicit setup changes this client's MCP registration; normal server startup never does. */
export async function setupClient(args: string[]) {
  const options = parseSetup(args);
  if (process.platform !== 'linux')
    throw new Error(
      'Guided setup currently supports Linux. Use manual stdio configuration for read-only snapshot mode on other platforms.',
    );
  const client = options['--client'];
  const snapshot = options['--snapshot'];
  const file = resolve((snapshot ?? options['--connection'])!);
  if (!(await stat(file).catch(() => null))?.isFile())
    throw new Error(
      'Connection/export file not found. Run darb-mcp setup to choose the downloaded file.',
    );
  const clientCommand = await resolveClient(client);
  const connection = snapshot
    ? null
    : await installHost(file, options['--browser']!);
  const command = connection?.command ?? process.execPath;
  const launch = connection?.args ?? [
    resolve(process.argv[1]!),
    '--snapshot',
    file,
  ];
  const name = snapshot ? 'darb-snapshot' : 'darb-live';
  const registration =
    client === 'codex'
      ? ['mcp', 'add', name, '--', command, ...launch]
      : [
          'mcp',
          'add',
          '--transport',
          'stdio',
          '--scope',
          'user',
          name,
          '--',
          command,
          ...launch,
        ];
  try {
    await execute(clientCommand, registration, { timeout: 15000 });
  } catch {
    // Do not echo client stderr or the private connection JSON.
    throw new Error(
      `Could not register ${name} in ${client}. Check ${client} mcp list for an existing entry. ${connection ? 'The browser bridge was installed; --setup-live can print registration commands for its private configuration path.' : 'No browser bridge was installed.'}`,
    );
  }
  return {
    server: name,
    client,
    verify: `${JSON.stringify(clientCommand)} mcp get ${name}`,
    next: snapshot
      ? 'Restart your client session and ask: Use Darb to list my shared courses.'
      : 'Return to Darb → Assistant and click Save live access settings to reconnect. Keep that browser profile open, restart your client session, and ask: Use Darb to list my shared courses.',
  };
}
