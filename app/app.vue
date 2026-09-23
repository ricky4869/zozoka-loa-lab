<script setup lang="ts">
import { tools } from '~/utils/tools'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'zh-Hant'
  }
})

const title = 'LOA Lab'
const description = '自用的 Lost Ark 小工具集合'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

const navItems = computed(() => [
  { label: '首頁', icon: 'i-lucide-house', to: '/' },
  ...tools.map(tool => ({ label: tool.title, icon: tool.icon, to: tool.to }))
])
</script>

<template>
  <UApp>
    <UDashboardGroup unit="rem">
      <UDashboardSidebar collapsible>
        <template #header="{ collapsed }">
          <NuxtLink
            to="/"
            class="focus-visible:outline-3 outline-primary/25 rounded-md p-1 -ms-1"
          >
            <AppLogo v-if="!collapsed" />
          </NuxtLink>
        </template>

        <UNavigationMenu
          :items="navItems"
          orientation="vertical"
          :ui="{ link: 'py-2.5' }"
        />

        <template #footer>
          <UColorModeButton />
        </template>
      </UDashboardSidebar>

      <UDashboardPanel>
        <template #header>
          <UDashboardNavbar :title="title" />
        </template>

        <template #body>
          <NuxtPage />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </UApp>
</template>
