import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Darb',
    description:
      'Turn long YouTube videos into structured, trackable daily courses.',
    version: '0.1.0',
    homepage_url: 'https://github.com/KhalidRouissi1/darb-youtube',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    permissions: ['activeTab', 'storage'],
    optional_permissions: ['notifications'],
    action: {
      default_title: 'Open Darb',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
