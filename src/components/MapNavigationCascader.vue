<script setup lang="ts">
import { computed } from 'vue'
import type { MapDataset } from '../domain/types.ts'
import WuCascader from './base/WuCascader.vue'
import { mapNavigationOptions, mapNavigationSectionAtCenter } from './map-navigation-options.ts'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  dataset: MapDataset
  stateId: number
  center: readonly [number, number] | null
}>()
const emit = defineEmits<{
  regionSelected: [id: string]
}>()
const options = computed(() => mapNavigationOptions(props.dataset))
const currentRegionName = computed(() => {
  const state = props.dataset.states.find(({ id }) => id === props.stateId)
  if (!state) return '切换地图'
  const [left, bottom, right, top] = state.tileExtent.extent
  const center: readonly [number, number] = props.center
    ?? [(left + right) / 2, (bottom + top) / 2]
  return mapNavigationSectionAtCenter(props.dataset, state.id, center) ?? '切换地图'
})
</script>

<template>
  <WuCascader
    v-bind="$attrs" :options="options" :placeholder="currentRegionName" root-label="全部地图"
    :show-header="false" :show-path="false" :popover-gap="4" :popover-viewport-margin="8" compact
    @select="emit('regionSelected', $event)"
  />
</template>
