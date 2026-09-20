import { defineConfig } from 'vite';

export default defineConfig({
  // Baked in at build time so the settings page can show which build is running.
  // Without it there is no way to tell a stale installed bundle from a fresh one.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    // Windows sometimes holds the outDir open; clearing it is not worth a
    // failed build. Hashed assets make leftover files harmless.
    emptyOutDir: false,
  },
});
