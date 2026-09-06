<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuCheckBox from '../base/WuCheckBox.vue'
import WuScrollArea from '../base/WuScrollArea.vue'
import { mapZoomRangeLabel, navigationPointZoomRange } from '../../map/point-visibility.ts'
import type { MapZoomRange, NavigationPoint } from '../../domain/types.ts'
import { matchesGravity } from '../../domain/gravity.ts'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { supportsGravity, selectedGravity } = storeToRefs(store)
const { allNavigationPoints, allNavigationPointGroups, hiddenPointGroupIds, selectedStateId } = storeToRefs(store)

interface PointGroupOption {
  id: string
  name: string
  iconUrl: string
  modes: readonly NavigationPoint['mode'][]
  zoomRanges: Readonly<MapZoomRange>[]
  count: number
  typeCount: number
  typeNames: readonly string[]
}

const modeOrder: NavigationPoint['mode'][] = ['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown']
const pointGroupOptions = computed<PointGroupOption[]>(() => {
  const points = allNavigationPoints.value
  return allNavigationPointGroups.value.flatMap((group) => {
    const groupPoints = points.filter((point) => (
      point.stateId === selectedStateId.value && point.groupId === group.id
      && matchesGravity(point.gravityType, supportsGravity.value ? selectedGravity.value : null)
    ))
    if (groupPoints.length === 0) {
      return []
    }
    return [{
      id: group.id,
      name: group.name,
      iconUrl: group.iconUrl,
      modes: group.modes,
      zoomRanges: [...new Map(groupPoints.map((point) => {
        const range = navigationPointZoomRange(point)
        return [`${range.minZoom}:${range.maxZoom}`, range] as const
      })).values()],
      count: groupPoints.length,
      typeCount: new Set(groupPoints.map(({ typeId }) => typeId)).size,
      typeNames: [...new Set(groupPoints.map(({ typeName }) => typeName))],
    }]
  }).sort((left, right) => (
    Math.min(...left.modes.map((mode) => modeOrder.indexOf(mode)))
      - Math.min(...right.modes.map((mode) => modeOrder.indexOf(mode)))
    || left.name.localeCompare(right.name, 'zh-CN')
  ))
})
const hiddenPointGroupSet = computed(() => new Set(hiddenPointGroupIds.value))
const visiblePointGroupCount = computed(() => pointGroupOptions.value.filter(({ id }) => !hiddenPointGroupSet.value.has(id)).length)

function hideAllCurrentPointGroups(): void {
  store.hidePointGroups(pointGroupOptions.value.map(({ id }) => id))
}

function pointModeLabel(modes: readonly NavigationPoint['mode'][]): string {
  if (modes.includes('fast-travel')) {
    return modes.length === 1 ? '可传送' : '含可传送'
  }
  if (modes.length > 1) {
    return '混合定位点'
  }
  return modes[0] === 'local-transit'
    ? '局部交通'
    : modes[0] === 'entrance'
      ? '入口'
      : modes[0] === 'landmark'
        ? '地标/服务'
        : '待确认'
}

function pointModeOpacityClass(modes: readonly NavigationPoint['mode'][]): string {
  return modes.includes('fast-travel') ? 'opacity-100' : 'opacity-48'
}

function pointZoomLabel(ranges: readonly Readonly<MapZoomRange>[]): string {
  return ranges.length === 1 && ranges[0] ? mapZoomRangeLabel(ranges[0]) : '分级显示'
}
</script>

<template>
  <div id="point-filters" tabindex="-1" class="border-b border-[var(--line)] p-18px">
    <div class="mb-11px flex items-center justify-between gap-10px">
      <div>
        <span class="block text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">MAP POINT ICONS</span>
        <div class="mt-4px text-14px text-[#e7f1ec] font-[650]">定位点显示</div>
      </div>
      <span class="text-12px min-[1024px]:text-9px text-[var(--accent)]">{{ visiblePointGroupCount }}/{{ pointGroupOptions.length }} 图标</span>
    </div>
    <div class="mb-9px flex items-center justify-end gap-5px">
      <button class="min-h-44px min-[1024px]:min-h-0 cursor-pointer border border-[var(--line)] rounded-5px bg-transparent px-7px py-4px text-12px min-[1024px]:text-9px text-[#9db1a9] font-inherit hover:border-[rgba(101,241,194,0.4)] hover:text-[var(--accent)]" type="button" @click="store.showAllPointGroups">全部显示</button>
      <button class="min-h-44px min-[1024px]:min-h-0 cursor-pointer border border-[var(--line)] rounded-5px bg-transparent px-7px py-4px text-12px min-[1024px]:text-9px text-[#9db1a9] font-inherit hover:border-[rgba(101,241,194,0.4)] hover:text-[var(--accent)]" type="button" @click="hideAllCurrentPointGroups">全部隐藏</button>
    </div>
    <div class="mb-8px text-12px min-[1024px]:text-8px text-[#6f877e] leading-[1.5]">勾选表示允许显示；放大地图后，会逐步显示小型信标、挑战、交通和服务点。</div>
    <WuScrollArea :unbounded="compact" class="min-[1024px]:max-h-230px" content-class="flex flex-col gap-4px pr-2px">
      <WuCheckBox
        v-for="pointGroup in pointGroupOptions"
        :key="pointGroup.id"
        :model-value="!hiddenPointGroupSet.has(pointGroup.id)"
        :title="pointGroup.typeNames.join(' / ')"
        class="grid min-h-48px min-[1024px]:min-h-38px cursor-pointer grid-cols-[16px_28px_minmax(0,1fr)_auto] items-center gap-7px rounded-6px border border-transparent bg-[rgba(25,43,38,0.48)] px-7px py-4px hover:border-[rgba(101,241,194,0.28)] hover:bg-[rgba(34,65,55,0.56)]"
        @update:model-value="store.setPointGroupVisible(pointGroup.id, $event)"
      >
        <span class="grid h-26px w-26px place-items-center">
          <img loading="lazy" decoding="async" v-if="pointGroup.iconUrl" class="h-24px w-24px object-contain" :class="pointModeOpacityClass(pointGroup.modes)" :src="pointGroup.iconUrl" alt="" />
          <span v-else class="h-6px w-6px rounded-full bg-[#91a69e]" :class="pointModeOpacityClass(pointGroup.modes)" />
        </span>
        <span class="min-w-0">
          <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-14px min-[1024px]:text-10px text-[#d5e3dd]">{{ pointGroup.name }}</span>
          <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#6f877e]">{{ pointModeLabel(pointGroup.modes) }} · {{ pointZoomLabel(pointGroup.zoomRanges) }} · {{ pointGroup.typeCount }} 类</span>
        </span>
        <span class="text-12px min-[1024px]:text-9px text-[#82988f]">{{ pointGroup.count }}</span>
      </WuCheckBox>
      <div v-if="pointGroupOptions.length === 0" class="py-12px text-center text-12px min-[1024px]:text-9px text-[#71877e]">当前地图没有定位点图标</div>
    </WuScrollArea>
  </div>
</template>
