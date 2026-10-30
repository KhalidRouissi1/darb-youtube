import { browser, type Browser } from 'wxt/browser';

type Listener = Parameters<typeof browser.runtime.onMessage.addListener>[0];
/** Keep the channel open in Chromium versions that require callback responses. */
export function withAsyncResponse(
  accepts: (message: unknown) => boolean,
  handle: (
    message: unknown,
    sender: Browser.runtime.MessageSender,
  ) => Promise<unknown>,
): Listener {
  return (message, sender, sendResponse) => {
    if (!accepts(message)) return false;
    void Promise.resolve()
      .then(() => handle(message, sender))
      .then(sendResponse, (error: unknown) => {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Darb could not complete this action.',
        });
      });
    return true;
  };
}
