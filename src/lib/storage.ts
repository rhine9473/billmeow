/**
 * 本地存储读写封装（localStorage 不可用或数据损坏时安全降级）
 */

/**
 * 读取并反序列化 localStorage 中的值。
 *
 * 注意：`JSON.parse` 的结果用 `as T` 强转，**不做运行时校验**。
 * 存储内容被外部篡改或版本变更导致结构不符时，返回值可能与 `T` 不一致，
 * 调用方需自行做字段级校验（参考 theme 的 normalizeTransition）。
 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * 序列化并写入 localStorage。
 *
 * 写入失败（隐私模式、配额超限、被浏览器策略禁用）时静默忽略，不抛异常。
 *
 * @param key 存储键
 * @param value 任意可被 `JSON.stringify` 序列化的值
 */
export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略存储失败（如隐私模式、空间不足） */
  }
}

/**
 * 从 localStorage 中删除指定键。
 *
 * 删除失败时静默忽略，不抛异常。
 *
 * @param key 存储键
 */
export function removeStorage(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 同上：忽略删除失败 */
  }
}
