<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useEventListener } from '@vueuse/core'
import { useExplorerStore } from '../stores/explorer.ts'
import WuSvg from './base/WuSvg.vue'

const store = useExplorerStore()
const { selectedLevelId, floorRequest, nearbyFloorGroups, floorSwitcherVisible, compactFloors } = storeToRefs(store)
const requestName = computed(() => store.floors.find(({ id }) => id === floorRequest.value?.levelId)?.name ?? '')
const layoutLabel = computed(() => compactFloors.value ? '切换为楼层文字列表' : '切换为楼层图标列表')
// Presentation-only positioning keeps labels outside the scrolling rail without resizing it.
const hint = shallowRef<{ text: string; left: number; top: number } | null>(null)

function floorHint(group: string, name: string, id: string): string {
  const label = name.startsWith(group) ? name : `${group} · ${name}`
  if (floorRequest.value?.levelId !== id) return label
  return `${label} · ${floorRequest.value.status === 'loading' ? '正在加载' : '加载失败，点击重试'}`
}

function showHint(event: PointerEvent | FocusEvent, text: string): void {
  if (!compactFloors.value || (event instanceof PointerEvent && event.pointerType === 'touch')) return
  if (!(event.currentTarget instanceof HTMLElement)) return
  const rect = event.currentTarget.getBoundingClientRect()
  hint.value = { text, left: rect.right + 8, top: rect.top + rect.height / 2 }
}

function hideHint(): void {
  hint.value = null
}

function selectLevel(id: string | null): void {
  hideHint()
  store.requestLevel(id)
}

function toggleLayout(): void {
  hideHint()
  store.toggleFloorLayout()
}

useEventListener(window, 'resize', hideHint)
useEventListener(window, 'scroll', hideHint, { capture: true, passive: true })
</script>

