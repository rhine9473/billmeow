<script setup lang="ts">
import IconCheck from '~icons/material-symbols/check'
import IconPalette from '~icons/material-symbols/palette'

import { TRANSITION_DURATIONS, useTheme, type ThemeMode } from '../../stores/theme'

const { theme, transition } = useTheme()

interface HalfColors {
  /** 页面底色 */
  bg: string
  /** 预览框描边色 */
  border: string
  /** 卡片底色 */
  surface: string
  /** 卡片内条纹色 */
  line: string
  /** 顶部标签条颜色（该主题的强调色） */
  accent: string
}

interface ModeOption {
  value: ThemeMode
  label: string
  /** 左半区配色 */
  left: HalfColors
  /** 右半区配色；为空表示整张卡片统一使用 left */
  right?: HalfColors
}

/*
 * 四种主题各自的固定配色（不引用 CSS 变量）。
 * 预览必须展示「该主题本身」的颜色，若用 var(--color-*) 会变成当前主题的色值。
 * 与 theme.scss 中的 token 保持一致；「跟随系统」左右各用浅色/暗色。
 */
const LIGHT: HalfColors = {
  bg: '#f4f4f6',
  border: '#e3e3e8',
  surface: '#ffffff',
  line: '#dcdce2',
  accent: '#4f46e5',
}

const DARK: HalfColors = {
  bg: '#1a1a1e',
  border: '#333339',
  surface: '#232327',
  line: '#4a4a52',
  accent: '#a5b4fc',
}

const BLACK: HalfColors = {
  bg: '#000000',
  border: '#2a2a30',
  surface: '#0a0a0c',
  line: '#2f2f36',
  accent: '#a5b4fc',
}

const modes: ModeOption[] = [
  { value: 'auto', label: '跟随系统', left: LIGHT, right: DARK },
  { value: 'light', label: '白色', left: LIGHT },
  { value: 'dark', label: '暗色', left: DARK },
  { value: 'black', label: '纯黑', left: BLACK },
]
</script>

<template>
  <section class="theme-section">
    <h2 class="section-title">
      <IconPalette class="title-icon" aria-hidden="true" />
      主题模式
    </h2>

    <div class="theme-grid" role="radiogroup" aria-label="主题模式">
      <button
        v-for="mode in modes"
        :key="mode.value"
        type="button"
        role="radio"
        class="theme-card"
        :class="{ 'is-active': theme === mode.value }"
        :aria-checked="theme === mode.value"
        :aria-label="mode.label"
        @click="theme = mode.value"
      >
        <!--
          预览：手机屏幕形状。
          始终渲染「左半区」，有 right 配置时再渲染「右半区」，
          因此「跟随系统」天然是左右双色，其余模式右半区不渲染、左半区铺满。
        -->
        <span class="preview" :style="{ borderColor: mode.left.border }">
          <!-- 左半区 -->
          <span
            class="preview-half"
            :style="{
              background: mode.left.bg,
              borderRightColor: mode.right ? mode.right.border : undefined,
            }"
          >
            <span class="preview-tag" :style="{ background: mode.left.accent }" />

            <span class="preview-block" :style="{ background: mode.left.surface }">
              <span class="preview-line" :style="{ background: mode.left.line }" />
              <span class="preview-line short" :style="{ background: mode.left.line }" />
            </span>
            <span class="preview-block" :style="{ background: mode.left.surface }">
              <span class="preview-line" :style="{ background: mode.left.line }" />
              <span class="preview-line short" :style="{ background: mode.left.line }" />
            </span>
          </span>

          <!-- 右半区：仅「跟随系统」有 -->
          <span
            v-if="mode.right"
            class="preview-half"
            :style="{ background: mode.right.bg }"
          >
            <span class="preview-tag" :style="{ background: mode.left.accent }" />

            <span class="preview-block" :style="{ background: mode.right.surface }">
              <span class="preview-line" :style="{ background: mode.right.line }" />
              <span class="preview-line short" :style="{ background: mode.right.line }" />
            </span>

            <span class="preview-block" :style="{ background: mode.right.surface }">
              <span class="preview-line" :style="{ background: mode.right.line }" />
              <span class="preview-line short" :style="{ background: mode.right.line }" />
            </span>
          </span>

          <IconCheck
            v-if="theme === mode.value"
            class="preview-check"
            aria-hidden="true"
          />
        </span>

        <span class="theme-name">{{ mode.label }}</span>
      </button>
    </div>

    <!-- 切换动画设置：可开关、可调时长，方便低性能设备 -->
    <div class="transition-row">
      <label class="transition-toggle">
        <input v-model="transition.enabled" type="checkbox" class="transition-checkbox" />
        <span>切换动画</span>
      </label>

      <label class="transition-duration">
        <span class="transition-label">时长</span>
        <select v-model.number="transition.duration" :disabled="!transition.enabled">
          <option v-for="ms in TRANSITION_DURATIONS" :key="ms" :value="ms">{{ ms }} ms</option>
        </select>
      </label>
    </div>
  </section>
