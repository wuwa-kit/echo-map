<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuOption from '../base/WuOption.vue'
import WuSelect from '../base/WuSelect.vue'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { activeMapName, floors, selectedLevelId, selectedGravity, supportsGravity, unmarkedGravityCount } = storeToRefs(store)

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
    <div v-if="supportsGravity" class="mb-14px">
      <div class="mb-7px text-14px text-[var(--muted)]">重力状态</div>
      <div role="group" aria-label="重力状态" class="grid grid-cols-2 gap-6px">
        <button v-for="gravity in ([1, 2] as const)" :key="gravity" type="button" :aria-pressed="selectedGravity === gravity" class="min-h-40px rounded-7px border px-8px text-13px" :class="selectedGravity === gravity ? 'border-[#65f1c2] bg-[#174535] text-[#8cf4ce]' : 'border-[var(--line)] bg-[#12251e] text-[#a9c3b7]'" @click="store.selectGravity(gravity)">{{ gravity === 1 ? '普通重力' : '反重力' }}</button>
      </div>
      <div v-if="selectedGravity === 2" class="mt-8px text-12px leading-relaxed text-[#d3b680]">官方反重力声骸点位待核验；此处仅显示已标注为反重力的点位。</div>
      <div v-if="unmarkedGravityCount" class="mt-8px text-12px leading-relaxed text-[#d3b680]">{{ unmarkedGravityCount }} 个点位的重力待核验，仅在普通重力显示，暂不参与路线。</div>
    </div>
    <label class="mb-6px block text-14px text-[var(--muted)]" for="level-select">楼层显示</label>
    <WuSelect :native="compact" id="level-select" :model-value="selectedLevelId" @update:model-value="onLevelChange">
      <WuOption :value="null">主地图 / 地表</WuOption>
      <WuOption v-for="floor in floors" :key="floor.id" :value="floor.id">{{ floor.name }}</WuOption>
    </WuSelect>
  </div>
</template>
