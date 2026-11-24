import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readStorage, removeStorage, writeStorage } from './storage'

const KEY = 'test:storage'

/* 模拟 localStorage 不可用（隐私模式 / 配额超限 / 被禁用）；jsdom 下直接 spy 原型方法并抛错 */
function mockStorageThrow(method: 'getItem' | 'setItem' | 'removeItem') {
  return vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('QuotaExceededError')
  })
}

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('readStorage', () => {
    it('键不存在时返回 fallback', () => {
      expect(readStorage(KEY, { theme: 'auto' })).toEqual({ theme: 'auto' })
    })

    it('读取并反序列化已存储的对象', () => {
      localStorage.setItem(KEY, JSON.stringify({ theme: 'dark' }))

      expect(readStorage(KEY, {})).toEqual({ theme: 'dark' })
    })

    it('内容不是合法 JSON 时返回 fallback', () => {
      localStorage.setItem(KEY, '{ 坏数据')

      expect(readStorage(KEY, 'fallback')).toBe('fallback')
    })

    it('可以读取基本类型', () => {
      writeStorage(KEY, 42)

      expect(readStorage(KEY, 0)).toBe(42)
    })

    it('localStorage 不可用（getItem 抛错）时返回 fallback', () => {
      mockStorageThrow('getItem')

      expect(readStorage(KEY, 'fallback')).toBe('fallback')
    })
  })

  describe('writeStorage', () => {
    it('写入后可在 localStorage 中读到序列化结果', () => {
      writeStorage(KEY, { theme: 'black' })

      expect(localStorage.getItem(KEY)).toBe('{"theme":"black"}')
    })

    it('覆盖已有值', () => {
      writeStorage(KEY, 'a')
      writeStorage(KEY, 'b')

      expect(readStorage(KEY, '')).toBe('b')
    })

    it('setItem 抛错时静默失败，不向外抛异常', () => {
      mockStorageThrow('setItem')

      expect(() => writeStorage(KEY, 'x')).not.toThrow()
    })

    it('写入失败后读取返回 fallback（可选链风格的降级链路）', () => {
      mockStorageThrow('setItem')
      writeStorage(KEY, 'x')
      vi.restoreAllMocks()

      expect(readStorage(KEY, 'fallback')).toBe('fallback')
    })
  })

  describe('removeStorage', () => {
    it('删除已存在的键', () => {
      writeStorage(KEY, 'x')

      removeStorage(KEY)

      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('删除不存在的键不抛错', () => {
      expect(() => removeStorage('not:exists')).not.toThrow()
    })

    it('removeItem 抛错时静默失败', () => {
      mockStorageThrow('removeItem')

      expect(() => removeStorage(KEY)).not.toThrow()
    })
  })
})
