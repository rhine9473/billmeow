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
  /* 失败路径会调用 console.error 与 alert，这里统一 mock，避免测试噪音与阻塞 */
  let errorSpy: ReturnType<typeof vi.spyOn>
  let alertSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
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

    it('读取失败时记录错误日志，便于排查', () => {
      mockStorageThrow('getItem')

      readStorage(KEY, 'fallback')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[storage] 读取'),
        expect.any(Error),
      )
    })

    it('内容不是合法 JSON 时也记录错误日志', () => {
      localStorage.setItem(KEY, '{ 坏数据')

      readStorage(KEY, 'fallback')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[storage] 读取'),
        expect.any(Error),
      )
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

    it('setItem 抛错时不向外抛异常，并返回 false', () => {
      mockStorageThrow('setItem')

      expect(() => writeStorage(KEY, 'x')).not.toThrow()
      expect(writeStorage(KEY, 'x')).toBe(false)
    })

    it('写入成功时返回 true', () => {
      expect(writeStorage(KEY, 'x')).toBe(true)
    })

    it('写入失败时记录错误日志并 alert 提示用户', () => {
      mockStorageThrow('setItem')

      writeStorage(KEY, 'x')

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[storage] 写入'),
        expect.any(Error),
      )
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('设置保存失败'))
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

    it('removeItem 抛错时不向外抛异常，并记录日志与提示用户', () => {
      mockStorageThrow('removeItem')

      expect(() => removeStorage(KEY)).not.toThrow()
      expect(removeStorage(KEY)).toBe(false)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[storage] 删除'),
        expect.any(Error),
      )
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('数据清除失败'))
    })

    it('删除成功时返回 true', () => {
      writeStorage(KEY, 'x')

      expect(removeStorage(KEY)).toBe(true)
    })
  })
})
