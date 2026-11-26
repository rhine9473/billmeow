import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/settings',
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/settings/index.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/settings',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  /* 路由切换后回到页面顶部，避免沿用上一页的滚动位置 */
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
