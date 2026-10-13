import { startVideoBridge } from '@/lib/video/content-bridge';
export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main: startVideoBridge,
});
