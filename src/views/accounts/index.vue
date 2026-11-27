<script setup lang="ts"></script>

<template>
  <div class="page">
    <h1 class="page-title">账户</h1>
    <p class="page-hint">总资产、总负债与净资产将在这里汇总展示。</p>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.page-hint {
  font-size: 14px;
  color: var(--color-text-muted);
}
</style>
