import { browser } from 'wxt/browser';
import { adapterForPage, VideoError } from '@/lib/platforms/adapter';
import {
  isContentMessage,
  type VideoMetadataResponse,
} from '@/lib/messaging/messages';
import { restoreSessionTracking, stopSessionTracking } from './session-tracker';
import { platformFromUrl } from './platforms';
import { videoMetadataSchema } from '@/lib/validation/schemas';

export function startVideoBridge(): void {
  // Dynamic registration and immediate injection can both run on the same page.
  const marker = '__darbVideoBridge';
  const scope = globalThis as typeof globalThis & {
    __darbVideoBridge?: boolean;
  };
  if (scope[marker]) return;
  scope[marker] = true;
  browser.runtime.onMessage.addListener(async (message: unknown) => {
    const platform = platformFromUrl(window.location.href);
    if (!platform) return undefined;
    if (
      typeof message === 'object' &&
      message &&
      'type' in message &&
      message.type === 'STOP_SESSION'
    ) {
      await stopSessionTracking();
      return { ok: true };
    }
    const access = await browser.runtime.sendMessage({
      type: 'CHECK_PLATFORM_ACCESS',
    });
    if (!access?.ok)
      return { ok: false, error: 'Platform access is disabled.' };
    if (
      typeof message === 'object' &&
      message &&
      'type' in message &&
      message.type === 'VIDEO_BRIDGE_PING'
    )
      return { ok: true };
    if (!isContentMessage(message)) return undefined;
    try {
      if (message.type === 'ACTIVATE_SESSION') {
        await restoreSessionTracking({
          attemptPlayback: true,
          activationId: message.activationId,
        });
        return { ok: true };
      }
      const adapter = adapterForPage();
      if (!adapter)
        throw new VideoError(
          'UNSUPPORTED_PAGE',
          'Open a dedicated recorded video page.',
        );
      const video = videoMetadataSchema.parse(await adapter.readMetadata());
      return { ok: true, video } satisfies VideoMetadataResponse;
    } catch (error) {
      return {
        ok: false,
        code: error instanceof VideoError ? error.code : 'VIDEO_UNAVAILABLE',
        error:
          error instanceof Error ? error.message : 'Unable to read this video.',
      } satisfies VideoMetadataResponse;
    }
  });
  let lastPlayer: HTMLVideoElement | null = null;
  try {
    lastPlayer = adapterForPage()?.findPlayer() ?? null;
  } catch {
    /* Wait for an unambiguous page. */
  }
  let lastUrl = window.location.href;
  let busy = false;
  const restore = async () => {
    if (busy) return;
    busy = true;
    try {
      await restoreSessionTracking();
    } catch {
      await stopSessionTracking();
    } finally {
      busy = false;
    }
  };
  void restore();
  const check = () => {
    if (lastUrl !== window.location.href) {
      lastUrl = window.location.href;
      void restore();
      return;
    }
    try {
      const current = adapterForPage()?.findPlayer() ?? null;
      if (current !== lastPlayer) {
        lastPlayer = current;
        void restore();
      }
    } catch {
      void stopSessionTracking();
    }
  };
  const timer = setInterval(check, 1000);
  window.addEventListener('popstate', check);
  document.addEventListener('yt-navigate-finish', () => {
    void restore();
  });
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      void stopSessionTracking();
    },
    { once: true },
  );
}
