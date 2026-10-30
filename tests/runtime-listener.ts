import type { Browser } from 'wxt/browser';
/** Model Chromium's callback channel, without treating a returned Promise as a response. */
export function invokeListener(
  listener: Parameters<
    typeof import('wxt/browser').browser.runtime.onMessage.addListener
  >[0],
  message: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<unknown> {
  return new Promise((resolve) => {
    const keepOpen: unknown = listener(message, sender, resolve);
    if (keepOpen !== true) resolve(undefined);
  });
}
