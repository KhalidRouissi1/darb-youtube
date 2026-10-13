import {
  extractYouTubeMetadata,
  waitForVideoElement,
} from '@/lib/youtube/metadata';
import { parseVideoUrl, sameVideo } from '@/lib/video/platforms';
import type { VideoMetadata, VideoPlatform } from '@/types/video';
export class VideoError extends Error {
  constructor(
    public readonly code:
      | 'UNSUPPORTED_PAGE'
      | 'VIDEO_UNAVAILABLE'
      | 'DURATION_UNAVAILABLE'
      | 'AMBIGUOUS_VIDEO',
    message: string,
  ) {
    super(message);
  }
}
export interface VideoAdapter {
  platform: VideoPlatform;
  readMetadata(): Promise<VideoMetadata>;
  findPlayer(): HTMLVideoElement | null;
  waitForPlayer(signal: AbortSignal): Promise<HTMLVideoElement>;
  isAd(): boolean;
}
export function xPostRoot(doc: Document, id: string): Element | null {
  return (
    Array.from(doc.querySelectorAll('[data-testid="tweet"]')).find((root) =>
      Array.from(root.querySelectorAll('a[href]')).some((link) => {
        if (
          !link.querySelector('time') ||
          link.closest('[data-testid="tweet"]') !== root
        )
          return false;
        const identity = parseVideoUrl(
          new URL(link.getAttribute('href')!, 'https://x.com').href,
        );
        return identity?.platform === 'x' && identity.videoId === id;
      }),
    ) ?? null
  );
}
export function facebookVideoRoot(
  video: HTMLVideoElement,
  id: string,
): Element | null {
  for (let root = video.parentElement; root; root = root.parentElement) {
    if (root.querySelectorAll('video').length !== 1) return null;
    const ownsVideo = Array.from(root.querySelectorAll('a[href]')).some(
      (link) => {
        const identity = parseVideoUrl(
          new URL(link.getAttribute('href')!, 'https://www.facebook.com').href,
        );
        return identity?.platform === 'facebook' && identity.videoId === id;
      },
    );
    if (ownsVideo) return root;
  }
  return null;
}
export function selectSocialPlayer(
  doc: Document,
  platform: 'x' | 'facebook',
  id: string,
): HTMLVideoElement | null {
  const root = platform === 'x' ? xPostRoot(doc, id) : doc;
  if (!root) return null;
  const candidates = Array.from(
    root.querySelectorAll<HTMLVideoElement>('video'),
  ).filter((video) => {
    if (platform === 'x' && video.closest('[data-testid="tweet"]') !== root)
      return false;
    if (platform === 'facebook' && !facebookVideoRoot(video, id)) return false;
    const rect = video.getBoundingClientRect();
    return (
      video.isConnected &&
      rect.width > 0 &&
      rect.height > 0 &&
      !video.closest('[aria-hidden="true"]')
    );
  });
  // Candidates must prove ownership through the surrounding post's permalink.
  if (candidates.length > 1)
    throw new VideoError(
      'AMBIGUOUS_VIDEO',
      'Several videos are visible. Open a dedicated page containing only the video you want.',
    );
  return candidates[0] ?? null;
}
export function adapterForPage(): VideoAdapter | null {
  const identity = parseVideoUrl(window.location.href);
  if (!identity) return null;
  if (identity.platform === 'youtube')
    return {
      platform: 'youtube',
      readMetadata: async () => ({
        ...(await extractYouTubeMetadata()),
        platform: 'youtube',
      }),
      findPlayer: () =>
        document.querySelector<HTMLVideoElement>('#movie_player video'),
      waitForPlayer: async (signal) => {
        const video = await waitForVideoElement();
        signal.throwIfAborted();
        return video;
      },
      isAd: () => !!document.querySelector('#movie_player.ad-showing'),
    };
  const platform = identity.platform;
  const adapter: VideoAdapter = {
    platform,
    findPlayer: () => {
      const current = parseVideoUrl(window.location.href);
      if (!current || !sameVideo(identity, current)) return null;
      return selectSocialPlayer(document, platform, identity.videoId);
    },
    // X wraps ordinary posts in placementTracking; Facebook's ad-preview
    // attributes can describe ordinary post content too. Neither proves an ad.
    // Until a player-specific signal is verified, rely on permalink ownership
    // and the shared tracker's duration-change suspension instead of guessing.
    isAd: () => false,
    waitForPlayer: async (signal) => {
      const deadline = Date.now() + 15000;
      while (!signal.aborted && Date.now() < deadline) {
        const video = adapter.findPlayer();
        if (
          video &&
          video.readyState >= 1 &&
          Number.isFinite(video.duration) &&
          video.duration > 0
        )
          return video;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      signal.throwIfAborted();
      throw new VideoError(
        'VIDEO_UNAVAILABLE',
        'The recorded video is unavailable. Open it, press Play, and retry. Live videos are not supported.',
      );
    },
    readMetadata: async () => {
      const video = await adapter.waitForPlayer(new AbortController().signal);
      if (adapter.isAd())
        throw new VideoError(
          'VIDEO_UNAVAILABLE',
          'Wait for the advertisement to finish and retry.',
        );
      const root =
        platform === 'x'
          ? xPostRoot(document, identity.videoId)
          : facebookVideoRoot(video, identity.videoId);
      const meta = (property: string) =>
        document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
          ?.content;
      const text =
        platform === 'x'
          ? root?.querySelector('[data-testid="tweetText"]')?.textContent
          : meta('og:title');
      const title =
        text?.trim().slice(0, 300) ||
        `${platform === 'x' ? 'X' : 'Facebook'} video ${identity.videoId}`;
      const poster =
        video.poster ||
        (platform === 'facebook' ? meta('og:image') : undefined);
      let thumbnailUrl: string | undefined;
      try {
        if (poster && new URL(poster).protocol === 'https:')
          thumbnailUrl = poster;
      } catch {
        /* Local placeholder. */
      }
      return {
        ...identity,
        title,
        durationSeconds: video.duration,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    },
  };
  return adapter;
}
