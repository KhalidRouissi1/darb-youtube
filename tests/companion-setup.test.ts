import { describe, expect, it } from 'vitest';
import { parseSetup, resolveClient } from '../companion/setup';
describe('explicit MCP setup arguments', () => {
  it('accepts either snapshot mode or a selected live browser/client', () => {
    expect(
      parseSetup(['--client', 'codex', '--snapshot', '/tmp/shared.json'])[
        '--client'
      ],
    ).toBe('codex');
    expect(
      parseSetup([
        '--client',
        'claude',
        '--browser',
        'brave',
        '--connection',
        '/tmp/private.json',
      ])['--browser'],
    ).toBe('brave');
  });
  it('rejects ambiguous, incomplete and unsupported setup without side effects', () => {
    for (const args of [
      [],
      ['--client'],
      ['--client', 'other', '--snapshot', '/tmp/a'],
      ['--client', 'codex', '--connection', '/tmp/a'],
      ['--client', 'codex', '--snapshot', '/tmp/a', '--connection', '/tmp/b'],
      ['--client', 'codex', '--snapshot', '/tmp/a', '--browser', 'chrome'],
      ['--client', 'codex', '--client', 'claude', '--snapshot', '/tmp/a'],
      ['--client', 'codex', '--snapshot', '/tmp/a', '--token', 'secret'],
    ])
      expect(() => parseSetup(args)).toThrow();
  });
});

it('uses desktop Codex when the terminal has no Codex CLI', async () => {
  const tried: string[] = [];
  expect(await resolveClient('codex', ['/desktop/codex'], async (command) => {
    tried.push(command);
    if (command === 'codex') throw new Error('ENOENT');
  })).toBe('/desktop/codex');
  expect(tried).toEqual(['codex', '/desktop/codex']);
});

it('prefers the PATH client and never uses Codex as a Claude fallback', async () => {
  expect(await resolveClient('codex', ['/desktop/codex'], async () => {})).toBe('codex');
  await expect(resolveClient('claude', ['/desktop/codex'], async () => {
    throw new Error('ENOENT');
  })).rejects.toThrow('Install Claude Code');
  await expect(resolveClient('codex', [], async () => {
    throw new Error('ENOENT');
  })).rejects.toThrow('Install Codex desktop');
});

it('explains Zsh correction instead of exposing a Zod validation stack', () => {
  expect(() =>
    parseSetup(['--client', '.codex', '--snapshot', '/tmp/a']),
  ).toThrow('shell changed codex to .codex');
  expect(() =>
    parseSetup(['--client', 'wrong', '--snapshot', '/tmp/a']),
  ).toThrow('Choose --client codex or --client claude');
});
