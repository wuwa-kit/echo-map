<script setup lang="ts">
import { computed } from 'vue'
import { useExplorerStore } from '../stores/explorer.ts'
import WuCascader from './base/WuCascader.vue'
import { mapNavigationOptions, mapNavigationSectionAtCenter } from './map-navigation-options.ts'

defineOptions({ inheritAttrs: false })

const store = useExplorerStore()
const options = computed(() => store.dataset ? mapNavigationOptions(store.dataset) : [])
const currentRegionName = computed(() => {
  const dataset = store.dataset
  const state = store.activeState
  if (!dataset || !state) return '切换地图'
  const [left, bottom, right, top] = state.tileExtent.extent
  const center: readonly [number, number] = store.mapViewport?.center
    ?? [(left + right) / 2, (bottom + top) / 2]
  return mapNavigationSectionAtCenter(dataset, state.id, center) ?? '切换地图'
})
</script>

<template>
  <WuCascader
    v-bind="$attrs" :options="options" :placeholder="currentRegionName" root-label="全部地图"
    :show-header="false" :show-path="false" :popover-gap="4" :popover-viewport-margin="8" compact
    @select="store.navigateToRegion"
  />
</template>
