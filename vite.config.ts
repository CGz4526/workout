import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => {
  // Deploy target is controlled by an env var so the same source works for both:
  //   Cloudflare Pages (root):   base = "/"          (default)
  //   GitHub Pages (project):    base = "/workout/"  (set WORKOUT_BASE=/workout/)
  const base = process.env.WORKOUT_BASE || '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: '健身记录',
          short_name: '健身记录',
          description: '个人健身训练记录工具',
          // 与 index.html 的 <meta name="theme-color"> 保持一致：
          // 默认按浅色主题，深色主题下由 index.html 的内联脚本改写。
          theme_color: '#f4f5f7',
          background_color: '#f4f5f7',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  }
})
