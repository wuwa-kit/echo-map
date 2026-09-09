<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../stores/explorer.ts'
import WuEllipsis from './base/WuEllipsis.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import WuSvg from './base/WuSvg.vue'
import WuTooltip from './base/WuTooltip.vue'

const store = useExplorerStore()
const { selectedLevelId, floorRequest, nearbyFloorGroups, floorSwitcherVisible, compactFloors } = storeToRefs(store)
const layoutLabel = computed(() => compactFloors.value ? '切换为楼层文字列表' : '切换为楼层图标列表')

function floorHint(group: string, name: string, id: string): string {
  const label = name.startsWith(group) ? name : `${group} · ${name}`
  if (floorRequest.value?.levelId !== id) return label
  return `${label} · ${floorRequest.value.status === 'loading' ? '正在加载' : '加载失败，点击重试'}`
}

function selectLevel(id: string | null): void {
  store.requestLevel(id)
}

function toggleLayout(): void {
  store.toggleFloorLayout()
}
</script>

<template>
  <div
    v-if="floorSwitcherVisible && (nearbyFloorGroups.length || floorRequest)"
    class="pointer-events-auto relative min-h-0 max-w-full flex flex-col border border-[var(--line)] bg-[#07110fed] text-13px shadow-lg"
    :class="compactFloors ? 'w-44px rounded-bl-9px rounded-br-9px rounded-tl-9px' : 'w-max rounded-9px'"
  >
    <div class="relative shrink-0" :class="compactFloors ? 'h-36px' : 'h-40px'">
      <WuTooltip
        content="主地图" :disabled="!compactFloors" placement="right" :delay-enter="0"
        class="block w-full" :class="compactFloors ? 'h-36px' : 'h-40px'"
      >
        <button
          type="button"
          class="cursor-pointer border-0 text-left text-inherit"
          :class="[
            compactFloors ? 'h-36px w-full flex items-center justify-center rounded-tl-8px bg-transparent' : 'h-40px w-full rounded-t-8px px-10px',
            !compactFloors && selectedLevelId === null ? 'bg-[#174535] text-[#8cf4ce]' : 'bg-transparent hover:bg-[#183329]',
          ]"
          @click="selectLevel(null)"
        >
          <span v-if="compactFloors" class="h-22px w-22px flex rotate-45 items-center justify-center border-2" :class="selectedLevelId === null ? 'border-white bg-[#e5eee7] shadow-[0_0_8px_#ffffff55]' : 'border-[#c3d0c166] bg-[#18221bb3]'">
            <WuSvg name="map-pin" class="-rotate-45 text-18px" :class="selectedLevelId === null ? 'text-[#857421]' : 'text-[#ddc853]'" />
          </span>
          <span v-else>主地图</span>
        </button>
      </WuTooltip>
      <button
        type="button" :title="layoutLabel"
        class="absolute flex cursor-pointer items-center justify-center text-[#a9bfb2] hover:bg-[#183329] hover:text-[#8cf4ce]"
        :class="compactFloors ? 'left-full top-0 h-36px w-24px rounded-r-8px border border-l-0 border-[var(--line)] bg-[#07110fed]' : 'right-2px top-2px h-36px w-28px rounded-6px border-0 bg-transparent'"
        @click="toggleLayout"
      ><WuSvg :name="compactFloors ? 'layout-list' : 'layout-icons'" class="text-16px" /></button>
    </div>
    <WuScrollArea size="sm" class="min-h-0 rounded-b-8px border-t border-[var(--line)]">
      <div v-for="group in nearbyFloorGroups" :key="group.id" class="border-t border-[var(--line)] first:border-t-0" :class="compactFloors ? 'py-1px' : ''">
        <div v-if="!compactFloors && nearbyFloorGroups.length > 1" class="h-24px flex items-center bg-[#10231c] px-8px text-11px font-600 text-[#91ab9d]"><WuEllipsis :text="group.name" placement="right" :delay-enter="0" class="min-w-0 flex-1" /></div>
        <WuTooltip
          v-for="floor in group.floors"
          :key="floor.id"
          :content="floorHint(group.name, floor.name, floor.id)" :disabled="!compactFloors"
          placement="right" :delay-enter="0" class="block w-full"
        >
          <button
            type="button"
            :disabled="!floor.tiles.length"
            class="relative w-full flex cursor-pointer items-center border-0 text-left text-inherit disabled:cursor-not-allowed disabled:opacity-40"
            :class="[
              compactFloors ? 'h-36px justify-center' : 'h-40px gap-6px px-10px',
              !compactFloors && selectedLevelId === floor.id ? 'bg-[#174535] text-[#8cf4ce]' : 'bg-transparent hover:bg-[#183329]',
            ]"
            @click="selectLevel(floor.id)"
          >
            <span class="relative flex shrink-0 items-center justify-center" :class="compactFloors ? 'h-22px w-22px rotate-45 border-2' : 'h-18px w-18px'">
              <span v-if="compactFloors" class="pointer-events-none absolute inset--2px border-2" :class="selectedLevelId === floor.id ? 'border-white bg-[#e5eee7] shadow-[0_0_8px_#ffffff55]' : 'border-[#c3d0c166] bg-[#18221bb3]'" />
              <WuSvg name="floor" class="relative text-18px" :class="compactFloors ? selectedLevelId === floor.id ? '-rotate-45 text-[#34483c]' : '-rotate-45 text-[#c4d2c5]' : ''" />
            </span>
            <WuEllipsis
              v-if="!compactFloors" :text="floor.name" :tooltip-text="floorHint(group.name, floor.name, floor.id)"
              placement="right" :delay-enter="0" class="min-w-0 flex-1"
            />
            <span :class="compactFloors ? 'absolute right-2px top-2px' : 'h-16px w-12px shrink-0'">
              <span v-if="floorRequest?.levelId === floor.id" class="block rounded-full bg-[#07110f]" :class="compactFloors ? 'p-2px' : ''">
                <span v-if="floorRequest.status === 'loading'" class="block h-12px w-12px animate-spin rounded-full border-2 border-[#8cf4ce] border-t-transparent" />
                <span v-else class="block text-12px font-bold text-[#f1d7b4]">!</span>
              </span>
            </span>
          </button>
        </WuTooltip>
      </div>
    </WuScrollArea>
  </div>
</template>
