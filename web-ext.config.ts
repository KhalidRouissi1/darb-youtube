import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: {
    chrome: '/usr/bin/brave',
  },
  startUrls: ['https://www.youtube.com/'],
});
