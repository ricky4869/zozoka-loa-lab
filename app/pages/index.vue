<script setup lang="ts">
import { tools } from '~/utils/tools'
</script>

<template>
  <div>
    <UPageHero
      title="LOA Lab"
      description="自用的 Lost Ark 小工具集合。各項功能頁面之後再逐一新增。"
    />

    <UContainer class="pb-12">
      <div class="grid gap-4 sm:grid-cols-2">
        <UPageCard
          v-for="tool in tools"
          :key="tool.to"
          :title="tool.title"
          :description="tool.description"
          :icon="tool.icon"
          :to="tool.to"
        />
      </div>
    </UContainer>
  </div>
</template>