</template>

<style scoped>
.theme-section {
  display: flex;
  flex-direction: column;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.title-icon {
  width: 28px;
  height: 28px;
  color: var(--color-text-muted);
}

.theme-grid {
  display: grid;
  /* 固定 4 列，窄屏也保持一行；列宽随容器自动收缩 */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(6px, 2vw, 16px);
}

/* 卡片本身：无边框，选中时由预览区描边体现 */
.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(6px, 1.5vw, 12px);
  min-width: 0;
  padding: 0;
  background: none;
  color: var(--color-text);
}

/* 预览：手机屏幕形状，内部横向排列左右半区 */
.preview {
  position: relative;
  display: flex;
  width: 100%;
  aspect-ratio: 3 / 4;
  border: 2px solid #e3e3e8;
  border-radius: clamp(8px, 2.5vw, 16px);
  overflow: hidden;
  transition: border-color 0.15s;
}

.theme-card:hover .preview {
  border-color: var(--color-text-muted);
}

.theme-card.is-active .preview {
  border-color: var(--color-accent);
}

/*
 * 半区：纵向排列标签条与两张内容卡片。
 * 只有一个半区时（非跟随系统）自动占满整宽；
 * 左右两个时各占 50%，产生「左浅右深」的分割。
 */
.preview-half {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: clamp(4px, 1.2vw, 8px);
  min-width: 0;
  padding: clamp(6px, 2vw, 14px) clamp(5px, 1.6vw, 12px);
}

/* 左右分界：仅在存在右半区时生效 */
.preview-half + .preview-half {
  border-left: 1px solid;
}

/* 顶部强调标签条 */
.preview-tag {
  display: block;
  width: 50%;
  height: clamp(5px, 1.4vw, 8px);
  border-radius: 999px;
}

/* 内容卡片 */
.preview-block {
  display: flex;
  flex-direction: column;
  gap: clamp(3px, 1vw, 6px);
  padding: clamp(5px, 1.6vw, 10px);
  border-radius: clamp(5px, 1.6vw, 10px);
}

.preview-line {
  display: block;
  width: 100%;
  height: clamp(3px, 1vw, 6px);
  border-radius: 999px;
}

.preview-line.short {
  width: 60%;
}

/*
 * 跟随系统：左右半区紧贴中线，各自内侧不留空隙、内容块内圆角拉直，
 * 使两个半区视觉上拼成一整块。
 * 注意：preview-tag 是独立的小圆角标签条，不参与该处理。
 */
.preview-half:has(+ .preview-half) {
  padding-right: 0;
}

.preview-half + .preview-half {
  padding-left: 0;
}

/* 左半区：内容块右侧贴边并去掉右圆角 */
.preview-half:has(+ .preview-half) .preview-block {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

/* 右半区：内容块左侧贴边并去掉左圆角 */
.preview-half + .preview-half .preview-block {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

/* 选中徽章：右下角圆形对勾 */
.preview-check {
  position: absolute;
  right: clamp(4px, 1.2vw, 8px);
  bottom: clamp(4px, 1.2vw, 8px);
  width: clamp(14px, 4vw, 24px);
  height: clamp(14px, 4vw, 24px);
  padding: clamp(2px, 0.8vw, 4px);
  box-sizing: content-box;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
}

.theme-name {
  font-size: clamp(11px, 3vw, 15px);
  font-weight: 600;
  white-space: nowrap;
}

.theme-card.is-active .theme-name {
  color: var(--color-accent);
}

/* 动画设置行 */
.transition-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  font-size: 13px;
}

.transition-toggle,
.transition-duration {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text);
}

.transition-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.transition-label {
  color: var(--color-text-muted);
}

.transition-duration select {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.transition-duration select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
