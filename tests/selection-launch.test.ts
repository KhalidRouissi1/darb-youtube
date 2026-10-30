import { SELECTION_VERSION } from '@/lib/learning/version';
import { afterEach, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { launchSelection } from '@/lib/learning/launch';
afterEach(() => vi.restoreAllMocks());
it('starts an existing bridge in the top frame without injecting again', async () => {
  const send = vi
    .spyOn(browser.tabs, 'sendMessage')
    .mockImplementation(async () => ({
      ok: true,
      videoCount: 3,
      selectionVersion: SELECTION_VERSION,
    }));
  const inject = vi
    .spyOn(browser.scripting, 'executeScript')
    .mockImplementation(async () => []);
  expect(await launchSelection(7)).toMatchObject({
    ok: true,
    videoCount: 3,
    selectionVersion: SELECTION_VERSION,
  });
  expect(send).toHaveBeenCalledWith(
    7,
    { type: 'DARB_SELECTION_START' },
    { frameId: 0 },
  );
  expect(inject).not.toHaveBeenCalled();
});
it('recovers once when an already-open tab has no content script', async () => {
  let attempts = 0;
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => {
    if (++attempts === 1) throw new Error('Receiving end does not exist');
    return { ok: true, selectionVersion: SELECTION_VERSION };
  });
  const inject = vi
    .spyOn(browser.scripting, 'executeScript')
    .mockImplementation(async () => []);
  await expect(launchSelection(7)).resolves.toMatchObject({ ok: true });
  expect(inject).toHaveBeenCalledWith({
    target: { tabId: 7, frameIds: [0] },
    files: ['/content-scripts/content.js'],
  });
  expect(attempts).toBe(2);
});
it('preserves an explicit startup error and does not inject a duplicate bridge', async () => {
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => ({
    ok: false,
    error: 'Selection storage unavailable',
  }));
  const inject = vi
    .spyOn(browser.scripting, 'executeScript')
    .mockImplementation(async () => []);
  await expect(launchSelection(7)).rejects.toThrow(
    'Selection storage unavailable',
  );
  expect(inject).not.toHaveBeenCalled();
});

it('rejects an old script that reports success without the full-card version', async () => {
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => ({
    ok: true,
  }));
  await expect(launchSelection(7)).rejects.toThrow(
    'using an older Darb selection script',
  );
});
