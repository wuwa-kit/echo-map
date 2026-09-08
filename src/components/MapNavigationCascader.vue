<script setup lang="ts">
import { computed } from 'vue'
import { useExplorerStore } from '../stores/explorer.ts'
import WuCascader from './base/WuCascader.vue'
import { mapNavigationOptions } from './map-navigation-options.ts'

defineOptions({ inheritAttrs: false })

const store = useExplorerStore()
const options = computed(() => store.dataset ? mapNavigationOptions(store.dataset) : [])
</script>

<template>
  <WuCascader
    v-bind="$attrs" :options="options" placeholder="切换地图" root-label="全部地图"
    :show-header="false" :show-path="false"
    @select="store.navigateToRegion"
  />
</template>
