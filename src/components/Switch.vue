<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * 开关（Switch）组件属性。
 *
 * 语义上等价于 `<input type="checkbox" role="switch">`，但用按钮 + 滑轨实现，
 * 便于完全控制视觉。支持 `v-model` 双向绑定、禁用与无障碍属性。
 */
interface Props {
  /** 当前是否开启（支持 `v-model`） */
  modelValue?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 可选的标签文字；不传则由调用方自行渲染外部 label */
  label?: string
  /** 无障碍名称；无可见标签时必须提供 */
  ariaLabel?: string
  /** 用于关联外部 `<label for>` 的 id；不传则自动生成 */
  id?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
  label: undefined,
  ariaLabel: undefined,
  id: undefined,
})

const emit = defineEmits<{
  /** 开关状态变化时触发，`v-model` 依赖此事件 */
  (e: 'update:modelValue', value: boolean): void
}>()

const autoId = useId()
const switchId = computed(() => props.id ?? autoId)

/* 禁用时不响应点击，避免「看起来能点但没反应」的困惑 */
function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    :id="switchId"
    type="button"
    role="switch"
    class="switch"
    :class="{ 'is-on': modelValue, 'is-disabled': disabled }"
    :aria-checked="modelValue"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="switch-track" aria-hidden="true">
      <span class="switch-thumb" />
    </span>
    <span v-if="label" class="switch-label">{{ label }}</span>
  </button>
</template>

<style scoped>
/*
 * 开关尺寸：轨道 40×22px，滑块 16px。
 * 触控热区通过 padding 撑到 44px 高，满足 DESIGN.md 第 5 节的移动端要求。
 */
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  /* 纵向撑高触控热区，横向不额外扩，避免撑宽布局 */
  padding: 11px 0;
  min-height: 44px;
  color: var(--color-text);
  font-size: 13px;
  text-align: left;
}

.switch:disabled,
.switch.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.switch-track {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-border);
  transition: background-color 200ms ease;
}

.switch.is-on .switch-track {
  background: var(--color-accent);
}

/* 滑块：关闭时靠左，开启时右移 18px（轨道 40 - 滑块 16 - 两侧内边距 6） */
.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.24);
  transition: transform 200ms ease;
}

.switch.is-on .switch-thumb {
  transform: translateX(18px);
}

.switch-label {
  line-height: 1.2;
}

/* 键盘聚焦时给出可见焦点环，鼠标点击不显示 */
.switch:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .switch-track,
  .switch-thumb {
    transition: none;
  }
}
</style>
