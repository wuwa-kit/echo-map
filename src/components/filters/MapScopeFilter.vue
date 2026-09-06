<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuOption from '../base/WuOption.vue'
import WuSelect from '../base/WuSelect.vue'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { activeMapName, floors, selectedLevelId } = storeToRefs(store)

function onLevelChange(value: string | number | null): void {
  store.selectLevel(value === null ? null : String(value))
}
</script>

<template>
  <div class="border-b border-[var(--line)] p-18px">
    <div class="mb-12px flex items-center justify-between gap-12px">
      <span class="text-12px text-[var(--muted)]">当前底图</span>
      <span class="text-14px text-[#dce9e3]">{{ activeMapName }}</span>
    </div>
    <label class="mb-6px block text-14px text-[var(--muted)]" for="level-select">楼层显示</label>
    <WuSelect :native="compact" id="level-select" :model-value="selectedLevelId" @update:model-value="onLevelChange">
      <WuOption :value="null">主地图 / 地表</WuOption>
      <WuOption v-for="floor in floors" :key="floor.id" :value="floor.id">{{ floor.name }}</WuOption>
    </WuSelect>
  </div>
</template>
