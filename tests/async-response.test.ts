import { expect, it, vi } from 'vitest';
import { withAsyncResponse } from '@/lib/messaging/async-response';
import { invokeListener } from './runtime-listener';

it('keeps Chromium callback channels open until asynchronous work completes', async () => {
  let finish!: (value: unknown) => void;
  const work = new Promise((resolve) => {
    finish = resolve;
  });
  const listener = withAsyncResponse(
    () => true,
    async () => work,
  );
  const respond = vi.fn();
  expect(listener({ type: 'PING' }, {}, respond)).toBe(true);
  expect(respond).not.toHaveBeenCalled();
  finish({ ok: true });
  await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
});
it('does not claim unrelated messages', () => {
  const handle = vi.fn(async () => ({ ok: true }));
  const listener = withAsyncResponse(() => false, handle);
  const respond = vi.fn();
  expect(listener({ type: 'UNKNOWN' }, {}, respond)).toBe(false);
  expect(handle).not.toHaveBeenCalled();
  expect(respond).not.toHaveBeenCalled();
});
it('delivers handler failures through the callback response', async () => {
  const listener = withAsyncResponse(
    () => true,
    async () => {
      throw new Error('Access check failed');
    },
  );
  expect(await invokeListener(listener, {}, {})).toEqual({
    ok: false,
    error: 'Access check failed',
  });
});
