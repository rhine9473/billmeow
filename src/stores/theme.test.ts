import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ACCENT_PRESETS, resetThemeStore, useTheme, type ThemeMode } from './theme'

const THEME_KEY = 'billmeow:settings'

/* 读取 localStorage 中持久化的主题设置 */
function storedSettings() {
  const raw = localStorage.getItem(THEME_KEY)
  return raw ? JSON.parse(raw) : null
}

/* 读取 <html> 上的 data-theme 属性 */
function dataTheme() {
  return document.documentElement.getAttribute('data-theme')
}

/* 读取 <meta name="theme-color"> 的当前值 */
function themeColor() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null
}

/*
 * 模拟系统深浅色偏好。
 * jsdom 未实现 matchMedia，这里直接注入一个最简替身。
 */
function mockPrefersDark(isDark: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? isDark : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  return () => {
    window.matchMedia = original
  }
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    /* useTheme 是模块级单例，必须重置，否则用例之间会共享上一次的状态与 watch */
    resetThemeStore()
    const root = document.documentElement
    root.removeAttribute('data-theme')
    root.classList.remove('theme-transition')
    root.style.removeProperty('--theme-transition-ms')
    root.style.removeProperty('--color-accent-light')
    root.style.removeProperty('--color-accent-dark')
  })

  /* 无论用例是否失败都还原计时器，避免污染后续用例 */
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetThemeStore()
  })

  describe('默认状态', () => {
    it('默认主题为 auto，切换动画默认开启 260ms', () => {
      const { theme, transition } = useTheme()
      expect(theme.value).toBe('auto')
      expect(transition.value).toEqual({ enabled: true, duration: 260 })
    })

    it('默认主题色为 indigo', () => {
      const { accent } = useTheme()
      expect(accent.value).toBe('indigo')
    })

    it('默认 auto 时不写入 data-theme，交给 prefers-color-scheme', () => {
      useTheme()
      expect(dataTheme()).toBeNull()
    })
  })

  describe('单例', () => {
    it('多次调用 useTheme 返回同一份状态', () => {
      const a = useTheme()
      const b = useTheme()

      expect(a).toBe(b)
      expect(a.theme).toBe(b.theme)
    })

    it('一处修改主题，另一处持有的引用同步变化', async () => {
      const a = useTheme()
      const b = useTheme()

      a.theme.value = 'dark'
      await nextTick()

      expect(b.theme.value).toBe('dark')
    })

    it('resetThemeStore 后重新初始化会读取最新的 localStorage', async () => {
      const first = useTheme()
      first.theme.value = 'black'
      await nextTick()
      expect(dataTheme()).toBe('black')

      resetThemeStore()
      localStorage.setItem(THEME_KEY, JSON.stringify({ theme: 'light' }))

      const second = useTheme()
      expect(second.theme.value).toBe('light')
      expect(dataTheme()).toBe('light')
    })
  })

  describe('主题色', () => {
    it('初始化时写入深浅两套 CSS 变量', () => {
      useTheme()
      const root = document.documentElement
      const indigo = ACCENT_PRESETS[0]
      expect(root.style.getPropertyValue('--color-accent-light')).toBe(indigo.light)
      expect(root.style.getPropertyValue('--color-accent-dark')).toBe(indigo.dark)
    })

    it('切换主题色后更新 CSS 变量', async () => {
      const { accent } = useTheme()
      const green = ACCENT_PRESETS.find((p) => p.value === 'green')!

      accent.value = 'green'
      await nextTick()

      const root = document.documentElement
      expect(root.style.getPropertyValue('--color-accent-light')).toBe(green.light)
      expect(root.style.getPropertyValue('--color-accent-dark')).toBe(green.dark)
    })

    it('非法色值回退到默认 indigo', async () => {
      const { accent } = useTheme()

      accent.value = 'not-a-color'
      await nextTick()

      expect(accent.value).toBe('indigo')
    })

    it('主题色会持久化', async () => {
      const { accent } = useTheme()

      accent.value = 'purple'
      await nextTick()

      expect(storedSettings()).toMatchObject({ accent: 'purple' })
    })

    it('启动时读取已保存的主题色', () => {
      localStorage.setItem(
        THEME_KEY,
        JSON.stringify({ theme: 'dark', accent: 'orange' }),
      )

      const { accent } = useTheme()

      expect(accent.value).toBe('orange')
    })
  })

  describe('applyTheme 行为', () => {
    it.each<[ThemeMode, string | null]>([
      ['auto', null],
      ['light', 'light'],
      ['dark', 'dark'],
      ['black', 'black'],
    ])('切换到 %s 时 data-theme 为 %s', async (mode, expected) => {
      const { theme } = useTheme()

      theme.value = mode
      await nextTick()

      expect(dataTheme()).toBe(expected)
    })

    it('从 dark 切回 auto 会移除 data-theme', async () => {
      const { theme } = useTheme()

      theme.value = 'dark'
      await nextTick()
      expect(dataTheme()).toBe('dark')

      theme.value = 'auto'
      await nextTick()
      expect(dataTheme()).toBeNull()
    })
  })

  describe('持久化', () => {
    it('切换主题后写入 localStorage', async () => {
      const { theme } = useTheme()

      theme.value = 'black'
      await nextTick()

      expect(storedSettings()).toEqual({
        theme: 'black',
        transition: { enabled: true, duration: 260 },
        accent: 'indigo',
      })
    })

    it('启动时读取 localStorage 中已保存的主题', () => {
      localStorage.setItem(THEME_KEY, JSON.stringify({ theme: 'dark' }))

      const { theme } = useTheme()

      expect(theme.value).toBe('dark')
      expect(dataTheme()).toBe('dark')
    })

    it('localStorage 内容损坏时回退到默认值', () => {
      localStorage.setItem(THEME_KEY, '{ 这不是合法 JSON')

      const { theme } = useTheme()

      expect(theme.value).toBe('auto')
    })

    it('旧版本数据缺少 theme 字段时补默认值', () => {
      localStorage.setItem(THEME_KEY, JSON.stringify({ nickname: '喵' }))

      const { theme, transition } = useTheme()

      expect(theme.value).toBe('auto')
      expect(transition.value).toEqual({ enabled: true, duration: 260 })
    })

    it('旧版本数据缺少 transition 字段时补默认值', () => {
      localStorage.setItem(THEME_KEY, JSON.stringify({ theme: 'dark' }))

      const { theme, transition } = useTheme()

      expect(theme.value).toBe('dark')
      expect(transition.value).toEqual({ enabled: true, duration: 260 })
    })

    it('transition 字段类型异常时回退默认值', () => {
      localStorage.setItem(
        THEME_KEY,
        JSON.stringify({ theme: 'dark', transition: { enabled: 'yes', duration: -5 } }),
      )

      const { transition } = useTheme()

      expect(transition.value).toEqual({ enabled: true, duration: 260 })
    })
  })

  describe('切换动画', () => {
    it('切换主题时临时挂上 theme-transition 类', async () => {
      const { theme } = useTheme()
      const root = document.documentElement

      expect(root.classList.contains('theme-transition')).toBe(false)

      theme.value = 'dark'
      await nextTick()

      expect(root.classList.contains('theme-transition')).toBe(true)
    })

    it('关闭动画时不挂 theme-transition 类', async () => {
      const { theme, transition } = useTheme()

      transition.value = { enabled: false, duration: 260 }
      await nextTick()

      theme.value = 'dark'
      await nextTick()

      expect(document.documentElement.classList.contains('theme-transition')).toBe(false)
    })

    it('时长写入 --theme-transition-ms 变量', async () => {
      const { theme, transition } = useTheme()

      transition.value = { enabled: true, duration: 400 }
      await nextTick()

      theme.value = 'dark'
      await nextTick()

      expect(document.documentElement.style.getPropertyValue('--theme-transition-ms')).toBe('400ms')
    })

    it('动画配置变化会持久化', async () => {
      const { transition } = useTheme()

      transition.value = { enabled: false, duration: 120 }
      await nextTick()

      expect(storedSettings()).toEqual({
        theme: 'auto',
        transition: { enabled: false, duration: 120 },
        accent: 'indigo',
      })
    })
  })

  describe('theme-color 同步', () => {
    it('白色主题写入浅色背景', async () => {
      const { theme } = useTheme()

      theme.value = 'light'
      await nextTick()

      expect(themeColor()).toBe('#f4f4f6')
    })

    it('暗色主题写入暗色背景', async () => {
      const { theme } = useTheme()

      theme.value = 'dark'
      await nextTick()

      expect(themeColor()).toBe('#1a1a1e')
    })

    it('纯黑主题写入纯黑背景', async () => {
      const { theme } = useTheme()

      theme.value = 'black'
      await nextTick()

      expect(themeColor()).toBe('#000000')
    })

    it('auto 模式在系统深色时使用暗色背景', () => {
      mockPrefersDark(true)

      useTheme()

      expect(themeColor()).toBe('#1a1a1e')
    })

    it('auto 模式在系统浅色时使用浅色背景', () => {
      mockPrefersDark(false)

      useTheme()

      expect(themeColor()).toBe('#f4f4f6')
    })

    it('切换主题色不影响 theme-color', async () => {
      const { theme, accent } = useTheme()

      theme.value = 'dark'
      await nextTick()
      expect(themeColor()).toBe('#1a1a1e')

      accent.value = 'green'
      await nextTick()

      expect(themeColor()).toBe('#1a1a1e')
    })

    it('缺少 meta 标签时会自动创建', async () => {
      document.head.querySelector('meta[name="theme-color"]')?.remove()

      const { theme } = useTheme()
      theme.value = 'black'
      await nextTick()

      expect(themeColor()).toBe('#000000')
    })
  })

  describe('resetTheme', () => {
    it('重置为默认主题与默认动画并同步 data-theme 与 localStorage', async () => {
      const { theme, transition, resetTheme } = useTheme()

      theme.value = 'black'
      transition.value = { enabled: false, duration: 120 }
      await nextTick()

      resetTheme()
      await nextTick()

      expect(theme.value).toBe('auto')
      expect(transition.value).toEqual({ enabled: true, duration: 260 })
      expect(dataTheme()).toBeNull()
      expect(storedSettings()).toEqual({
        theme: 'auto',
        transition: { enabled: true, duration: 260 },
        accent: 'indigo',
      })
    })

    it('同时重置主题色为默认 indigo', async () => {
      const { accent, resetTheme } = useTheme()

      accent.value = 'pink'
      await nextTick()
      expect(accent.value).toBe('pink')

      resetTheme()
      await nextTick()

      expect(accent.value).toBe('indigo')
    })
  })
})
