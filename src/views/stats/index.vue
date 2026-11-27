<script setup lang="ts"></script>

<template>
  <div class="page">
    <h1 class="page-title">统计</h1>
    <p class="page-hint">近几个月的收支趋势与分类占比将在这里呈现。</p>
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
