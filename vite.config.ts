import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    // どのビルドが動いているか端末で判別するための刻印（マイページ最下部に表示）
    __BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }),
    ),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FanHive',
        short_name: 'FanHive',
        description: 'ファン同士で作る共有カレンダー',
        theme_color: '#0e0e10',
        background_color: '#0e0e10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        share_target: {
          action: '/post',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // /api/ 配下は SPA ではない（指標ダッシュボード等）。除外しないと
        // Service Worker が index.html を返してしまい、PWAを一度開いた端末では開けない。
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // @capacitor-firebase/messaging のWeb実装が読む firebase/messaging を空実装に差し替える。
      // このプラグインは iOSネイティブ専用（Androidは @capacitor/push-notifications のまま）なので、
      // Web用に firebase パッケージ本体を抱える必要がない。詳細は firebaseMessagingWebStub.ts
      'firebase/messaging': new URL('./src/lib/firebaseMessagingWebStub.ts', import.meta.url).pathname,
    },
  },
})
