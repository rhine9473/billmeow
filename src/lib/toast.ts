/**
 * 应用内提示（notification）统一入口。
 *
 * 采用模块级事件订阅，而不是直接操作 DOM：
 * 业务代码只负责「发提示」，真正怎么渲染交给 UI 层（`ToastHost.vue`）。
 * 这样存储层、路由层等非组件模块也能提示用户，且替换 UI 时无需改调用方。
 *
 * @example
 * notify.error('设置保存失败')
 * notify.success('已保存')
 */

/** 提示类型，决定图标与配色 */
export type ToastKind = 'error' | 'success' | 'info'

/** 一条待展示的提示 */
export interface ToastItem {
  /** 唯一 id，用于列表 key 与手动关闭 */
  id: number
  /** 提示类型 */
  kind: ToastKind
  /** 展示文案 */
  message: string
  /** 自动关闭时长（毫秒）；0 表示不自动关闭 */
  duration: number
}

type Listener = (item: ToastItem) => void

/** 订阅者列表：目前只有 UI 层的 ToastHost */
const listeners = new Set<Listener>()

let seed = 0

/**
 * 订阅提示事件。
 *
 * @param listener 收到新提示时被调用
 * @returns 取消订阅的函数，组件卸载时必须调用
 */
export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 推送一条提示。
 *
 * @param kind 提示类型
 * @param message 展示文案
 * @param duration 自动关闭时长（毫秒），默认错误 6000、其它 3000
 */
export function pushToast(kind: ToastKind, message: string, duration?: number): void {
  const item: ToastItem = {
    id: ++seed,
    kind,
    message,
    duration: duration ?? (kind === 'error' ? 6000 : 3000),
  }

  /* 没有订阅者（例如提示组件还没挂载）时至少留下日志，不做无声丢弃 */
  if (listeners.size === 0) {
    console.warn(`[toast] ${message}`)
    return
  }

  listeners.forEach((listener) => listener(item))
}

/**
 * 便捷调用入口。
 *
 * @example
 * notify.error('设置保存失败')
 */
export const notify = {
  /** 错误提示：停留更久，便于阅读 */
  error: (message: string, duration?: number) => pushToast('error', message, duration),
  /** 成功提示 */
  success: (message: string, duration?: number) => pushToast('success', message, duration),
  /** 普通信息提示 */
  info: (message: string, duration?: number) => pushToast('info', message, duration),
}
