import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { notify } from '../lib/toast'

/**
 * 创建懒加载路由组件。
 *
 * 弱网下首次点页签要等整个 chunk 下载完才渲染，用户会觉得「点了没反应」。
 * 这里只返回原始动态导入函数，由下面的 `prefetchRoutes` 在浏览器空闲时
 * 提前拉取并缓存，首次点击即可直接命中模块缓存。
 *
 * @param loader 页面入口的动态导入函数
 * @returns 路由的 component
 */
function page(loader: () => Promise<unknown>) {
  return loader
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/records',
  },
  {
    path: '/records',
    name: 'records',
    component: page(() => import('../views/records/index.vue')),
  },
  {
    path: '/record',
    name: 'record',
    component: page(() => import('../views/record/index.vue')),
  },
  {
    path: '/accounts',
    name: 'accounts',
    component: page(() => import('../views/accounts/index.vue')),
  },
  {
    path: '/stats',
    name: 'stats',
    component: page(() => import('../views/stats/index.vue')),
  },
  {
    path: '/settings',
    name: 'settings',
    component: page(() => import('../views/settings/index.vue')),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/records',
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

/**
 * 空闲时预取尚未访问的页面 chunk。
 *
 * 只在网络可用且用户没有开启省流量时执行；`requestIdleCallback` 不可用时
 * 退回 `setTimeout`，保证 Safari 旧版也能受益。预取失败静默忽略，
 * 不影响正常点击跳转。
 */
function prefetchRoutes() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }

  /* 省流量模式 / 明确离线时不预取，避免浪费用户流量 */
  if (nav.connection?.saveData) return

  /* 离线时预取必然失败，直接跳过，避免无意义的错误提示 */
  if (navigator.onLine === false) return

  const warmUp = () => {
    routes.forEach((route) => {
      const component = route.component as (() => Promise<unknown>) | undefined
      if (typeof component !== 'function') return
      /* 动态导入结果会被模块缓存，因此重复调用是安全的 */
      component().catch((error: unknown) => {
        /* 预取失败不影响点击（点击时会重新加载），但必须记录日志并提示；
           用 warn 级别区分于真正的跳转失败 */
        console.warn(`[router] 预取路由 "${String(route.name ?? route.path)}" 失败`, error)
        notify.error('部分页面资源加载失败，网络恢复后请重试。')
      })
    })
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmUp, { timeout: 3000 })
  } else {
    setTimeout(warmUp, 1000)
  }
}

export { prefetchRoutes }
export default router
