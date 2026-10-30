import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { homedir } from 'node:os';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type WizardIO = {
  ask: (question: string) => Promise<string>;
  write: (text: string) => void;
};
export function inputPath(value: string, userDirectory = homedir()) {
  let path = value.trim();
  if (
    (path.startsWith('"') && path.endsWith('"')) ||
    (path.startsWith("'") && path.endsWith("'"))
  )
    path = path.slice(1, -1);
  path = path.replace(/\\([ ()'"\\])/g, '$1');
  if (path.startsWith('~/')) path = join(userDirectory, path.slice(2));
  return resolve(path);
}
export async function findExports(
  directory: string,
  mode: 'connection' | 'snapshot',
) {
  const names = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const pattern = new RegExp(`^darb-${mode}(?:[\\s(._-].*)?\\.json$`, 'i');
  const files = await Promise.all(
    names
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        const info = await stat(path).catch(() => null);
        return info ? { path, modified: info.mtimeMs } : null;
      }),
  );
  return files
    .filter((f): f is { path: string; modified: number } => !!f)
    .sort((a, b) => b.modified - a.modified)
    .slice(0, 20)
    .map((f) => f.path);
}
export async function downloadsDirectory(userDirectory = homedir()) {
  const config = await readFile(
    join(userDirectory, '.config/user-dirs.dirs'),
    'utf8',
  ).catch(() => '');
  const value = /^XDG_DOWNLOAD_DIR="([^"\r\n]+)"/m.exec(config)?.[1];
  if (value?.startsWith('$HOME/')) return join(userDirectory, value.slice(6));
  if (value?.startsWith('/')) return value;
  return join(userDirectory, 'Downloads');
}
async function choose(io: WizardIO, label: string, choices: string[]) {
  io.write(
    `\n${label}\n${choices.map((name, i) => `  ${i + 1}. ${name}`).join('\n')}\n`,
  );
  while (true) {
    const answer = (await io.ask('Choose a number [1]: ')).trim() || '1';
    const index = Number(answer) - 1;
    if (
      /^\d+$/.test(answer) &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < choices.length
    )
      return index;
    io.write(`Enter a number from 1 to ${choices.length}.\n`);
  }
}
export async function wizardArgs(io: WizardIO, directory: string) {
  io.write(
    'Darb setup\nThis connects only the courses you choose to share. Press Ctrl+C to cancel.\n',
  );
  const client = ['codex', 'claude'][
    await choose(io, 'Which AI app?', ['Codex', 'Claude Code'])
  ]!;
  const snapshot =
    (await choose(io, 'How do you want to connect?', [
      'Live browser connection',
      'Read-only exported snapshot',
    ])) === 1;
  const browser = snapshot
    ? undefined
    : ['brave', 'chrome', 'firefox'][
        await choose(io, 'Which browser has Darb?', [
          'Brave',
          'Chrome',
          'Firefox',
        ])
      ]!;
  const mode = snapshot ? 'snapshot' : 'connection';
  io.write(
    snapshot
      ? '\nIn Darb → Dashboard → Assistant, select courses and click Export selected data.\n'
      : '\nIn Darb → Dashboard → Assistant, select courses, Save live access settings, then Download private connection file. Keep its contents local.\n',
  );
  let file: string;
  while (true) {
    const files = await findExports(directory, mode);
    if (files.length) {
      const index = await choose(
        io,
        `Found exports in ${directory} (newest first):`,
        [...files, 'Choose another file'],
      );
      if (index < files.length) {
        file = files[index]!;
        break;
      }
    }
    const answer = await io.ask(
      files.length
        ? 'Paste or drag the file path here: '
        : `No Darb ${mode} export found in ${directory}. Download it, then press Enter to look again, or paste/drag its file path: `,
    );
    if (!answer.trim()) continue;
    const candidate = inputPath(answer);
    if ((await stat(candidate).catch(() => null))?.isFile()) {
      file = candidate;
      break;
    }
    io.write(
      'That file was not found. Check the path or download the export again.\n',
    );
  }
  io.write(
    `\nConnecting ${client === 'codex' ? 'Codex' : 'Claude Code'} to Darb${browser ? ` in ${browser}` : ' using the snapshot'}…\n`,
  );
  return [
    '--client',
    client,
    ...(browser ? ['--browser', browser] : []),
    snapshot ? '--snapshot' : '--connection',
    file,
  ];
}
export async function interactiveSetupArgs() {
  if (process.platform !== 'linux')
    throw new Error(
      'Guided setup currently supports Linux. Use manual stdio configuration for read-only snapshots on other platforms.',
    );
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error(
      'Interactive setup needs a terminal. Run darb-mcp setup in your terminal, or pass --client and --connection/--snapshot for automation.',
    );
  const readline = createInterface({ input: stdin, output: stdout });
  const abort = new AbortController();
  readline.on('SIGINT', () => abort.abort());
  try {
    return await wizardArgs(
      {
        ask: (question) =>
          readline.question(question, { signal: abort.signal }),
        write: (text) => stdout.write(text),
      },
      await downloadsDirectory(),
    );
  } finally {
    readline.close();
  }
}
