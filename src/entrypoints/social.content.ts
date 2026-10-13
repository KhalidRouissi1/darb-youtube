import { startVideoBridge } from '@/lib/video/content-bridge';
export default defineContentScript({
  matches: [
    'https://x.com/*',
    'https://www.x.com/*',
    'https://twitter.com/*',
    'https://www.twitter.com/*',
    'https://www.facebook.com/*',
    'https://facebook.com/*',
    'https://m.facebook.com/*',
  ],
  registration: 'runtime',
  runAt: 'document_idle',
  main: startVideoBridge,
});
