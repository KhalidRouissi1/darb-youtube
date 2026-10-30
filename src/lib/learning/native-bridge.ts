import { browser, type Browser } from 'wxt/browser';
import { assistantPermissions } from './permissions';
import { liveMcpAction } from './actions';
import { LEARNING_KEY, readLearning } from './repository';
export function attachNativeBridge(
  serialize: <T>(operation: () => Promise<T>) => Promise<T>,
) {
  let port: Browser.runtime.Port | null = null;
  let token = '';
  let pending = 0;
  let generation = 0;
  const connect = async () => {
    const current = ++generation;
    const state = await readLearning();
    if (current !== generation) return;
    if (!state.connection.enabled) {
      token = '';
      port?.disconnect();
      port = null;
      return;
    }
    if (!(await browser.permissions.contains(assistantPermissions()))) return;
    if (current !== generation) return;
    if (port && token === state.connection.token) return;
    port?.disconnect();
    token = state.connection.token;
    try {
      const connection = browser.runtime.connectNative('com.darb.bridge');
      port = connection;
      connection.onDisconnect.addListener(() => {
        if (port === connection) port = null;
      });
      connection.onMessage.addListener((message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const req = message as {
          id?: string;
          token?: string;
          tool?: string;
          args?: unknown;
        };
        if (
          typeof req.id !== 'string' ||
          req.id.length > 100 ||
          req.token !== token
        )
          return;
        // Clients commonly issue several read tools in one turn. Queue a bounded
        // batch through the same mutation serializer instead of rejecting all
        // calls after the first. Each queued call rechecks the latest grant.
        if (pending >= 16) {
          connection.postMessage({
            id: req.id,
            ok: false,
            error: 'Darb is busy. Retry shortly.',
          });
          return;
        }
        pending += 1;
        void serialize(async () => {
          const latest = await readLearning();
          if (
            !latest.connection.enabled ||
            latest.connection.token !== req.token ||
            !(await browser.permissions.contains(assistantPermissions()))
          )
            throw new Error('Connection revoked.');
          return liveMcpAction({ tool: req.tool, args: req.args ?? {} });
        })
          .then(
            (data) => {
              if (
                new TextEncoder().encode(JSON.stringify(data)).byteLength >
                800_000
              ) {
                connection.postMessage({
                  id: req.id,
                  ok: false,
                  error:
                    'Result is too large. Share fewer playlists or request a smaller page.',
                });
              } else connection.postMessage({ id: req.id, ok: true, data });
            },
            (error) =>
              connection.postMessage({
                id: req.id,
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Darb request failed.',
              }),
          )
          .catch(() => undefined)
          .finally(() => {
            pending -= 1;
          });
      });
      connection.postMessage({
        type: 'DARB_HELLO',
        profileId: state.connection.profileId,
        token,
      });
    } catch {
      port = null;
    }
  };
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && LEARNING_KEY in changes)
      void connect().catch(() => undefined);
  });
  browser.permissions.onRemoved.addListener((removed) => {
    if (
      removed.permissions?.includes('nativeMessaging') ||
      (removed as { data_collection?: string[] }).data_collection?.some(
        (type) =>
          ['browsingActivity', 'websiteActivity', 'websiteContent'].includes(
            type,
          ),
      )
    ) {
      port?.disconnect();
      port = null;
    }
  });
  void connect().catch(() => undefined);
}
