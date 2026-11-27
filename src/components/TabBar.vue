<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useRoute, useRouter } from 'vue-router'

import { NAV_ITEMS as tabs } from '../router/nav'
import { useTheme } from '../stores/theme'

const route = useRoute()
const router = useRouter()

/* 页签样式由设置页决定：贴边 / 悬浮 */
const { tabBarLayout } = useTheme()

/* 用户点了哪个页签：弱网下 chunk 还在下载，地址栏已变但组件未挂载，
   用它先点亮页签 + 转圈，避免「点了没反应」的卡滞观感 */
const pendingName = ref<string>()

/* 当前生效的页签：优先用待跳转目标，否则用当前路由 */
const activeName = computed(() => pendingName.value ?? (route.name as string | undefined))

/* 路由真正切换完成后清掉 pending；切换失败（懒加载报错等）同样清掉，
   否则转圈会永远停不下来 */
watch(
  () => route.fullPath,
  () => {
    pendingName.value = undefined
  },
)

router.afterEach(() => {
  pendingName.value = undefined
})

router.onError(() => {
  pendingName.value = undefined
})

function handleClick(name: string) {
  /* 点击当前页签不进入 pending，避免重复转圈 */
  if (name === route.name) return
  pendingName.value = name
}
</script>

<template>
  <nav
    class="tab-bar"
    :class="tabBarLayout === 'floating' ? 'is-floating' : 'is-flush'"
    aria-label="主导航"
  >
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="{ name: tab.name }"
      class="tab"
      :class="{ 'is-primary': tab.primary, 'is-active': activeName === tab.name }"
      :aria-current="activeName === tab.name ? 'page' : undefined"
      :aria-busy="pendingName === tab.name || undefined"
      @click="handleClick(tab.name)"
    >
      <!-- 记一笔：激活时不在图标下方显示文字，改用上方浮层气泡提示 -->
      <span v-if="tab.primary" class="tab-toast" aria-hidden="true">{{ tab.label }}</span>
      <component :is="tab.icon" class="tab-icon" aria-hidden="true" />
      <span v-if="!tab.primary" class="tab-label">{{ tab.label }}</span>
      <!-- 弱网下页面 chunk 尚未下载完成时，在图标旁显示转圈 -->
      <span v-if="pendingName === tab.name" class="tab-spinner" aria-hidden="true" />
    </RouterLink>
  </nav>
</template>

<style scoped>
/* 底部页签基础：固定在视口底部，等宽五等分 */
.tab-bar {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  gap: 4px;
  background: var(--color-surface);
  /* 两种样式共用的过渡，切换时不会突跳 */
  transition:
    bottom 200ms ease,
    inset-inline 200ms ease,
    padding 200ms ease,
    border-radius 200ms ease,
    box-shadow 200ms ease;
}

/* 贴边样式：横贯整屏，仅顶部一条分隔线，兼顾底部安全区 */
.tab-bar.is-flush {
  padding: 10px 8px calc(10px + env(safe-area-inset-bottom));
  border-radius: 0;
  border-top: 1px solid var(--color-border);
  box-shadow: none;
}

/*
 * 悬浮样式：四周留出边距的独立胶囊条。
 * 999px 圆角在整条宽度上退化为两端半圆（半径 = 高度一半），
 * 因此无论页签高度怎么变都保持胶囊形；用阴影与背景分离，
 * 底边距叠加安全区避免被手势条遮挡。
 */
.tab-bar.is-floating {
  inset-inline: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  padding: 8px 8px;
  border-radius: 999px;
  border-top: none;
  box-shadow:
    0 4px 16px rgb(0 0 0 / 0.12),
    0 0 0 1px var(--color-border);
}

@media (prefers-reduced-motion: reduce) {
  .tab-bar {
    transition: none;
  }
}

.tab {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  /* 触控热区不小于 44×44px，这里给到 56px 让整条更舒展 */
  min-height: 56px;
  min-width: 0;
  border-radius: 12px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 160ms ease;
}

.tab:hover {
  color: var(--color-text);
}

.tab.is-active {
  color: var(--color-accent);
}

.tab-icon {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}

/* 文字默认收起：只占位不显示，激活后才在图标下方展开 */
.tab-label {
  /* 收起时高度为 0，避免为文字预留空白 */
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  transition:
    max-height 200ms ease,
    opacity 200ms ease;
}

.tab.is-active .tab-label {
  max-height: 16px;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .tab-label {
    transition: none;
  }
}

/* 记一笔：中间的强调页签，用主题色实心圆突出 */
.tab.is-primary {
  position: relative;
}

.tab.is-primary .tab-icon {
  width: 32px;
  height: 32px;
  padding: 4px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-surface);
  box-sizing: content-box;
}

.tab.is-primary.is-active .tab-icon {
  color: var(--color-surface);
}

/* 记一笔激活时的上方气泡：默认隐藏且不可点击，激活后向上浮出 */
.tab.is-primary .tab-toast {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-surface);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

/* 气泡下方的小尖角，指向图标 */
.tab.is-primary .tab-toast::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  border: 5px solid transparent;
  border-top-color: var(--color-accent);
  transform: translateX(-50%);
}

.tab.is-primary.is-active .tab-toast {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* 弱网等待中的转圈：贴在图标右下角，不改变页签尺寸，避免布局跳动 */
.tab-spinner {
  position: absolute;
  top: 2px;
  right: calc(50% - 20px);
  width: 10px;
  height: 10px;
  border: 2px solid var(--color-accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: tab-spin 700ms linear infinite;
}

/* 只有主图标所在的页签需要定位容器，其余页签同样支持 spinner */
.tab {
  position: relative;
}

@keyframes tab-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab.is-primary .tab-toast {
    transition: none;
  }

  /* 减少动效：用脉动代替旋转，避免持续动画引发不适 */
  .tab-spinner {
    animation: none;
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab {
    transition: none;
  }
}
</style>
