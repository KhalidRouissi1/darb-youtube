import { clientSetup } from './client-setup';
import { createServer, createConnection } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  chmod,
  unlink,
  lstat,
} from 'node:fs/promises';
import { homedir, endianness } from 'node:os';
import { resolve, join } from 'node:path';
import { z } from 'zod';
const MAX = 1_000_000;
const configSchema = z.object({
  profileId: z.string().uuid(),
  token: z.string().min(64).max(200),
  extensionId: z.string().min(1).max(200),
});
const baseDirectory = () =>
  process.env.DARB_MCP_HOME ?? join(homedir(), '.local', 'share', 'darb-mcp');
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export async function readConfig(file: string) {
  const path = resolve(file);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error('Use a private regular connection file (chmod 600).');
  if (stat.size > 10000)
    throw new Error('Connection configuration is too large.');
  return configSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}
export async function installHost(
  configFile: string,
  browser: string,
  base = baseDirectory(),
  home = homedir(),
) {
  if (!['chrome', 'brave', 'firefox'].includes(browser))
    throw new Error('Choose chrome, brave, or firefox.');
  if (process.platform !== 'linux')
    throw new Error('The companion installer currently supports Linux only.');
  const config = configSchema.parse(
    JSON.parse(await readFile(resolve(configFile), 'utf8')),
  );
  await mkdir(base, { recursive: true, mode: 0o700 });
  await chmod(base, 0o700);
  const configPath = join(base, config.profileId + '.json');
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  await chmod(configPath, 0o600);
  const launcher = join(base, 'native-host');
  const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
  await writeFile(
    launcher,
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(resolve(process.argv[1]!))} --native\n`,
    { mode: 0o700 },
  );
  await chmod(launcher, 0o700);
  const dirs: Record<string, string> = {
    chrome: join(home, '.config/google-chrome/NativeMessagingHosts'),
    brave: join(
      home,
      '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts',
    ),
    firefox: join(home, '.mozilla/native-messaging-hosts'),
  };
  const dir = dirs[browser];
  if (!dir) throw new Error('Choose chrome, brave, or firefox.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const permissions =
    browser === 'firefox'
      ? { allowed_extensions: [config.extensionId] }
      : { allowed_origins: [`chrome-extension://${config.extensionId}/`] };
  const manifest = {
    name: 'com.darb.bridge',
    description: 'Darb local learning bridge',
    path: launcher,
    type: 'stdio',
    ...permissions,
  };
  await writeFile(
    join(dir, 'com.darb.bridge.json'),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  return {
    configPath,
    command: process.execPath,
    args: [resolve(process.argv[1]!), '--live', configPath],
    clients: clientSetup(
      process.execPath,
      [resolve(process.argv[1]!), '--live', configPath],
      'darb-live',
    ),
  };
}
export async function liveRequest(
  configFile: string,
  tool: string,
  args: Record<string, unknown>,
) {
  const config = await readConfig(configFile);
  const socketPath = join(
    resolve(configFile, '..'),
    config.profileId + '.sock',
  );
  return new Promise<unknown>((resolveResult, reject) => {
    const socket = createConnection(socketPath);
    socket.setEncoding('utf8');
    let buffer = '';
    const end = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(10000, () =>
      end(
        new Error(
          'Darb did not respond. Open its browser and reconnect in Settings.',
        ),
      ),
    );
    socket.once('error', () =>
      end(
        new Error('Darb is not connected. Open Darb → Assistant and connect.'),
      ),
    );
    socket.once('connect', () =>
      socket.write(
        JSON.stringify({
          token: config.token,
          id: crypto.randomUUID(),
          tool,
          args,
        }) + '\n',
      ),
    );
    socket.on('data', (data) => {
      buffer += data.toString();
      if (buffer.length > MAX) {
        end(new Error('Response too large.'));
        return;
      }
      if (buffer.includes('\n')) {
        try {
          const result = JSON.parse(buffer.split('\n')[0]!);
          socket.end();
          if (!result.ok) reject(new Error(result.error));
          else resolveResult(result.data);
        } catch {
          end(new Error('Invalid Darb response.'));
        }
      }
    });
    socket.once('end', () => {
      if (!buffer.includes('\n')) reject(new Error('Darb connection closed.'));
    });
  });
}
export async function nativeHost(base = baseDirectory()) {
  if (endianness() !== 'LE')
    throw new Error(
      'This native host currently requires a little-endian system.',
    );
  let buffer = Buffer.alloc(0);
  let configured = false;
  const pending = new Map<string, ReturnType<typeof createConnection>>();
  let server: ReturnType<typeof createServer> | undefined;
  let socketPath = '';
  let ownsSocket = false;
  const send = (message: unknown) => {
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX) return;
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(body.length);
    process.stdout.write(Buffer.concat([prefix, body]));
  };
  const frame = async (message: unknown) => {
    const msg = message as Record<string, unknown>;
    if (!configured) {
      const hello = z
        .object({
          type: z.literal('DARB_HELLO'),
          profileId: z.string().uuid(),
          token: z.string(),
        })
        .parse(msg);
      const config = await readConfig(join(base, hello.profileId + '.json'));
      if (!equal(config.token, hello.token))
        throw new Error(
          'Pairing failed. Download and install a fresh connection file.',
        );
      configured = true;
      socketPath = join(base, config.profileId + '.sock');
      // A live socket must never be replaced by a second browser/profile connection.
      try {
        const stat = await lstat(socketPath);
        if (!stat.isSocket()) throw new Error('Unsafe socket path.');
        await new Promise<void>((resolveCheck, reject) => {
          const probe = createConnection(socketPath);
          probe.once('connect', () => {
            probe.destroy();
            reject(new Error('This profile is already connected.'));
          });
          probe.once('error', () => resolveCheck());
        });
        await unlink(socketPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      server = createServer((socket) => {
        socket.setEncoding('utf8');
        let text = '';
        let dispatched = false;
        socket.setTimeout(11000, () => socket.destroy());
        socket.on('data', (chunk) => {
          if (dispatched) {
            socket.destroy();
            return;
          }
          text += chunk.toString();
          if (text.length > MAX) {
            socket.destroy();
            return;
          }
          if (!text.includes('\n')) return;
          dispatched = true;
          try {
            const req = z
              .object({
                id: z.string().max(100),
                token: z.string().max(200),
                tool: z.string().max(100),
                args: z.record(z.string(), z.unknown()),
              })
              .parse(JSON.parse(text.split('\n')[0]!));
            if (!equal(req.token, config.token) || pending.size >= 16) {
              socket.end(
                JSON.stringify({
                  ok: false,
                  error: 'Access denied or bridge busy.',
                }) + '\n',
              );
              return;
            }
            pending.set(req.id, socket);
            send(req);
          } catch {
            socket.end(
              JSON.stringify({ ok: false, error: 'Invalid request.' }) + '\n',
            );
          }
        });
        socket.on('close', () => {
          for (const [id, client] of pending)
            if (client === socket) pending.delete(id);
        });
        socket.on('error', () => socket.destroy());
      });
      await new Promise<void>((resolveListen, reject) => {
        server!.once('error', reject);
        server!.listen(socketPath, () => resolveListen());
      });
      ownsSocket = true;
      await chmod(socketPath, 0o600);
      send({ type: 'connected' });
    } else if (typeof msg.id === 'string') {
      const client = pending.get(msg.id);
      if (client) {
        pending.delete(msg.id);
        client.end(JSON.stringify(msg) + '\n');
      }
    }
  };
  let tail = Promise.resolve();
  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > MAX + 4) {
      process.exitCode = 1;
      process.stdin.destroy();
      return;
    }
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE();
      if (length > MAX) {
        process.stdin.destroy();
        return;
      }
      if (buffer.length < 4 + length) break;
      const data = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);
      tail = tail
        .then(() => frame(JSON.parse(data.toString())))
        .catch((error) => {
          process.exitCode = 1;
          process.stderr.write(String(error) + '\n');
          process.stdin.destroy();
        });
    }
  });
  process.stdin.on('end', () => process.stdin.destroy());
  process.stdin.on('close', () => {
    server?.close();
    for (const client of pending.values()) client.destroy();
    if (ownsSocket) void unlink(socketPath).catch(() => undefined);
  });
}
