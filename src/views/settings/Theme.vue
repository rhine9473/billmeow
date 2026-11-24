<script setup lang="ts">
import IconAuto from '~icons/material-symbols/brightness-auto'
import IconBlack from '~icons/material-symbols/circle'
import IconCheck from '~icons/material-symbols/check'
import IconDark from '~icons/material-symbols/dark-mode'
import IconLight from '~icons/material-symbols/light-mode'

import type { Component } from 'vue'
import { TRANSITION_DURATIONS, useTheme, type ThemeMode } from '../../stores/theme'

const { theme, transition } = useTheme()

interface ModeOption {
  value: ThemeMode
  label: string
  icon: Component
  /** 预览区页面底色；'split' 表示跟随系统的对角双色 */
  bg: string
  /** 预览区卡片底色 */
  surface: string
  /** 预览区文字线条颜色 */
  text: string
}

/** 四种主题模式；bg/surface/text 用于卡片内的配色预览 */
const modes: ModeOption[] = [
  { value: 'auto', label: '跟随系统', icon: IconAuto, bg: 'split', surface: '', text: '' },
  {
    value: 'light',
    label: '白色',
    icon: IconLight,
    bg: '#f4f4f6',
    surface: '#ffffff',
    text: '#1c1c21',
  },
  { value: 'dark', label: '暗色', icon: IconDark, bg: '#1a1a1e', surface: '#232327', text: '#ededf1' },
  { value: 'black', label: '纯黑', icon: IconBlack, bg: '#000000', surface: '#0a0a0c', text: '#f5f5f7' },
]
</script>

<template>
  <section class="theme-section">
    <h2 class="section-title">外观主题</h2>

    <div class="theme-grid" role="radiogroup" aria-label="外观主题">
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
        <!-- 预览：用小色块直观展示每种模式的页面底色 / 卡片色 / 文字色 -->
        <span
          class="theme-preview"
          :class="{ 'is-split': mode.bg === 'split' }"
          :style="mode.bg === 'split' ? undefined : { background: mode.bg }"
        >
          <span
            class="theme-preview-card"
            :style="mode.bg === 'split' ? undefined : { background: mode.surface }"
          >
            <span
              class="theme-preview-line"
              :style="mode.bg === 'split' ? undefined : { background: mode.text }"
            />
            <span
              class="theme-preview-line short"
              :style="mode.bg === 'split' ? undefined : { background: mode.text }"
            />
          </span>
        </span>

        <span class="theme-name">
          <component :is="mode.icon" class="theme-icon" aria-hidden="true" />
          {{ mode.label }}
        </span>

        <IconCheck
          v-if="theme === mode.value"
          class="theme-check"
          aria-hidden="true"
        />
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
.section-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

/* 动画设置行 */
.transition-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
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

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 2px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  transition: border-color 0.15s;
}

.theme-card:hover,
.theme-card.is-active {
  border-color: var(--color-accent);
}

/* 预览区：模拟「页面 + 卡片」的缩小版 */
.theme-preview {
  display: block;
  padding: 8px;
  border-radius: 8px;
}

/* 跟随系统：对角分割，左浅右深，直观表达「浅色/深色都跟随」 */
.theme-preview.is-split {
  background: linear-gradient(135deg, #f4f4f6 50%, #1a1a1e 50%);
}

.theme-preview-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border-radius: 5px;
}

.theme-preview.is-split .theme-preview-card {
  background: linear-gradient(135deg, #ffffff 50%, #232327 50%);
}

.theme-preview-line {
  display: block;
  width: 70%;
  height: 3px;
  border-radius: 999px;
}

.theme-preview-line.short {
  width: 45%;
  opacity: 0.45;
}

.theme-preview.is-split .theme-preview-line {
  background: #85858d;
}

.theme-preview.is-split .theme-preview-line.short {
  background: #66666e;
}

.theme-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.theme-icon {
  width: 16px;
  height: 16px;
  color: var(--color-text-muted);
}

.theme-card.is-active .theme-icon {
  color: var(--color-accent);
}

.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 14px;
  height: 14px;
  padding: 2px;
  box-sizing: content-box;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
}
</style>
