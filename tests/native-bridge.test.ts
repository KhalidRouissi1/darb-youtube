import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { initialLearningState } from '@/lib/learning/model';
import { LEARNING_KEY } from '@/lib/learning/repository';
import { attachNativeBridge } from '@/lib/learning/native-bridge';

const runTool = vi.hoisted(() => vi.fn());
vi.mock('@/lib/learning/actions', () => ({ liveMcpAction: runTool }));

beforeEach(async () => {
  vi.restoreAllMocks();
  runTool.mockReset().mockResolvedValue({ mode: 'live', data: [] });
  await browser.storage.local.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function bridge() {
  const state = initialLearningState();
  state.connection.enabled = true;
  await browser.storage.local.set({ [LEARNING_KEY]: state });
  let receive!: (message: unknown) => void;
  const post = vi.fn();
  const port = {
    postMessage: post,
    disconnect: vi.fn(),
    onMessage: { addListener: (listener: typeof receive) => { receive = listener; } },
    onDisconnect: { addListener: vi.fn() },
  };
  vi.spyOn(browser.permissions, 'contains').mockImplementation(async () => true);
  vi.spyOn(browser.runtime, 'connectNative').mockReturnValue(port as unknown as ReturnType<typeof browser.runtime.connectNative>);
  // Prevent global listeners from leaking between tests; requests still read
  // real storage immediately before executing so revocation remains exercised.
  vi.spyOn(browser.storage.onChanged, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(browser.permissions.onRemoved, 'addListener').mockImplementation(() => undefined);
  let tail = Promise.resolve();
  attachNativeBridge(<T>(operation: () => Promise<T>) => {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  });
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'DARB_HELLO' })));
  const send = (id: string) => receive({ id, token: state.connection.token, tool: 'darb_list_courses', args: {} });
  return { state, post, send };
}

it('delivers concurrent read calls without rejecting the second as busy', async () => {
  const { post, send } = await bridge();
  send('first');
  send('second');
  send('third');
  await vi.waitFor(() => expect(runTool).toHaveBeenCalledTimes(3));
  for (const id of ['first', 'second', 'third']) {
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ id, ok: true }));
  }
});

it('rejects requests beyond its bounded queue and rechecks revocation for queued work', async () => {
  const { state, post, send } = await bridge();
  let finish!: (value: unknown) => void;
  runTool.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  send('0');
  await vi.waitFor(() => expect(runTool).toHaveBeenCalledTimes(1));
  for (let i = 1; i <= 16; i++) send(String(i));
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: '16', ok: false, error: 'Darb is busy. Retry shortly.' }));
  state.connection.enabled = false;
  await browser.storage.local.set({ [LEARNING_KEY]: state });
  finish({ mode: 'live', data: [] });
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ id: '15', ok: false, error: 'Connection revoked.' }));
  expect(runTool).toHaveBeenCalledTimes(1);
});
