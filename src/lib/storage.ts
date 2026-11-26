/**
 * 本地存储读写封装（localStorage 不可用或数据损坏时安全降级）
 *
 * 失败时除了返回兜底值外，还会通过 `notifyError` 告知用户，
 * 因为浏览器存储失败时界面通常「看起来一切正常」，用户无法察觉设置没被保存。
 *
 * TODO: 待接入专用 notification 组件后，替换此处的 `alert` 实现。
 */

/**
 * 向用户提示存储异常。
 *
 * 目前用原生 `alert` 兜底，保证用户一定能看到；
 * 后续会替换为应用内的 notification 组件（保留统一入口，替换时只需改这里）。
 *
 * @param message 展示给用户的提示文案
 */
function notifyError(message: string) {
  if (typeof window === 'undefined') return
  window.alert(message)
}

/**
 * 读取并反序列化 localStorage 中的值。
 *
 * 注意：`JSON.parse` 的结果用 `as T` 强转，**不做运行时校验**。
 * 存储内容被外部篡改或版本变更导致结构不符时，返回值可能与 `T` 不一致，
 * 调用方需自行做字段级校验（参考 theme 的 normalizeTransition）。
 *
 * @param key 存储键
 * @param fallback 读取失败时返回的兜底值
 * @returns 解析后的值；读取或解析失败时返回 `fallback`
 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (error) {
    console.error(`[storage] 读取 "${key}" 失败，已回退到默认值`, error)
    return fallback
  }
}

/**
 * 序列化并写入 localStorage。
 *
 * 写入失败（隐私模式、配额超限、被浏览器策略禁用）时记录日志并提示用户，
 * 不向调用方抛出异常，避免因存储问题中断业务流程。
 *
 * @param key 存储键
 * @param value 任意可被 `JSON.stringify` 序列化的值
 * @returns 是否写入成功
 */
export function writeStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.error(`[storage] 写入 "${key}" 失败，本次修改不会被保存`, error)
    notifyError('设置保存失败，可能是浏览器存储空间不足或处于隐私模式。刷新后修改可能丢失。')
    return false
  }
}

/**
 * 从 localStorage 中删除指定键。
 *
 * 删除失败时记录日志并提示用户，不向调用方抛出异常。
 *
 * @param key 存储键
 * @returns 是否删除成功
 */
export function removeStorage(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    console.error(`[storage] 删除 "${key}" 失败`, error)
    notifyError('数据清除失败，请检查浏览器存储权限后重试。')
    return false
  }
}
