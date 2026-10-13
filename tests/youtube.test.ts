import { describe, expect, it } from 'vitest';
import {
  extractInitialPlayerDetails,
  getVideoIdFromUrl,
  isStandardYouTubeWatchUrl,
  isYouTubeHost,
  parseIsoDuration,
} from '@/lib/youtube/metadata';
import { videoMetadataSchema } from '@/lib/validation/schemas';

describe('YouTube metadata utilities', () => {
  it('extracts IDs only from supported YouTube URLs', () => {
    expect(
      getVideoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(getVideoIdFromUrl('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(
      getVideoIdFromUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(getVideoIdFromUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBe(
      null,
    );
  });

  it('identifies standard YouTube watch URLs', () => {
    expect(
      isStandardYouTubeWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(true);
    expect(
      isStandardYouTubeWatchUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(true);
    expect(
      isStandardYouTubeWatchUrl('https://youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(true);
    expect(isStandardYouTubeWatchUrl('https://www.youtube.com/')).toBe(false);
    expect(
      isStandardYouTubeWatchUrl('https://www.youtube.com/feed/subscriptions'),
    ).toBe(false);
    expect(
      isStandardYouTubeWatchUrl('https://example.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(false);
    expect(isStandardYouTubeWatchUrl(undefined)).toBe(false);
    expect(isStandardYouTubeWatchUrl('')).toBe(false);
  });

  it('identifies YouTube hosts', () => {
    expect(
      isYouTubeHost('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(true);
    expect(isYouTubeHost('https://youtube.com')).toBe(true);
    expect(
      isYouTubeHost('https://m.youtube.com/results?search_query=test'),
    ).toBe(true);
    expect(isYouTubeHost('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeHost('https://google.com')).toBe(false);
    expect(isYouTubeHost('https://github.com')).toBe(false);
    expect(isYouTubeHost(undefined)).toBe(false);
    expect(isYouTubeHost('')).toBe(false);
  });

  it('parses ISO-8601 video durations', () => {
    expect(parseIsoDuration('PT1H1M5S')).toBe(3665);
    expect(parseIsoDuration('PT9M')).toBe(540);
    expect(parseIsoDuration('invalid')).toBe(null);
  });

  it('rejects missing video metadata', () => {
    expect(
      videoMetadataSchema.safeParse({
        videoId: 'abc123',
        videoUrl: 'https://www.youtube.com/watch?v=abc123',
      }).success,
    ).toBe(false);
  });

  it('reads the current video duration from YouTube player data', () => {
    const script = `
      var ytInitialPlayerResponse = {
        "videoDetails": {
          "videoId": "course12345",
          "title": "Eight hour course",
          "lengthSeconds": "28800",
          "author": "Teacher",
          "thumbnail": {
            "thumbnails": [
              {"url": "https://i.ytimg.com/vi/course12345/default.jpg"},
              {"url": "https://i.ytimg.com/vi/course12345/hqdefault.jpg"}
            ]
          }
        }
      };
    `;

    expect(extractInitialPlayerDetails([script], 'course12345')).toEqual({
      videoId: 'course12345',
      title: 'Eight hour course',
      durationSeconds: 28800,
      author: 'Teacher',
      thumbnailUrl:
        'https://i.ytimg.com/vi/course12345/hqdefault.jpg',
    });
  });

  it('ignores stale player data from a previous SPA video', () => {
    const script =
      'var ytInitialPlayerResponse = {"videoDetails":{"videoId":"oldVideo1","title":"Old","lengthSeconds":"1680"}};';

    expect(extractInitialPlayerDetails([script], 'newVideo1')).toBe(null);
  });
});
