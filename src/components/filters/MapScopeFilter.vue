<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuOption from '../base/WuOption.vue'
import WuSelect from '../base/WuSelect.vue'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { floors, regions, selectedCountryId, selectedLevelId, selectedStateId, states } = storeToRefs(store)

function onStateChange(value: string | number | null): void {
  store.selectState(Number(value))
}

function onCountryChange(value: string | number | null): void {
  store.selectCountry(value === null ? null : Number(value))
}

function onLevelChange(value: string | number | null): void {
  store.selectLevel(value === null ? null : String(value))
}
</script>

<template>
  <div class="border-b border-[var(--line)] p-18px">
    <div class="mb-13px flex items-center justify-between gap-12px">
      <span class="text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">MAP SCOPE</span>
      <span class="flex items-center text-14px min-[1024px]:text-10px text-[var(--accent)] font-600">
        <span class="mr-6px h-5px w-5px rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />官方数据快照
      </span>
    </div>
    <label class="mb-6px block text-14px min-[1024px]:text-10px text-[var(--muted)]" for="state-select">地图</label>
    <WuSelect :native="compact"
      id="state-select"
      :model-value="selectedStateId"
      @update:model-value="onStateChange"
    >
      <WuOption v-for="state in states" :key="state.id" :value="state.id">{{ state.name }}</WuOption>
    </WuSelect>
    <div class="mt-10px grid grid-cols-2 gap-8px">
      <div>
        <label class="mb-6px block text-14px min-[1024px]:text-10px text-[var(--muted)]" for="country-select">地区</label>
        <WuSelect :native="compact"
          id="country-select"
          :model-value="selectedCountryId"
          @update:model-value="onCountryChange"
        >
          <WuOption :value="null">全部地区</WuOption>
          <WuOption v-for="region in regions" :key="region.id" :value="region.countryId">{{ region.name }}</WuOption>
        </WuSelect>
      </div>
      <div>
        <label class="mb-6px block text-14px min-[1024px]:text-10px text-[var(--muted)]" for="level-select">楼层</label>
        <WuSelect :native="compact"
          id="level-select"
          :model-value="selectedLevelId"
          @update:model-value="onLevelChange"
        >
          <WuOption :value="null">主地图 / 地表</WuOption>
          <WuOption v-for="floor in floors" :key="floor.id" :value="floor.id">{{ floor.name }}</WuOption>
        </WuSelect>
      </div>
    </div>
  </div>
</template>
