import { YOUTUBE_SELECTORS } from '@/lib/youtube/selectors';
import { videoMetadataSchema } from '@/lib/validation/schemas';
import type { YouTubeVideoMetadata } from '@/types/youtube';

export class YouTubeMetadataError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_YOUTUBE_VIDEO'
      | 'VIDEO_UNAVAILABLE'
      | 'DURATION_UNAVAILABLE'
      | 'YOUTUBE_STRUCTURE_CHANGED',
  ) {
    super(message);
    this.name = 'YouTubeMetadataError';
  }
}

export function getVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      return sanitizeVideoId(parsed.pathname.split('/').filter(Boolean)[0]);
    }

    if (!hostname.endsWith('youtube.com')) {
      return null;
    }

    if (parsed.pathname === '/watch') {
      return sanitizeVideoId(parsed.searchParams.get('v'));
    }

    const routeMatch = parsed.pathname.match(
      /^\/(?:shorts|live|embed)\/([^/?#]+)/,
    );
    return sanitizeVideoId(routeMatch?.[1]);
  } catch {
    return null;
  }
}

export function parseIsoDuration(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/,
  );

  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;

  return Number.isFinite(total) && total > 0 ? total : null;
}

export interface YouTubePlayerDetails {
  videoId: string;
  title: string;
  author?: string | undefined;
  durationSeconds: number;
  thumbnailUrl?: string | undefined;
}

export function extractInitialPlayerDetails(
  scriptContents: readonly string[],
  expectedVideoId: string,
): YouTubePlayerDetails | null {
  for (const content of scriptContents) {
    const markerIndex = content.indexOf('ytInitialPlayerResponse');
    if (markerIndex === -1) {
      continue;
    }

    const assignmentIndex = content.indexOf('=', markerIndex);
    if (assignmentIndex === -1) {
      continue;
    }

    const jsonText = extractBalancedObject(content, assignmentIndex + 1);
    if (!jsonText) {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(jsonText);
      const details = readPlayerDetails(parsed);

      if (details?.videoId === expectedVideoId) {
        return details;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function extractYouTubeMetadata(): Promise<YouTubeVideoMetadata> {
  const videoId = getVideoIdFromUrl(window.location.href);

  if (!videoId || !window.location.pathname.includes('/watch')) {
    throw new YouTubeMetadataError(
      'Open a standard YouTube video before creating a course.',
      'NOT_YOUTUBE_VIDEO',
    );
  }

  const playerDetails = extractInitialPlayerDetails(
    Array.from(document.scripts, (script) => script.textContent ?? ''),
    videoId,
  );
  const video = await waitForVideoElement();
  const durationSeconds = await resolveDuration(
    video,
    playerDetails?.durationSeconds,
  );
  const title =
    playerDetails?.title ??
    readMetadataValue(YOUTUBE_SELECTORS.title) ??
    document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();

  if (!title) {
    throw new YouTubeMetadataError(
      'Darb could not read this video title. YouTube may have changed its page structure.',
      'YOUTUBE_STRUCTURE_CHANGED',
    );
  }

  const channelName =
    playerDetails?.author ?? readMetadataValue(YOUTUBE_SELECTORS.channel);
  const detectedThumbnail =
    playerDetails?.thumbnailUrl ??
    readMetadataValue(YOUTUBE_SELECTORS.thumbnail);
  const thumbnailUrl =
    detectedThumbnail &&
    (() => {
      try {
        return new URL(detectedThumbnail, window.location.origin).toString();
      } catch {
        return null;
      }
    })();

  return videoMetadataSchema.parse({
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    title,
    thumbnailUrl:
      thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ...(channelName ? { channelName } : {}),
    durationSeconds,
  });
}

export async function waitForVideoElement(
  timeoutMilliseconds = 8000,
): Promise<HTMLVideoElement> {
  const existing = findVideoElement();
  if (existing) {
    return existing;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(
        new YouTubeMetadataError(
          'The YouTube player is unavailable or still loading.',
          'VIDEO_UNAVAILABLE',
        ),
      );
    }, timeoutMilliseconds);

    const observer = new MutationObserver(() => {
      const video = findVideoElement();
      if (!video) {
        return;
      }

      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(video);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function findVideoElement(): HTMLVideoElement | null {
  for (const selector of YOUTUBE_SELECTORS.player) {
    const element = document.querySelector<HTMLVideoElement>(selector);
    if (element) {
      return element;
    }
  }

  return null;
}

async function resolveDuration(
  video: HTMLVideoElement,
  playerDuration?: number,
): Promise<number> {
  if (
    playerDuration !== undefined &&
    Number.isFinite(playerDuration) &&
    playerDuration > 0
  ) {
    return playerDuration;
  }

  await waitForAdvertisementToFinish();

  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  const metadataDuration = readScopedDuration();
  if (metadataDuration) {
    return metadataDuration;
  }

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 5000);
    video.addEventListener(
      'loadedmetadata',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  throw new YouTubeMetadataError(
    'Darb could not detect this video duration. Wait for the player to load and try again.',
    'DURATION_UNAVAILABLE',
  );
}

function readScopedDuration(): number | null {
  for (const selector of YOUTUBE_SELECTORS.duration) {
    const values = Array.from(
      document.querySelectorAll<HTMLMetaElement>(selector),
      (element) => parseIsoDuration(element.getAttribute('content')),
    ).filter((value): value is number => value !== null);

    if (values.length === 1) {
      return values[0] ?? null;
    }
  }

  return null;
}

async function waitForAdvertisementToFinish(): Promise<void> {
  const player = document.querySelector('#movie_player');
  if (!player?.classList.contains('ad-showing')) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(
        new YouTubeMetadataError(
          'Wait for the current YouTube advertisement to finish, then try again.',
          'DURATION_UNAVAILABLE',
        ),
      );
    }, 30000);

    const observer = new MutationObserver(() => {
      if (player.classList.contains('ad-showing')) {
        return;
      }

      window.clearTimeout(timeout);
      observer.disconnect();
      resolve();
    });

    observer.observe(player, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

function readMetadataValue(selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      continue;
    }

    const value =
      element.getAttribute('content') ??
      element.getAttribute('href') ??
      element.textContent;
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function sanitizeVideoId(value: string | null | undefined): string | null {
  if (!value || !/^[\w-]{6,20}$/.test(value)) {
    return null;
  }

  return value;
}

function extractBalancedObject(
  source: string,
  searchFrom: number,
): string | null {
  const start = source.indexOf('{', searchFrom);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        insideString = false;
      }
      continue;
    }

    if (character === '"') {
      insideString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function readPlayerDetails(value: unknown): YouTubePlayerDetails | null {
  if (!isRecord(value) || !isRecord(value.videoDetails)) {
    return null;
  }

  const details = value.videoDetails;
  const videoId = details.videoId;
  const title = details.title;
  const durationSeconds = Number(details.lengthSeconds);

  if (
    typeof videoId !== 'string' ||
    typeof title !== 'string' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return null;
  }

  const thumbnails =
    isRecord(details.thumbnail) && Array.isArray(details.thumbnail.thumbnails)
      ? details.thumbnail.thumbnails
      : [];
  const thumbnailUrl = [...thumbnails]
    .reverse()
    .find(
      (thumbnail): thumbnail is Record<string, unknown> =>
        isRecord(thumbnail) && typeof thumbnail.url === 'string',
    )?.url;

  return {
    videoId,
    title,
    durationSeconds,
    ...(typeof details.author === 'string'
      ? { author: details.author }
      : {}),
    ...(typeof thumbnailUrl === 'string' ? { thumbnailUrl } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
