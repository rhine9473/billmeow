import { computed, reactive, watch } from 'vue'
import { readStorage, writeStorage } from '../lib/storage'

/** 主题模式：跟随系统 / 白色 / 暗色 / 纯黑 */
export type ThemeMode = 'auto' | 'light' | 'dark' | 'black'

/** 主题切换过渡配置；duration 为 0 表示关闭动画 */
export interface ThemeTransition {
  enabled: boolean
  /** 过渡时长（毫秒） */
  duration: number
}

interface ThemeSettings {
  theme: ThemeMode
  transition: ThemeTransition
}

const THEME_KEY = 'billmeow:settings'

/** 可选过渡时长（毫秒），设置页会渲染成选项 */
export const TRANSITION_DURATIONS = [120, 200, 260, 400] as const

const defaultSettings: ThemeSettings = {
  theme: 'auto',
  transition: { enabled: true, duration: 260 },
}

/** 过渡结束后移除的类名，与 theme.scss 中保持一致 */
const TRANSITION_CLASS = 'theme-transition'

function normalizeTransition(value: unknown): ThemeTransition {
  if (typeof value !== 'object' || value === null) return { ...defaultSettings.transition }
  const item = value as Partial<ThemeTransition>
  return {
    enabled: typeof item.enabled === 'boolean' ? item.enabled : defaultSettings.transition.enabled,
    duration:
      typeof item.duration === 'number' && item.duration >= 0
        ? item.duration
        : defaultSettings.transition.duration,
  }
}

function loadSettings(): ThemeSettings {
  const stored = readStorage<Partial<ThemeSettings>>(THEME_KEY, {})
  return {
    theme: stored.theme ?? defaultSettings.theme,
    transition: normalizeTransition(stored.transition),
  }
}

/**
 * 把主题应用到 <html>：
 * auto 时移除 data-theme，交给 CSS 的 prefers-color-scheme 决定；
 * 其余模式写入同名属性，由 theme.scss 中对应的选择器接管。
 */
function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'auto') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

let transitionTimer: number | undefined

/**
 * 切换主题时临时挂上过渡类，动画结束后移除。
 * @param duration 过渡时长（ms），<=0 表示不做动画
 */
function runTransition(duration: number) {
  if (typeof window === 'undefined') return

  const root = document.documentElement

  /* 系统要求减少动效时直接跳过（CSS 里也有兜底） */
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  window.clearTimeout(transitionTimer)
  if (duration <= 0) {
    root.classList.remove(TRANSITION_CLASS)
    return
  }
  root.style.setProperty('--theme-transition-ms', `${duration}ms`)
  root.classList.add(TRANSITION_CLASS)

  /* 略长于过渡时长，确保动画播完再移除，避免过渡被截断 */
  transitionTimer = window.setTimeout(() => {
    root.classList.remove(TRANSITION_CLASS)
  }, duration + 50)
}

/**
 * 主题状态（模块级单例，不依赖 Pinia）
 *
 * 为什么用单例：主题是全局唯一状态，若每次调用 useTheme() 都新建一份 reactive，
 * 会出现多个互相竞争的 watch —— 各自读写同一份 localStorage、同一个 <html> 属性，
 * 且某个组件改的主题不会反映到另一个组件持有的状态上。
 *
 * 首次调用时初始化（读存储 + 应用主题 + 注册 watch），之后只返回同一份引用。
 */
let instance: ReturnType<typeof createThemeStore> | undefined

function createThemeStore() {
  const state = reactive<ThemeSettings>(loadSettings())

  applyTheme(state.theme)

  watch(
    () => state.theme,
    (mode) => {
      runTransition(state.transition.enabled ? state.transition.duration : 0)
      applyTheme(mode)
      writeStorage(THEME_KEY, { theme: mode, transition: state.transition })
    },
  )

  watch(
    () => state.transition,
    (transition) => writeStorage(THEME_KEY, { theme: state.theme, transition }),
    { deep: true },
  )

  const theme = computed({
    get: () => state.theme,
    set: (mode: ThemeMode) => {
      state.theme = mode
    },
  })

  const transition = computed({
    get: () => state.transition,
    set: (value: ThemeTransition) => {
      state.transition = normalizeTransition(value)
    },
  })

  function resetTheme() {
    state.theme = defaultSettings.theme
    state.transition = { ...defaultSettings.transition }
  }

  return {
    theme,
    transition,
    resetTheme,
  }
}

/**
 * 获取主题状态（模块级单例）。
 *
 * 首次调用时读取本地存储、把主题应用到 `<html>` 并注册监听；
 * 之后的调用直接返回同一份引用，保证全局只有一份主题状态。
 *
 * @returns 包含 `theme`、`transition` 两个可读写 ref 与 `resetTheme()` 方法
 * @example
 * const { theme } = useTheme()
 * theme.value = 'dark'
 */
export function useTheme() {
  instance ??= createThemeStore()
  return instance
}

/**
 * 重置单例（仅供测试使用）。
 * 测试需要在用例之间隔离状态时调用，业务代码不要使用。
 */
export function resetThemeStore() {
  instance = undefined
}
