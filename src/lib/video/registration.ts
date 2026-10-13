import { browser } from 'wxt/browser';
import { hasPlatformAccess } from './access';
import { OPTIONAL_ORIGINS, platformFromUrl } from './platforms';
let syncTail: Promise<void> = Promise.resolve();
export function syncPlatformScripts(): Promise<void> {
  const result = syncTail.then(async () => {
    const registered = await browser.scripting.getRegisteredContentScripts();
    for (const platform of ['x', 'facebook'] as const) {
      const id = `darb-${platform}`;
      const exists = registered.some((script) => script.id === id);
      const allowed = await hasPlatformAccess(platform);
      if (allowed && !exists)
        await browser.scripting.registerContentScripts([
          {
            id,
            matches: OPTIONAL_ORIGINS[platform],
            js: ['content-scripts/social.js'],
            runAt: 'document_idle',
            allFrames: false,
          },
        ]);
      if (!allowed && exists)
        await browser.scripting.unregisterContentScripts({ ids: [id] });
    }
  });
  syncTail = result.catch(() => undefined);
  return result;
}
export async function ensurePlatformBridge(
  tabId: number,
  url: string,
): Promise<void> {
  const platform = platformFromUrl(url);
  if (!platform || platform === 'youtube') return;
  if (!(await hasPlatformAccess(platform)))
    throw new Error(
      `Enable ${platform === 'x' ? 'X' : 'Facebook'} in Darb Settings first.`,
    );
  await syncPlatformScripts();
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: 'VIDEO_BRIDGE_PING',
    });
    if (response?.ok) return;
  } catch {
    /* Already-open pages need injection after access is granted. */
  }
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['/content-scripts/social.js'],
  });
}
