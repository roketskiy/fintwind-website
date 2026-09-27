import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  base: process.env.SITE_BASE || '/',
  vite: { build: { assetsInlineLimit: 0 } },
});
