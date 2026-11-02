import { startVideoBridge } from '@/lib/video/content-bridge';
export default defineContentScript({
  matches: ['*://*.youtube.com/*', 'https://hackertube.org/*'],
  runAt: 'document_idle',
  main: startVideoBridge,
});
