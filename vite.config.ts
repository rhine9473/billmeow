import Icons from 'unplugin-icons/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  /* 监听所有网卡，方便手机等局域网设备访问；同时允许自定义主机名访问 */
  server: {
    host: true,
    port: 5173,
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
  ],
})

