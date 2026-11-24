import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 监听所有网卡，方便手机等局域网设备访问；同时允许自定义主机名访问
  server: {
    host: true,
    port: 5173,
  },
  plugins: [vue()],
})
