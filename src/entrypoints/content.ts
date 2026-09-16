import { browser } from 'wxt/browser';
import {
  type ContentActionResponse,
  isContentMessage,
  type VideoMetadataResponse,
} from '@/lib/messaging/messages';
import {
  extractYouTubeMetadata,
  YouTubeMetadataError,
} from '@/lib/youtube/metadata';
import { observeYouTubeNavigation } from '@/lib/youtube/navigation';
import { restoreSessionTracking } from '@/lib/youtube/session-tracker';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener(async (message: unknown) => {
      if (!isContentMessage(message)) {
        return undefined;
      }

      if (message.type === 'ACTIVATE_SESSION') {
        try {
          await restoreSessionTracking({
            attemptPlayback: true,
            activationId: message.activationId,
          });
          return { ok: true } satisfies ContentActionResponse;
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Darb could not activate this session.',
          } satisfies ContentActionResponse;
        }
      }

      try {
        const video = await extractYouTubeMetadata();
        return {
          ok: true,
          video,
        } satisfies VideoMetadataResponse;
      } catch (error) {
        if (error instanceof YouTubeMetadataError) {
          return {
            ok: false,
            code: error.code,
            error: error.message,
          } satisfies VideoMetadataResponse;
        }

        return {
          ok: false,
          code: 'YOUTUBE_STRUCTURE_CHANGED',
          error:
            'Darb could not read this YouTube page. Reload it and try again.',
        } satisfies VideoMetadataResponse;
      }
    });

    const restoreTracking = async () => {
      try {
        await restoreSessionTracking();
      } catch (error) {
        console.error('[Darb] Unable to restore session tracking.', error);
      }
    };

    void restoreTracking();
    observeYouTubeNavigation(restoreTracking);
  },
});
