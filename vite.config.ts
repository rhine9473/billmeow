import Icons from 'unplugin-icons/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  /* 监听所有网卡，方便手机等局域网设备访问；同时允许自定义主机名访问 */
  server: {
    host: true,
    port: 5173,
    /* 显式放行反代或自定义域名 */
    allowedHosts: ['billmeow.gumi.dev'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
  },
  plugins: [
    vue(),
    /* 离线图标：把 `~icons/{集合}/{图标名}` 编译成内联 SVG 组件，不产生任何网络请求 */
    /* import IconAdd from '~icons/material-symbols/add' */
    Icons({
      compiler: 'vue3',
      autoInstall: false, /* 只使用本地已安装的图标集，避免联网自动下载 */
      scale: 1,
      defaultClass: 'iconify-icon',
    }),
    VitePWA({
      /* 有新版本时自动更新，无需用户手动刷新 */
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '账单喵',
        short_name: '账单喵',
        description: '更好的账单管理工具',
        lang: 'zh-CN',
        theme_color: '#4f46e5',
        background_color: '#f4f4f6',
        /* standalone 让应用以独立窗口启动，视觉上接近原生 App */
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        /* 预缓存构建产物，保证离线可打开 */
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            /* 同步接口等敏感请求永不缓存，避免拿到过期数据 */
            urlPattern: /^https:\/\/api\.github\.com\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      /* 开发环境默认不启用 SW，避免干扰热更新 */
      devOptions: {
        enabled: false,
      },
    }),
  ],
})

