import { execSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_ID } from './src/appId';

/** This machine's address on the local network, so online invites made in dev work on other devices. */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '';
}

/**
 * Which build this is, shown in the lobby so a phone can tell whether the latest deploy has arrived: the
 * commit (with `+` when built from uncommitted changes), or `BUILD_ID` when set (scripts/pwa-check.ts).
 */
function buildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  const git = (args: string) =>
    execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  try {
    return git('rev-parse --short HEAD') + (git('status --porcelain') ? '+' : '');
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ command, mode }) => ({
  // `npm run dev:https`: a self-signed certificate, so a phone on the local network gets a secure
  // context (share sheet, clipboard, service worker). The browser warns once per device.
  plugins: [
    react(),
    ...(mode === 'https' ? [basicSsl()] : []),
    // The service worker for offline play and the home-screen app (registered in src/pwa.ts, which
    // decides when a new version takes over). The manifest is public/manifest.webmanifest.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // The fonts come from Google: cached on first use, so a game offline keeps its lettering. Cache Storage
        // is shared by the whole origin (softhook.github.io), so the cache is named for this app.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: `${APP_ID}-google-fonts`, expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  // Relative asset paths so the build works under a subpath (e.g. GitHub Pages /regolith/).
  base: './',
  // All addresses: IPv4 and IPv6 localhost (browsers differ in which "localhost" means), and the
  // local network, for trying online play from a phone.
  server: { port: 5173, host: true },
  // Dev only: a build must not carry this machine's address.
  define: {
    __LAN_ADDRESS__: JSON.stringify(command === 'serve' ? lanAddress() : ''),
    __BUILD_ID__: JSON.stringify(command === 'serve' ? 'dev' : buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
}));
