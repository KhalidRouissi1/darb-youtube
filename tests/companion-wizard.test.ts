import { afterEach, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  utimes,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  downloadsDirectory,
  findExports,
  inputPath,
  wizardArgs,
  type WizardIO,
} from '../companion/setup-wizard';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), 'darb-wizard-'));
  directories.push(directory);
  return directory;
}
function terminal(answers: string[]) {
  const output: string[] = [];
  const io: WizardIO = {
    write: (text) => {
      output.push(text);
    },
    ask: async (question) => {
      output.push(question);
      if (!answers.length) throw new Error('Unexpected extra prompt');
      return answers.shift()!;
    },
  };
  return { io, output };
}
it('connects Codex and Brave with Enter defaults and finds the newest export without entering a path', async () => {
  const directory = await temporary();
  await writeFile(
    join(directory, 'darb-connection.json'),
    'DO NOT PRINT THIS SECRET',
  );
  await utimes(join(directory, 'darb-connection.json'), 100, 100);
  const newest = join(directory, 'darb-connection (1).json');
  await writeFile(newest, 'ANOTHER SECRET');
  const { io, output } = terminal(['', '', '', '']);
  expect(await wizardArgs(io, directory)).toEqual([
    '--client',
    'codex',
    '--browser',
    'brave',
    '--connection',
    newest,
  ]);
  expect(output.join('')).not.toContain('ANOTHER SECRET');
  expect(output.join('')).not.toContain('DO NOT PRINT THIS SECRET');
});
it('supports Claude Code snapshots without asking for a browser', async () => {
  const directory = await temporary();
  const path = join(directory, 'darb-snapshot.json');
  await writeFile(path, '{}');
  const { io, output } = terminal(['2', '2', '1']);
  expect(await wizardArgs(io, directory)).toEqual([
    '--client',
    'claude',
    '--snapshot',
    path,
  ]);
  expect(output.join('')).not.toContain('Which browser');
});
it('allows a dragged quoted path from another directory and retries bad menu answers', async () => {
  const directory = await temporary();
  const custom = join(directory, 'my private connection.json');
  await writeFile(custom, '{}');
  const { io, output } = terminal(['oops', '1', '1', '2', `'${custom}'`]);
  expect(await wizardArgs(io, directory)).toEqual([
    '--client',
    'codex',
    '--browser',
    'chrome',
    '--connection',
    custom,
  ]);
  expect(output.join('')).toContain('Enter a number from 1 to 2');
});
it('refreshes Downloads after the user exports the file without reading file contents', async () => {
  const directory = await temporary();
  let asks = 0;
  const path = join(directory, 'darb-connection.json');
  const io: WizardIO = {
    write: () => undefined,
    ask: async () => {
      if (++asks === 4) await writeFile(path, 'private');
      return '';
    },
  };
  expect(await wizardArgs(io, directory)).toContain(path);
  expect(asks).toBe(5);
});
it('discovers only expected regular export files, excluding unrelated JSON, directories and symlinks', async () => {
  const directory = await temporary();
  await writeFile(join(directory, 'passwords.json'), '{}');
  await mkdir(join(directory, 'darb-connection.json'));
  await symlink(
    join(directory, 'passwords.json'),
    join(directory, 'darb-connection-linked.json'),
  );
  expect(await findExports(directory, 'connection')).toEqual([]);
});
it('honors the localized Linux Downloads location without evaluating shell expressions', async () => {
  const directory = await temporary();
  await mkdir(join(directory, '.config'));
  await writeFile(
    join(directory, '.config/user-dirs.dirs'),
    'XDG_DOWNLOAD_DIR="$HOME/Téléchargements"\n',
  );
  expect(await downloadsDirectory(directory)).toBe(
    join(directory, 'Téléchargements'),
  );
  expect(inputPath('~/Downloads/export.json', directory)).toBe(
    join(directory, 'Downloads/export.json'),
  );
  expect(inputPath("'/tmp/file with spaces.json'")).toBe(
    '/tmp/file with spaces.json',
  );
  expect(inputPath('/tmp/file\\ with\\ spaces.json')).toBe(
    '/tmp/file with spaces.json',
  );
});
