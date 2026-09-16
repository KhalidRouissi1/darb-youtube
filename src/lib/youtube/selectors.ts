export const YOUTUBE_SELECTORS = {
  player: [
    'video.html5-main-video',
    '#movie_player video',
    'ytd-player video',
    'video',
  ],
  title: [
    'meta[property="og:title"]',
    'meta[name="title"]',
    'h1.ytd-watch-metadata yt-formatted-string',
    '#title h1 yt-formatted-string',
  ],
  channel: [
    'ytd-watch-metadata #owner #channel-name a',
    'ytd-video-owner-renderer #channel-name a',
    '#owner-name a',
    'link[itemprop="name"]',
  ],
  thumbnail: ['meta[property="og:image"]', 'link[itemprop="thumbnailUrl"]'],
  duration: [
    'ytd-watch-flexy meta[itemprop="duration"]',
    '#watch7-content meta[itemprop="duration"]',
    '#player meta[itemprop="duration"]',
  ],
} as const;
