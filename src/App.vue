<script setup lang="ts">
import { computed } from 'vue'

import TabBar from './components/TabBar.vue'
import ToastHost from './components/ToastHost.vue'
import { useTheme } from './stores/theme'

/* 页签样式：贴边时内容只需避让页签本身，悬浮时还要加上页签四周的边距 */
const { tabBarLayout } = useTheme()

/* 与 TabBar 中的高度 / 边距保持同步：贴边约 76px，悬浮再多出上下各 12px 边距 */
const mainPadding = computed(() =>
  tabBarLayout.value === 'floating'
    ? 'calc(100px + env(safe-area-inset-bottom))'
    : 'calc(76px + env(safe-area-inset-bottom))',
)
</script>

<template>
  <div class="app-shell">
    <main class="app-main" :style="{ paddingBottom: mainPadding }">
      <RouterView />
    </main>

    <!-- 底部页签：所有视口宽度下统一使用 -->
    <TabBar />

    <!-- 全局提示宿主：订阅 lib/toast，挂在最后避免被内容遮挡 -->
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

/* 底部预留页签高度 + 安全区，避免内容被页签遮挡；具体值由脚本按样式计算 */
.app-main {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
