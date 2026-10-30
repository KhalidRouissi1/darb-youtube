import { SELECTION_VERSION } from './version';
import { browser } from 'wxt/browser';

/** Existing tabs may have no content bridge after an extension update/reload. */
export async function launchSelection(tabId: number) {
  const start = () =>
    browser.tabs.sendMessage(
      tabId,
      { type: 'DARB_SELECTION_START' },
      { frameId: 0 },
    );
  let response;
  try {
    response = await start();
  } catch {
    /* Recover once with the packaged bridge. */
  }
  if (response === undefined || response === null) {
    await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ['/content-scripts/content.js'],
    });
    response = await start();
  }
  if (!response?.ok)
    throw new Error(
      response?.error ?? 'Reload this YouTube tab and try again.',
    );
  if (response.selectionVersion !== SELECTION_VERSION)
    throw new Error(
      'This YouTube tab is using an older Darb selection script. Refresh YouTube once, then start selection again.',
    );
  return response;
}
