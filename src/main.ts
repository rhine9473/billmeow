import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './index.scss'
import App from './App.vue'
import router from './router'
import { useTheme } from './stores/theme'

/* 在挂载前初始化主题：读取已保存的设置并应用到 <html>，
避免直接访问非设置路由时主题未初始化（首屏闪烁 / 无 data-theme） */
useTheme()

const app = createApp(App)

app.use(createPinia()).use(router).mount('#app')
