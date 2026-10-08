import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * The build lives at the repo root; the app it builds lives in frontend/.
 *
 * `root` points Vite at frontend/, where index.html is, so the tooling config
 * sits beside requirements.txt and run.py rather than a level down. `envDir`
 * brings it back out to the root, so there is one .env for the whole project
 * rather than one per half.
 *
 * The dev server runs on 5090 and the API on 5050. Everything the backend owns
 * is proxied rather than called cross-origin, so the session cookie is
 * same-origin in development exactly as it is in production. `/static` is
 * proxied too, because the old pages' assets — the avatars, the 80 calendar
 * icons, the logo — are served by the backend out of utils/, and the React app
 * uses the same ones.
 *
 * The last three are *pages*, not endpoints: the ones backend/routes/pages.py
 * still renders from Jinja, listed in backend/routes/spa.py as the half React
 * has not taken over. They have to be here because of how a dev server answers
 * an unknown path — it serves index.html, so React's catch-all route sees a
 * path it does not know and redirects to /home. That is silent: the link works
 * in production, where one server owns both halves, and in development it just
 * quietly goes somewhere else. The footer's Careers and Contact Support did
 * exactly that, and so did /engine at the end of the hidden chain, which is
 * how this was noticed. Anything moved out of pages.py should lose its line
 * here at the same time.
 */
const api = {
  target: 'http://127.0.0.1:5050',
  changeOrigin: false,
};

export default defineConfig({
  root: 'frontend',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
      // Rules the server applies too, kept once (shared/README.md).
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5090,
    strictPort: true,
    // `root` is frontend/, and the dev server refuses files outside it unless
    // told: shared/ is one level up.
    fs: {
      allow: [fileURLToPath(new URL('.', import.meta.url))],
    },
    proxy: {
      '/api': api,
      '/static': api,
      '/auth': api,
      '/verify': api,
      '/careers': api,
      '/contact-support': api,
      '/engine': api,
    },
  },
  build: {
    // Relative to `root`, so the bundle lands in frontend/dist.
    outDir: 'dist',
    emptyOutDir: true,

    /*
     * Source maps are off unless asked for, and `hidden` would not have been
     * enough.
     *
     * This was `true`, and backend/routes/spa.py mounts dist/assets as static
     * files, so every map was served: 29 of them, 2.2MB for the main bundle
     * alone. A map carries the original source, comments included — and the
     * comments in this repository are long, and several of them describe
     * vulnerabilities by explaining the shape of what used to be there. That
     * is a considerate thing to write for whoever maintains this and a
     * generous thing to hand a stranger.
     *
     * `hidden` only drops the `//# sourceMappingURL` line at the end of the
     * bundle. The file is still written and still served, and its name is the
     * bundle's name with `.map` on the end — which anybody reading the page
     * source already has. It hides the maps from devtools, not from people.
     *
     * So they are not generated. Set SUMMIT_SOURCEMAPS=1 for a build you intend
     * to debug, and do not deploy that one.
     */
    sourcemap: process.env.SUMMIT_SOURCEMAPS === '1',
  },
});
