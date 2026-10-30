import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'wxt/browser': fileURLToPath(new URL('./browser.ts', import.meta.url)),
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT),
    strictPort: true,
    allowedHosts: ['darb-preview.localhost'],
  },
});
