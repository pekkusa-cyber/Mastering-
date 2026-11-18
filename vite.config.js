import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    // CI sätter VERSION_CODE (GitHub-körningens nummer); live-uppdateringen jämför mot det (src/updater.js)
    __BUNDLE_VERSION__: JSON.stringify(Number(process.env.VERSION_CODE || 0)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { outDir: 'dist', target: 'es2020', assetsInlineLimit: 0 },
});
