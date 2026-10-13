import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  zip: { includeSources: ['tests/**'] },
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Darb',
    description:
      'Turn long YouTube videos into structured, trackable daily courses.',
    version: '0.2.0',
    homepage_url: 'https://github.com/KhalidRouissi1/darb-youtube',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    permissions: ['activeTab', 'storage', 'scripting'],
    optional_permissions: ['notifications'],
    optional_host_permissions: [
      'https://x.com/*',
      'https://www.x.com/*',
      'https://twitter.com/*',
      'https://www.twitter.com/*',
      'https://www.facebook.com/*',
      'https://facebook.com/*',
      'https://m.facebook.com/*',
    ],
    action: {
      default_title: 'Open Darb',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'darb-youtube@khalidrouissi1.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
            gecko_android: {
              strict_min_version: '142.0',
            },
          },
        }
      : {}),
  }),
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT runtime entrypoints add required hosts automatically. Social hosts
      // must remain optional, so users grant them through Darb's enable buttons.
      const optional = new Set([
        'https://x.com/*',
        'https://www.x.com/*',
        'https://twitter.com/*',
        'https://www.twitter.com/*',
        'https://www.facebook.com/*',
        'https://facebook.com/*',
        'https://m.facebook.com/*',
      ]);
      if (manifest.manifest_version === 2)
        manifest.optional_permissions = [
          ...new Set([...(manifest.optional_permissions ?? []), ...optional]),
        ];
      if (manifest.host_permissions)
        manifest.host_permissions = manifest.host_permissions.filter(
          (origin: string) => !optional.has(origin),
        );
      if (manifest.permissions)
        manifest.permissions = manifest.permissions.filter(
          (permission) => !optional.has(permission),
        );
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
