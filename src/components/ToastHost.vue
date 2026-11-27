<script setup lang="ts">
import IconError from '~icons/material-symbols/error-outline-rounded'
import IconSuccess from '~icons/material-symbols/check-circle-outline-rounded'
import IconInfo from '~icons/material-symbols/info-outline-rounded'
import IconClose from '~icons/material-symbols/close-rounded'
import type { Component } from 'vue'
import { onUnmounted, ref } from 'vue'

import { onToast, type ToastItem, type ToastKind } from '../lib/toast'

/*
 * 提示条宿主：订阅 lib/toast 的事件流，把提示渲染成右上角的浮层。
 * 业务代码不直接引用本组件，只调用 notify.*，替换 UI 时无需改调用方。
 */

/** 同时展示的上限，超出时挤掉最早的，避免刷屏遮挡内容 */
const MAX_VISIBLE = 3

const items = ref<ToastItem[]>([])
const timers = new Map<number, number>()

const ICONS: Record<ToastKind, Component> = {
  error: IconError,
  success: IconSuccess,
  info: IconInfo,
}

/** 关闭一条提示并清理它的定时器 */
function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  items.value = items.value.filter((item) => item.id !== id)
}

/* 订阅提示事件，卸载时取消订阅，避免泄漏 */
const unsubscribe = onToast((item) => {
  items.value = [...items.value, item].slice(-MAX_VISIBLE)

  /* 错误需要读完，时长由 lib/toast 决定；duration 为 0 时保持常驻 */
  if (item.duration > 0) {
    timers.set(
      item.id,
      window.setTimeout(() => dismiss(item.id), item.duration),
    )
  }
})

onUnmounted(() => {
  unsubscribe()
  timers.forEach((timer) => window.clearTimeout(timer))
  timers.clear()
})
</script>

<template>
  <!-- aria-live 让读屏软件读出提示；错误用 assertive 立即打断朗读 -->
  <div class="toast-host" role="region" aria-label="通知">
    <TransitionGroup name="toast">
      <div
        v-for="item in items"
        :key="item.id"
        class="toast"
        :class="`is-${item.kind}`"
        :role="item.kind === 'error' ? 'alert' : 'status'"
        :aria-live="item.kind === 'error' ? 'assertive' : 'polite'"
      >
        <component :is="ICONS[item.kind]" class="toast-icon" aria-hidden="true" />
        <p class="toast-text">{{ item.message }}</p>
        <button
          type="button"
          class="toast-close"
          aria-label="关闭提示"
          @click="dismiss(item.id)"
        >
          <IconClose class="toast-close-icon" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  right: 12px;
  left: 12px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  /* 宿主本身不拦截点击，只有提示条可交互 */
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  max-width: 420px;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow:
    0 6px 24px rgb(0 0 0 / 0.16),
    0 0 0 1px rgb(0 0 0 / 0.02);
  pointer-events: auto;
}

.toast-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  margin-top: 1px;
}

.toast.is-error .toast-icon {
  color: var(--color-danger);
}

.toast.is-success .toast-icon {
  color: var(--color-success);
}

.toast.is-info .toast-icon {
  color: var(--color-accent);
}

.toast-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  /* 长文案允许换行，避免撑破容器 */
  overflow-wrap: break-word;
}

.toast-close {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  /* 触控热区 32px，与 44px 规范折中：视觉紧凑但周边有 gap 缓冲 */
  width: 32px;
  height: 32px;
  margin: -6px -6px -6px 0;
  border-radius: 8px;
  color: var(--color-text-muted);
}

.toast-close:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

.toast-close:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.toast-close-icon {
  width: 16px;
  height: 16px;
}

/* 入场 / 退场：轻微上浮 + 淡入，减少突兀感 */
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 退场时脱离文档流，避免剩余提示跳位 */
.toast-leave-active {
  position: absolute;
}

/* 宽屏提示条贴右上角，不再横贯整屏 */
@media (min-width: 900px) {
  .toast-host {
    left: auto;
    align-items: flex-end;
    max-width: 420px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
