import { clientSetup } from '../companion/client-setup';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  mkdtemp,
  writeFile,
  chmod,
  rm,
  stat,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readConfig, installHost, liveRequest } from '../companion/native';
import { createCourse } from '@/lib/utils/courses';
const roots: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];
const clients: Client[] = [];
const executable = resolve('.output/mcp/darb-mcp.mjs');
beforeAll(async () => {
  await build({
    entryPoints: ['companion/main.ts'],
    outfile: executable,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
  });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  for (const p of children.splice(0)) p.kill();
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function directory() {
  const p = await mkdtemp(join(tmpdir(), 'darb-test-'));
  roots.push(p);
  return p;
}
async function setup() {
  const dir = await directory();
  const config = {
    profileId: crypto.randomUUID(),
    token: crypto.randomUUID() + crypto.randomUUID(),
    extensionId: 'a'.repeat(32),
  };
  const file = join(dir, config.profileId + '.json');
  await writeFile(file, JSON.stringify(config), { mode: 0o600 });
  return { dir, config, file };
}
function host(dir: string) {
  const p = spawn(process.execPath, [executable, '--native'], {
    env: { ...process.env, DARB_MCP_HOME: dir },
    stdio: 'pipe',
  });
  children.push(p);
  let buffer = Buffer.alloc(0);
  const frames: unknown[] = [];
  let wake: ((v: Record<string, unknown>) => void) | null = null;
  p.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const n = buffer.readUInt32LE();
      if (buffer.length < 4 + n) break;
      const value = JSON.parse(buffer.subarray(4, 4 + n).toString());
      buffer = buffer.subarray(4 + n);
      if (wake) {
        const cb = wake;
        wake = null;
        cb(value);
      } else frames.push(value);
    }
  });
  return {
    p,
    send(value: unknown) {
      const b = Buffer.from(JSON.stringify(value));
      const h = Buffer.alloc(4);
      h.writeUInt32LE(b.length);
      p.stdin.write(Buffer.concat([h, b]));
    },
    next(): Promise<Record<string, unknown>> {
      if (frames.length)
        return Promise.resolve(frames.shift() as Record<string, unknown>);
      return new Promise((resolveNext, reject) => {
        const timer = setTimeout(() => {
          wake = null;
          reject(new Error('Native frame timeout'));
        }, 3000);
        wake = (v) => {
          clearTimeout(timer);
          resolveNext(v);
        };
      });
    },
  };
}
describe('MCP companion', () => {
  it.each(['https://www.youtube.com/watch?v=abcdefghijk', 'https://hackertube.org/watch/abcdefghijk'])('offers a real read-only stdio snapshot for %s', async (videoUrl) => {
    const dir = await directory();
    const c = createCourse(
      {
        videoId: 'abcdefghijk',
        videoUrl,
        title: 'Course',
        durationSeconds: 3600,
      },
      15,
    );
    const file = join(dir, 'snapshot.json');
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: '2026-10-20T00:00:00.000Z',
        courses: [c],
        playlists: [],
      }),
    );
    const client = new Client({ name: 'darb-test', version: '1' });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [executable, '--snapshot', file],
        stderr: 'pipe',
      }),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      'darb_list_courses',
      'darb_get_course',
      'darb_get_next_session',
      'darb_preview_study_plan',
    ]);
    const response = await client.callTool({
      name: 'darb_get_next_session',
      arguments: { courseId: c.id },
    });
    expect(JSON.stringify(response)).toContain('snapshot');
    expect(JSON.stringify(response)).toContain(c.id);
    const denied = await client.callTool({
      name: 'darb_get_course',
      arguments: { courseId: '/etc/passwd' },
    });
    expect(denied.isError).toBe(true);
  });
  it('refuses publicly readable connection files', async () => {
    const { file } = await setup();
    await chmod(file, 0o644);
    await expect(readConfig(file)).rejects.toThrow(/private/);
  });
  it('installs only under the explicitly supplied test home', async () => {
    const { dir, file } = await setup();
    const home = join(dir, 'home');
    const base = join(dir, 'installed');
    await installHost(file, 'chrome', base, home);
    expect((await stat(base)).mode & 0o777).toBe(0o700);
    const manifest = JSON.parse(
      await readFile(
        join(
          home,
          '.config/google-chrome/NativeMessagingHosts/com.darb.bridge.json',
        ),
        'utf8',
      ),
    );
    expect(manifest.allowed_origins).toEqual([
      `chrome-extension://${'a'.repeat(32)}/`,
    ]);
    expect((await stat(manifest.path)).mode & 0o777).toBe(0o700);
  });
  it('authenticates native framing and isolates profiles over a private socket', async () => {
    const { dir, file, config } = await setup();
    const h = host(dir);
    h.send({
      type: 'DARB_HELLO',
      profileId: config.profileId,
      token: config.token,
    });
    expect(await h.next()).toEqual({ type: 'connected' });
    expect(
      (await stat(join(dir, config.profileId + '.sock'))).mode & 0o777,
    ).toBe(0o600);
    const result = liveRequest(file, 'darb_list_courses', {});
    const req = await h.next();
    expect(req.tool).toBe('darb_list_courses');
    h.send({ id: req.id, ok: true, data: { mode: 'live', data: [] } });
    expect(await result).toMatchObject({ mode: 'live' });
    const client = new Client({ name: 'live-test', version: '1' });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [executable, '--live', file],
        stderr: 'pipe',
      }),
    );
    expect((await client.listTools()).tools).toHaveLength(8);
    const reply = client.callTool({
      name: 'darb_get_course',
      arguments: { courseId: 'shared' },
    });
    const forwarded = await h.next();
    expect(forwarded.tool).toBe('darb_get_course');
    h.send({
      id: forwarded.id,
      ok: true,
      data: {
        mode: 'live',
        data: { id: 'shared', title: 'Explicitly shared course' },
      },
    });
    expect(JSON.stringify(await reply)).toContain('Explicitly shared course');
    await writeFile(
      file,
      JSON.stringify({ ...config, token: 'wrong'.repeat(16) }),
    );
    await expect(liveRequest(file, 'darb_list_courses', {})).rejects.toThrow(
      /denied/,
    );
  });
});

it('generates quoted Codex and Claude Code commands without embedding secrets', () => {
  const commands = clientSetup(
    '/usr/bin/node',
    ["/my path/darb's server.mjs", '--live', '/private/profile.json'],
    'darb-live',
  );
  expect(commands.codex).toContain(
    "codex mcp add darb-live -- '/usr/bin/node'",
  );
  expect(commands.claudeCode).toContain(
    'claude mcp add --transport stdio --scope user darb-live --',
  );
  expect(commands.codex).toContain("'\\''");
  expect(JSON.stringify(commands)).not.toContain('token');
});
