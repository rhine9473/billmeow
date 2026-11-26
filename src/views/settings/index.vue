<script setup lang="ts">
import Theme from './Theme.vue'
</script>

<template>
  <div class="settings-page">
    <h1 class="page-title">设置</h1>
    <!-- 主题模式 -->
    <Theme />
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  padding: 24px 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}
</style>
