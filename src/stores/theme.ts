import { computed, reactive, watch } from 'vue'
import { readStorage, writeStorage } from '../lib/storage'

/** 主题模式：跟随系统 / 白色 / 暗色 / 纯黑 */
export type ThemeMode = 'auto' | 'light' | 'dark' | 'black'

/** 底部页签样式：贴边（默认，贴住屏幕底部） / 悬浮（四周留边距的独立圆角块） */
export type TabBarLayout = 'flush' | 'floating'

/** 主题切换过渡配置；duration 为 0 表示关闭动画 */
export interface ThemeTransition {
  enabled: boolean
  /** 过渡时长（毫秒） */
  duration: number
}

/** 预设主题色（强调色）色板 */
export interface AccentPreset {
  /** 唯一标识，同时作为持久化值 */
  value: string
  /** 展示名称 */
  label: string
  /** 浅色主题下的色值（较深，保证在浅底上的对比度） */
  light: string
  /** 深色主题下的色值（较浅，保证在深底上的对比度） */
  dark: string
}

/**
 * 8 种精选主题色。
 * 每个颜色准备深浅两套：浅色主题用较深的饱和色，深色/纯黑主题用中等饱和度的柔和色。
 *
 * 深色值在 Tailwind 400 档与低饱和灰调之间取折中：饱和度 37%–58%、亮度 49%–66%。
 * 既能一眼分辨出八种色系（不像 20% 饱和度那样发灰蒙），
 * 又不会像 300 档粉彩色那样在夜间大面积发光刺眼，
 * 在 #1a1a1e 暗底上对比度保持 ≥ 4.8:1。
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  { value: 'indigo', label: '靛蓝', light: '#4f46e5', dark: '#7f86d4' },
  { value: 'blue', label: '海蓝', light: '#2563eb', dark: '#6d97d8' },
  { value: 'cyan', label: '青色', light: '#0e7490', dark: '#4fa8b0' },
  { value: 'green', label: '翠绿', light: '#15803d', dark: '#4fac74' },
  { value: 'purple', label: '紫色', light: '#7e22ce', dark: '#a273cc' },
  { value: 'pink', label: '桃粉', light: '#be185d', dark: '#cc6fa4' },
  { value: 'orange', label: '橙黄', light: '#c2410c', dark: '#cc8a56' },
  { value: 'red', label: '绯红', light: '#b91c1c', dark: '#cc6b6b' },
]

/** 默认强调色（靛蓝），与 theme.scss 中的 :root 保持一致 */
const DEFAULT_ACCENT = 'indigo'

interface ThemeSettings {
  theme: ThemeMode
  transition: ThemeTransition
  accent: string
  tabBarLayout: TabBarLayout
}

const THEME_KEY = 'billmeow:settings'

/** 可选过渡时长（毫秒），设置页会渲染成选项 */
export const TRANSITION_DURATIONS = [120, 200, 260, 400] as const

const defaultSettings: ThemeSettings = {
  theme: 'auto',
  transition: { enabled: true, duration: 260 },
  accent: DEFAULT_ACCENT,
  /* 默认保持贴边样式，与历史版本视觉一致 */
  tabBarLayout: 'flush',
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
    accent: normalizeAccent(stored.accent),
    tabBarLayout: normalizeTabBarLayout(stored.tabBarLayout),
  }
}

/**
 * 校验页签样式，非法值回退默认贴边。
 * @param value 待校验的样式标识
 */
function normalizeTabBarLayout(value: unknown): TabBarLayout {
  return value === 'floating' || value === 'flush' ? value : defaultSettings.tabBarLayout
}

/**
 * 校验强调色标识，非法值回退默认色。
 * @param value 待校验的色板标识
 */
function normalizeAccent(value: unknown): string {
  return ACCENT_PRESETS.some((preset) => preset.value === value) ? (value as string) : DEFAULT_ACCENT
}

/**
 * 把强调色写入 `<html>` 的 CSS 变量。
 *
 * 同时写入深浅两套变量，由 theme.scss 按当前主题选用：
 * `--color-accent-light` 供浅色主题，`--color-accent-dark` 供深色 / 纯黑。
 * 这样切换主题时无需 JS 重新计算。
 *
 * @param accent 色板标识
 */
function applyAccent(accent: string) {
  const preset = ACCENT_PRESETS.find((item) => item.value === accent) ?? ACCENT_PRESETS[0]
  const root = document.documentElement
  root.style.setProperty('--color-accent-light', preset.light)
  root.style.setProperty('--color-accent-dark', preset.dark)
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
  applyAccent(state.accent)

  /* 任一字段变化都整体写回，避免多个 watch 各自拼装遗漏字段 */
  const persist = () =>
    writeStorage(THEME_KEY, {
      theme: state.theme,
      transition: state.transition,
      accent: state.accent,
      tabBarLayout: state.tabBarLayout,
    })

  watch(
    () => state.theme,
    (mode) => {
      runTransition(state.transition.enabled ? state.transition.duration : 0)
      applyTheme(mode)
      persist()
    },
  )

  watch(() => state.transition, persist, { deep: true })

  watch(
    () => state.accent,
    (accent) => {
      applyAccent(accent)
      persist()
    },
  )

  watch(() => state.tabBarLayout, persist)

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

  const accent = computed({
    get: () => state.accent,
    set: (value: string) => {
      state.accent = normalizeAccent(value)
    },
  })

  const tabBarLayout = computed({
    get: () => state.tabBarLayout,
    set: (value: TabBarLayout) => {
      state.tabBarLayout = normalizeTabBarLayout(value)
    },
  })

  function resetTheme() {
    state.theme = defaultSettings.theme
    state.transition = { ...defaultSettings.transition }
    state.accent = defaultSettings.accent
    state.tabBarLayout = defaultSettings.tabBarLayout
  }

  return {
    theme,
    transition,
    accent,
    tabBarLayout,
    resetTheme,
  }
}

/**
 * 获取主题状态（模块级单例）。
 *
 * 首次调用时读取本地存储、把主题应用到 `<html>` 并注册监听；
 * 之后的调用直接返回同一份引用，保证全局只有一份主题状态。
 *
 * @returns 包含 `theme`、`transition`、`accent`、`tabBarLayout` 可读写 ref 与 `resetTheme()` 方法
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
