import type { MetadataRoute } from 'next';

/**
 * Served at /manifest.webmanifest. Next emits the <link rel="manifest"> itself,
 * so nothing in layout.tsx references this.
 *
 * iOS 26 removed installability requirements entirely -- Safari will add any
 * page to the home screen -- so this exists for the icon, name and standalone
 * display rather than to unlock installation. No service worker is needed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rocket — marathon training',
    short_name: 'Rocket',
    description: 'The block, the week, and what actually got run.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
