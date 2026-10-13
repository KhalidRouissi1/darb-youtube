import { describe, it, expect } from 'vitest';
import {
  parseVideoUrl,
  platformFromUrl,
  sameVideo,
  sessionUrl,
} from '@/lib/video/platforms';
import { videoMetadataSchema } from '@/lib/validation/schemas';

describe('platform video identity', () => {
  it('normalizes X post URLs and legacy Twitter hosts', () => {
    expect(
      parseVideoUrl(
        'https://twitter.com/hayatomaruu/status/2109373280041816140?ref=abc',
      ),
    ).toEqual({
      platform: 'x',
      videoId: '2109373280041816140',
      videoUrl: 'https://x.com/i/web/status/2109373280041816140',
    });
    expect(
      parseVideoUrl('https://x.com/i/web/status/2109373280041816140')?.videoId,
    ).toBe('2109373280041816140');
  });
  it('normalizes Facebook watch and dedicated video pages', () => {
    const expected = {
      platform: 'facebook',
      videoId: '8368792419872400',
      videoUrl: 'https://www.facebook.com/watch/?v=8368792419872400',
    };
    expect(
      parseVideoUrl('https://www.facebook.com/watch/?v=8368792419872400'),
    ).toEqual(expected);
    expect(
      parseVideoUrl(
        'https://www.facebook.com/NASASCaN/videos/a-video/8368792419872400/',
      ),
    ).toEqual(expected);
    expect(
      parseVideoUrl('https://m.facebook.com/video.php?v=8368792419872400'),
    ).toEqual(expected);
  });
  it.each([
    'https://x.com/home',
    'https://x.com/user/status/123/video/1',
    'https://www.facebook.com/reel/123',
    'https://www.facebook.com/watch/',
    'https://www.youtube.com/shorts/abc',
    'https://x.com.evil.test/user/status/123',
    'https://notyoutube.com/watch?v=abc',
    'javascript:alert(1)',
    'https://user:pass@x.com/u/status/1',
  ])('rejects unsupported or deceptive URLs: %s', (url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });
  it('does not recognize unsafe host variants', () => {
    expect(platformFromUrl('http://x.com/u/status/1')).toBeNull();
    expect(platformFromUrl('https://x.com:8443/u/status/1')).toBeNull();
  });
  it('separates platforms with identical numeric IDs', () => {
    expect(
      sameVideo(
        { platform: 'x', videoId: '123' },
        { platform: 'facebook', videoId: '123' },
      ),
    ).toBe(false);
    expect(
      sameVideo({ videoId: 'abc' }, { platform: 'youtube', videoId: 'abc' }),
    ).toBe(true);
  });
  it('adds timestamps only to YouTube', () => {
    expect(sessionUrl('https://www.youtube.com/watch?v=abc', 901.8)).toBe(
      'https://www.youtube.com/watch?v=abc&t=901s',
    );
    expect(sessionUrl('https://x.com/u/status/123', 901)).toBe(
      'https://x.com/i/web/status/123',
    );
    expect(sessionUrl('https://facebook.com/watch/?v=123', 901)).toBe(
      'https://www.facebook.com/watch/?v=123',
    );
  });
  it('rejects mismatched metadata and unsafe thumbnails', () => {
    const video = {
      platform: 'x',
      videoId: '123',
      videoUrl: 'https://www.facebook.com/watch/?v=123',
      title: 'Video',
      durationSeconds: 1800,
    };
    expect(videoMetadataSchema.safeParse(video).success).toBe(false);
    expect(
      videoMetadataSchema.safeParse({
        ...video,
        videoUrl: 'https://x.com/u/status/123',
      }).success,
    ).toBe(true);
    expect(
      videoMetadataSchema.safeParse({
        ...video,
        thumbnailUrl: 'http://example.com/a.png',
      }).success,
    ).toBe(false);
  });
});
