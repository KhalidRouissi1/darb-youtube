import { installEmbeddedRelay } from '@/lib/platforms/hackertube-relay';
export default defineContentScript({
  matches: ['https://hackertube.org/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main: installEmbeddedRelay,
});
