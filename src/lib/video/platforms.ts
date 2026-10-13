import type { VideoPlatform } from '@/types/video';
export const PLATFORM_LABELS = {
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
};
export const OPTIONAL_ORIGINS = {
  x: [
    'https://x.com/*',
    'https://www.x.com/*',
    'https://twitter.com/*',
    'https://www.twitter.com/*',
  ],
  facebook: [
    'https://www.facebook.com/*',
    'https://facebook.com/*',
    'https://m.facebook.com/*',
  ],
};
export type VideoIdentity = {
  platform: VideoPlatform;
  videoId: string;
  videoUrl: string;
};
export function platformFromUrl(value: string): VideoPlatform | null {
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const host = url.hostname;
    if (host === 'youtube.com' || host.endsWith('.youtube.com'))
      return 'youtube';
    if (url.protocol !== 'https:') return null;
    if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host))
      return 'x';
    if (['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(host))
      return 'facebook';
  } catch {
    /* Invalid URL. */
  }
  return null;
}
export function parseVideoUrl(value: string): VideoIdentity | null {
  try {
    const url = new URL(value);
    const platform = platformFromUrl(value);
    if (platform === 'youtube' && url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      if (id && /^[\w-]+$/.test(id))
        return {
          platform,
          videoId: id,
          videoUrl: `https://www.youtube.com/watch?v=${id}`,
        };
    }
    if (platform === 'x') {
      const match = url.pathname.match(
        /^\/(?:[\w]+|i\/web)\/status\/(\d+)\/?$/,
      );
      if (match?.[1])
        return {
          platform,
          videoId: match[1],
          videoUrl: `https://x.com/i/web/status/${match[1]}`,
        };
    }
    if (platform === 'facebook') {
      const pathId = url.pathname.match(
        /^\/[\w.]+\/videos\/(?:[^/]+\/)?(\d+)\/?$/,
      )?.[1];
      const queryId = /^\/(watch\/?|video\.php)$/.test(url.pathname)
        ? url.searchParams.get('v')
        : null;
      const id = pathId ?? queryId;
      if (id && /^\d+$/.test(id))
        return {
          platform,
          videoId: id,
          videoUrl: `https://www.facebook.com/watch/?v=${id}`,
        };
    }
  } catch {
    /* Invalid URL. */
  }
  return null;
}
export function sameVideo(
  a: { platform?: VideoPlatform; videoId: string },
  b: { platform?: VideoPlatform; videoId: string },
): boolean {
  return (
    (a.platform ?? 'youtube') === (b.platform ?? 'youtube') &&
    a.videoId === b.videoId
  );
}
export function sessionUrl(videoUrl: string, seconds: number): string {
  const identity = parseVideoUrl(videoUrl);
  if (!identity) throw new Error('This video URL is unsupported.');
  const url = new URL(identity.videoUrl);
  if (identity.platform === 'youtube')
    url.searchParams.set('t', `${Math.floor(seconds)}s`);
  return url.toString();
}