<template>
  <div
    v-if="floorSwitcherVisible && (nearbyFloorGroups.length || floorRequest)"
    role="group"
    aria-label="楼层显示"
    class="pointer-events-auto relative min-h-0 max-w-full flex flex-col rounded-9px border border-[var(--line)] bg-[#07110fed] text-13px shadow-lg"
    :class="compactFloors ? 'w-56px' : 'w-176px'"
    @keydown.esc="hideHint"
  >
    <div class="relative h-44px shrink-0">
      <button
        type="button" aria-label="主地图" :aria-pressed="selectedLevelId === null"
        class="h-44px cursor-pointer border-0 rounded-t-8px text-left text-inherit outline-offset--3 focus-visible:outline-2 focus-visible:outline-[#8cf4ce]"
        :class="[
          compactFloors ? 'w-full flex items-center justify-center bg-transparent' : 'w-[calc(100%_-_36px)] px-12px',
          !compactFloors && selectedLevelId === null ? 'bg-[#174535] text-[#8cf4ce]' : 'bg-transparent hover:bg-[#183329]',
        ]"
        @click="selectLevel(null)" @pointerenter="showHint($event, '主地图')" @pointerleave="hideHint" @focus="showHint($event, '主地图')" @blur="hideHint"
      >
        <span v-if="compactFloors" class="h-26px w-26px flex rotate-45 items-center justify-center border-2" :class="selectedLevelId === null ? 'border-white bg-[#e5eee7] shadow-[0_0_8px_#ffffff55]' : 'border-[#c3d0c166] bg-[#18221bb3]'">
          <WuSvg name="map-pin" class="-rotate-45 text-22px" :class="selectedLevelId === null ? 'text-[#857421]' : 'text-[#ddc853]'" />
        </span>
        <span v-else>主地图</span>
      </button>
      <button
        type="button" :aria-label="layoutLabel" :title="layoutLabel" :aria-pressed="compactFloors"
        class="absolute top-0 h-44px flex cursor-pointer items-center justify-center border-0 text-[#a9bfb2] outline-offset--3 hover:bg-[#183329] hover:text-[#8cf4ce] focus-visible:outline-2 focus-visible:outline-[#8cf4ce]"
        :class="compactFloors ? 'left-full w-32px rounded-r-8px bg-[#07110fed] shadow-lg' : 'right-0 w-36px rounded-tr-8px border-l border-[var(--line)] bg-transparent'"
        @click="toggleLayout"
      ><WuSvg :name="compactFloors ? 'layout-list' : 'layout-icons'" class="text-18px" /></button>
    </div>
    <div class="min-h-0 overflow-y-auto overscroll-contain rounded-b-8px border-t border-[var(--line)] [scrollbar-color:#516459_transparent]" :class="compactFloors ? '[scrollbar-width:none]' : '[scrollbar-width:thin]'" @scroll="hideHint">
      <div v-for="group in nearbyFloorGroups" :key="group.id" role="group" :aria-label="group.name" class="border-t border-[var(--line)] first:border-t-0" :class="compactFloors ? 'py-4px' : ''">
        <div v-if="!compactFloors && nearbyFloorGroups.length > 1" :title="group.name" class="h-28px flex items-center bg-[#10231c] px-10px text-12px font-600 text-[#91ab9d]"><span class="truncate">{{ group.name }}</span></div>
        <button
          v-for="floor in group.floors"
          :key="floor.id"
          type="button"
          :aria-pressed="selectedLevelId === floor.id"
          :aria-label="floor.name"
          :disabled="!floor.tiles.length"
          :title="compactFloors ? undefined : floorRequest?.levelId === floor.id && floorRequest.status === 'error' ? `${floor.name} 加载失败，点击重试` : floor.name"
          class="relative h-44px w-full flex cursor-pointer items-center border-0 text-left text-inherit outline-offset--3 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#8cf4ce]"
          :class="[
            compactFloors ? 'justify-center' : 'gap-8px px-12px',
            !compactFloors && selectedLevelId === floor.id ? 'bg-[#174535] text-[#8cf4ce]' : 'bg-transparent hover:bg-[#183329]',
          ]"
          @click="selectLevel(floor.id)" @pointerenter="showHint($event, floorHint(group.name, floor.name, floor.id))" @pointerleave="hideHint" @focus="showHint($event, floorHint(group.name, floor.name, floor.id))" @blur="hideHint"
        >
          <span class="relative flex shrink-0 items-center justify-center" :class="compactFloors ? 'h-26px w-26px rotate-45 border-2' : 'h-20px w-20px'">
            <span v-if="compactFloors" class="pointer-events-none absolute inset--2px border-2" :class="selectedLevelId === floor.id ? 'border-white bg-[#e5eee7] shadow-[0_0_8px_#ffffff55]' : 'border-[#c3d0c166] bg-[#18221bb3]'" />
            <WuSvg name="floor" class="relative text-22px" :class="compactFloors ? selectedLevelId === floor.id ? '-rotate-45 text-[#34483c]' : '-rotate-45 text-[#c4d2c5]' : ''" />
          </span>
          <span v-if="!compactFloors" class="min-w-0 flex-1 truncate">{{ floor.name }}</span>
          <span aria-hidden="true" :class="compactFloors ? 'absolute right-3px top-3px' : 'h-16px w-12px shrink-0'">
            <span v-if="floorRequest?.levelId === floor.id" class="block rounded-full bg-[#07110f]" :class="compactFloors ? 'p-2px' : ''">
              <span v-if="floorRequest.status === 'loading'" class="block h-12px w-12px animate-spin rounded-full border-2 border-[#8cf4ce] border-t-transparent motion-reduce:animate-none" />
              <span v-else class="block text-12px font-bold text-[#f1d7b4]">!</span>
            </span>
          </span>
        </button>
      </div>
    </div>
    <div v-if="compactFloors && hint" role="tooltip" class="pointer-events-none fixed z-90 -translate-y-1/2 break-words rounded-r-4px bg-[#e5eee7] px-12px py-8px text-13px font-600 text-[#263b31] shadow-lg" :style="{ left: `${hint.left}px`, top: `${hint.top}px`, maxWidth: `min(240px, calc(100vw - ${hint.left + 12}px))` }">{{ hint.text }}</div>
    <div class="sr-only" role="status" aria-live="polite">
      {{ floorRequest ? `${requestName}${floorRequest.status === 'loading' ? '正在加载' : '加载失败，点击该楼层重试'}` : '' }}
    </div>
  </div>
</template>
