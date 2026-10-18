<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useNavigationIconLibraryStore } from './stores/navigation-icon-library.ts'
import WuMessage from './components/base/WuMessage.vue'
import { useMessageStore } from './stores/message.ts'

const icons = useNavigationIconLibraryStore()
const messageStore = useMessageStore()
onMounted(() => { void icons.refresh() })
useEventListener(window, 'focus', () => { void icons.refresh() })
</script>

<template>
  <RouterView />
  <WuMessage v-if="messageStore.message" :key="messageStore.sequence" :message="messageStore.message" :type="messageStore.tone === 'error' ? 'error' : 'info'" @close="messageStore.dismiss" />
</template>
