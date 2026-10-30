import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import {
  syncPlatformScripts,
  ensurePlatformBridge,
} from '@/lib/video/registration';
import { OPTIONAL_ORIGINS } from '@/lib/video/platforms';
import {
  hasPlatformAccess,
  requestPlatformAccess,
  removePlatformAccess,
} from '@/lib/video/access';
beforeEach(() => vi.restoreAllMocks());
describe('optional platform access', () => {
  it('does not register scripts for unapproved platforms', async () => {
    vi.spyOn(browser.permissions, 'contains').mockImplementation(
      async () => false,
    );
    vi.spyOn(
      browser.scripting,
      'getRegisteredContentScripts',
    ).mockImplementation(async () => []);
    const register = vi
      .spyOn(browser.scripting, 'registerContentScripts')
      .mockResolvedValue();
    await syncPlatformScripts();
    expect(register).not.toHaveBeenCalled();
    expect(await hasPlatformAccess('youtube')).toBe(true);
  });
  it('registers X only and unregisters Facebook after revocation', async () => {
    vi.spyOn(browser.permissions, 'contains').mockImplementation(
      async (permission) =>
        permission.origins?.includes('https://x.com/*') ?? false,
    );
    vi.spyOn(
      browser.scripting,
      'getRegisteredContentScripts',
    ).mockImplementation(async () => [
      { id: 'darb-facebook', matches: OPTIONAL_ORIGINS.facebook },
    ]);
    const register = vi
      .spyOn(browser.scripting, 'registerContentScripts')
      .mockResolvedValue();
    const unregister = vi
      .spyOn(browser.scripting, 'unregisterContentScripts')
      .mockResolvedValue();
    await syncPlatformScripts();
    expect(register).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'darb-x',
        matches: OPTIONAL_ORIGINS.x,
        allFrames: false,
      }),
    ]);
    expect(unregister).toHaveBeenCalledWith({ ids: ['darb-facebook'] });
  });
  it('does not inject after access is denied', async () => {
    vi.spyOn(browser.permissions, 'contains').mockImplementation(
      async () => false,
    );
    const inject = vi.spyOn(browser.scripting, 'executeScript');
    await expect(
      ensurePlatformBridge(1, 'https://x.com/u/status/123'),
    ).rejects.toThrow('Enable X');
    expect(inject).not.toHaveBeenCalled();
  });
  it('injects packaged code on an already-open page after access is granted', async () => {
    vi.spyOn(browser.permissions, 'contains').mockImplementation(
      async () => true,
    );
    vi.spyOn(
      browser.scripting,
      'getRegisteredContentScripts',
    ).mockImplementation(async () => [
      { id: 'darb-x', matches: OPTIONAL_ORIGINS.x },
      { id: 'darb-facebook', matches: OPTIONAL_ORIGINS.facebook },
    ]);
    vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(
      new Error('No bridge'),
    );
    const inject = vi
      .spyOn(browser.scripting, 'executeScript')
      .mockImplementation(async () => []);
    await ensurePlatformBridge(1, 'https://x.com/u/status/123');
    expect(inject).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ['/content-scripts/social.js'],
    });
  });
  it('requests/removes only the selected platform host group', async () => {
    const request = vi
      .spyOn(browser.permissions, 'request')
      .mockImplementation(async () => false);
    const remove = vi
      .spyOn(browser.permissions, 'remove')
      .mockImplementation(async () => true);
    expect(await requestPlatformAccess('x')).toBe(false);
    await removePlatformAccess('facebook');
    expect(request).toHaveBeenCalledWith({ origins: OPTIONAL_ORIGINS.x });
    expect(remove).toHaveBeenCalledWith({ origins: OPTIONAL_ORIGINS.facebook });
  });
});

describe('YouTube bridge recovery', () => {
  it('injects the packaged YouTube bridge when an existing tab has no receiver', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(
      new Error('Receiving end does not exist'),
    );
    const permissions = vi.spyOn(browser.permissions, 'contains');
    const register = vi.spyOn(browser.scripting, 'registerContentScripts');
    const inject = vi
      .spyOn(browser.scripting, 'executeScript')
      .mockImplementation(async () => []);
    await ensurePlatformBridge(
      7,
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(inject).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['/content-scripts/content.js'],
    });
    expect(permissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
  it('leaves a responding YouTube bridge in place', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async () => ({
      ok: true,
    }));
    const inject = vi.spyOn(browser.scripting, 'executeScript');
    await ensurePlatformBridge(
      7,
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(inject).not.toHaveBeenCalled();
  });
  it('recovers a bridge that returns no response', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(undefined);
    const inject = vi
      .spyOn(browser.scripting, 'executeScript')
      .mockImplementation(async () => []);
    await ensurePlatformBridge(
      7,
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(inject).toHaveBeenCalledTimes(1);
  });
});

it('explains browser site access when injection is restricted instead of leaking a raw host error', async () => {
  vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(
    new Error('No receiver'),
  );
  vi.spyOn(browser.scripting, 'executeScript').mockRejectedValue(
    new Error(
      'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    ),
  );
  await expect(
    ensurePlatformBridge(7, 'https://www.youtube.com/watch?v=abcdefghijk'),
  ).rejects.toThrow('Allow access to this site');
});
