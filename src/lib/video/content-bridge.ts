import { installPlaylistControls } from './playlist-controls';
import { installFloatingNotes } from './floating-notes';
import { parseVideoUrl } from './platforms';
import { readVideoPosition } from './position';
import { withAsyncResponse } from '@/lib/messaging/async-response';
import { SELECTION_VERSION } from '@/lib/learning/version';
import {
  startSelectionMode,
  stopSelectionMode,
} from '@/lib/learning/selection-mode';
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
  let pageRevision = 0;
  browser.runtime.onMessage.addListener(
    withAsyncResponse(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        [
          'DARB_SELECTION_START',
          'STOP_SESSION',
          'VIDEO_BRIDGE_PING',
          'GET_VIDEO_CONTEXT',
          'GET_VIDEO_POSITION',
          'GET_VIDEO_METADATA',
          'ACTIVATE_SESSION',
        ].includes(String(message.type)),
      async (message: unknown) => {
        if (
          typeof message === 'object' &&
          message &&
          'type' in message &&
          message.type === 'DARB_SELECTION_START'
        ) {
          try {
            const videoCount = await startSelectionMode();
            return {
              ok: true,
              videoCount,
              selectionVersion: SELECTION_VERSION,
            };
          } catch (error) {
            stopSelectionMode();
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Unable to start selection.',
            };
          }
        }
        if (
          typeof message !== 'object' ||
          !message ||
          !('type' in message) ||
          ![
            'STOP_SESSION',
            'VIDEO_BRIDGE_PING',
            'GET_VIDEO_CONTEXT',
            'GET_VIDEO_POSITION',
            'GET_VIDEO_METADATA',
            'ACTIVATE_SESSION',
          ].includes(String(message.type))
        )
          return undefined;
        if (message.type === 'GET_VIDEO_CONTEXT') {
          if (new URL(window.location.href).pathname === '/watch')
            stopSelectionMode();
          return {
            ok: true,
            url: window.location.href,
            revision: pageRevision,
          };
        }
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
          return {
            ok: false,
            error:
              access?.error ??
              'Darb could not verify access to this video. Try again.',
          };
        if (
          typeof message === 'object' &&
          message &&
          'type' in message &&
          message.type === 'VIDEO_BRIDGE_PING'
        )
          return { ok: true };
        if (message.type === 'GET_VIDEO_POSITION') {
          try {
            return {
              ok: true,
              position: readVideoPosition(
                'videoId' in message
                  ? (message as { videoId: string; platform?: string })
                  : undefined,
              ),
            };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Unable to read video position.',
            };
          }
        }
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
            code:
              error instanceof VideoError ? error.code : 'VIDEO_UNAVAILABLE',
            error:
              error instanceof Error
                ? error.message
                : 'Unable to read this video.',
          } satisfies VideoMetadataResponse;
        }
      },
    ),
  );
  const noteWidget = installFloatingNotes();
  const playlistControls = installPlaylistControls();
  void playlistControls.sync();
  let lastPlayer: HTMLVideoElement | null = null;
  try {
    lastPlayer = adapterForPage()?.findPlayer() ?? null;
  } catch {
    /* Wait for an unambiguous page. */
  }
  let lastUrl = window.location.href;
  let busy = false;
  let queued = false;
  const restore = async () => {
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    try {
      await restoreSessionTracking();
    } catch {
      await stopSessionTracking();
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        void restore();
      }
    }
  };
  void restore();
  const check = () => {
    void noteWidget.sync().catch(() => undefined);
    void playlistControls.sync();
    if (parseVideoUrl(window.location.href)?.platform === 'youtube')
      stopSelectionMode();
    if (lastUrl !== window.location.href) {
      lastUrl = window.location.href;
      try {
        lastPlayer = adapterForPage()?.findPlayer() ?? null;
      } catch {
        lastPlayer = null;
      }
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
  const navigated = () => {
    pageRevision++;
    check();
  };
  const playerReady = () => {
    void restore();
  };
  document.addEventListener('yt-navigate-finish', navigated);
  document.addEventListener('loadedmetadata', playerReady, true);
  const playbackChanged = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    const change = changes['coursora:active-playback'] as
      | {
          newValue?: { activationId?: string };
          oldValue?: { activationId?: string };
        }
      | undefined;
    if (
      area === 'local' &&
      change?.newValue?.activationId &&
      change.newValue.activationId !== change.oldValue?.activationId
    )
      void restore();
  };
  browser.storage.onChanged.addListener(playbackChanged);
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(timer);
      noteWidget.dispose();
      playlistControls.dispose();
      browser.storage.onChanged.removeListener(playbackChanged);
      document.removeEventListener('yt-navigate-finish', navigated);
      document.removeEventListener('loadedmetadata', playerReady, true);
      window.removeEventListener('popstate', check);
      void stopSessionTracking();
    },
    { once: true },
  );
}
