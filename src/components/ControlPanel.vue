<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import WuCheckBox from './base/WuCheckBox.vue'
import WuOption from './base/WuOption.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import WuSelect from './base/WuSelect.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import { navigationPointMinZoom } from '../map/point-visibility.ts'
import type { NavigationPoint } from '../domain/types.ts'

defineProps<{
  compact: boolean
}>()

function scrollToSection(id: string): void {
  const target = document.getElementById(id)
  target?.scrollIntoView({ block: 'start' })
  target?.focus({ preventScroll: true })
}

const store = useExplorerStore()
const {
  dataset,
  echoSearch,
  echoesMatchingSonata,
  floors,
  hiddenPointGroupIds,
  regions,
  selectedCountryId,
  selectedEchoIds,
  selectedLevelId,
  selectedSonataIds,
  selectedStateId,
  showProvisional,
  states,
  visibleEchoLocations,
} = storeToRefs(store)

interface PointGroupOption {
  id: string
  name: string
  iconUrl: string
  modes: readonly NavigationPoint['mode'][]
  minZooms: number[]
  count: number
  typeCount: number
  typeNames: readonly string[]
}

const modeOrder: NavigationPoint['mode'][] = ['fast-travel', 'local-transit', 'entrance', 'landmark', 'unknown']
const pointGroupOptions = computed<PointGroupOption[]>(() => {
  const points = dataset.value?.navigationPoints ?? []
  return (dataset.value?.navigationPointGroups ?? []).flatMap((group) => {
    const groupPoints = points.filter((point) => (
      point.stateId === selectedStateId.value && point.groupId === group.id
    ))
    if (groupPoints.length === 0) {
      return []
    }
    return [{
      id: group.id,
      name: group.name,
      iconUrl: group.iconUrl,
      modes: group.modes,
      minZooms: [...new Set(groupPoints.map(navigationPointMinZoom))].sort((left, right) => left - right),
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

const locationCountByEcho = computed(() => {
  const counts = new Map<string, number>()
  for (const location of dataset.value?.echoLocations ?? []) {
    if (location.stateId === selectedStateId.value) {
      counts.set(location.echoId, (counts.get(location.echoId) ?? 0) + 1)
    }
  }
  return counts
})

function onStateChange(value: string | number | null): void {
  store.selectState(Number(value))
}

function onCountryChange(value: string | number | null): void {
  store.selectCountry(value === null ? null : Number(value))
}

function onLevelChange(value: string | number | null): void {
  store.selectLevel(value === null ? null : String(value))
}

function onEchoSearch(event: Event): void {
  store.setEchoSearch((event.target as HTMLInputElement).value)
}

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

function pointZoomLabel(minZooms: number[]): string {
  if (minZooms.length !== 1) {
    return '分级显示'
  }
  return minZooms[0] === 0 ? '全局显示' : `缩放 ${minZooms[0]}+`
}
</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col">
    <div v-if="compact" class="grid shrink-0 grid-cols-3 gap-6px border-b border-[var(--line)] px-12px" role="group" aria-label="筛选分类导航">
      <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent text-14px text-[var(--accent)]" @click="scrollToSection('echo-filters')">声骸</button>
      <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent text-14px text-[var(--accent)]" @click="scrollToSection('sonata-filters')">合鸣</button>
      <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent text-14px text-[var(--accent)]" @click="scrollToSection('point-filters')">定位点</button>
    </div>
    <WuScrollArea class="min-h-0 flex-1" content-class="pb-16px">
      <div v-if="dataset && !compact" class="border-b border-[var(--line)] p-18px" role="banner">
        <div class="flex items-center justify-between gap-12px">
          <div class="flex min-w-0 items-center gap-11px">
            <span
              class="relative h-31px w-31px shrink-0 border border-[rgba(101,241,194,0.58)] rounded-full shadow-[inset_0_0_14px_rgba(101,241,194,0.12),0_0_20px_rgba(101,241,194,0.09)]"
              aria-hidden="true"
            >
              <span class="absolute left-9px top-7px h-15px w-1px origin-bottom rotate-[-28deg] bg-[var(--accent)]" />
              <span class="absolute left-15px top-4px h-19px w-1px origin-bottom bg-[var(--accent)]" />
              <span class="absolute right-9px top-7px h-15px w-1px origin-bottom rotate-[28deg] bg-[var(--accent)]" />
            </span>
            <div class="min-w-0 leading-none">
              <span class="block font-serif text-21px text-[#f1faf5] font-500 tracking-[0.12em]">声巡</span>
              <span class="mt-6px block truncate text-7px text-[#789087] font-700 tracking-[0.15em]">WUTHERING ECHO ROUTE</span>
            </div>
          </div>
          <span
            class="shrink-0 text-right text-12px min-[1024px]:text-8px text-[#71877e] leading-[1.45]"
            :data-datetime="dataset.source.generatedAt"
          >
            <span class="block">数据</span>
            <span class="block">{{ new Date(dataset.source.generatedAt).toLocaleDateString('zh-CN') }}</span>
          </span>
        </div>
        <div class="mt-14px grid grid-cols-3 gap-6px">
          <div class="min-w-0 border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.56)] px-8px py-7px">
            <span class="block truncate text-14px text-[#d8eee5] font-600">{{ dataset.report.includedEchoCount }}</span>
            <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#71877e]">C1/C3 声骸</span>
          </div>
          <div class="min-w-0 border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.56)] px-8px py-7px">
            <span class="block truncate text-14px text-[#d8eee5] font-600">{{ dataset.echoLocations.length.toLocaleString('zh-CN') }}</span>
            <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#71877e]">声骸点</span>
          </div>
          <div class="min-w-0 border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.56)] px-8px py-7px">
            <span class="block truncate text-14px text-[#d8eee5] font-600">{{ dataset.navigationPoints.length.toLocaleString('zh-CN') }}</span>
            <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#71877e]">定位点</span>
          </div>
        </div>
      </div>

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

      <div id="sonata-filters" tabindex="-1" class="border-b border-[var(--line)] p-18px">
        <div class="mb-13px flex items-center justify-between gap-12px">
          <div>
            <span class="block text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">SONATA EFFECT</span>
            <div class="mt-4px text-14px text-[#e7f1ec] font-[650]">按合鸣效果筛选</div>
          </div>
          <button class="min-h-44px min-[1024px]:min-h-0 cursor-pointer border-0 bg-transparent p-2px text-14px min-[1024px]:text-10px text-[#789087] font-inherit" type="button" @click="store.clearSonataFilters">清除</button>
        </div>
        <WuScrollArea :unbounded="compact"
          class="min-[1024px]:max-h-148px"
          :content-class="compact ? 'grid grid-flow-col auto-cols-88px gap-8px overflow-x-auto py-2px' : 'grid grid-cols-4 gap-6px pr-2px'"
        >
          <button
            v-for="sonata in dataset?.sonatas"
            :key="sonata.id"
            class="flex h-88px min-[1024px]:h-64px min-w-0 cursor-pointer flex-col items-center rounded-6px border px-3px pb-4px pt-6px font-inherit"
            :class="selectedSonataIds.includes(sonata.id)
              ? 'border-[rgba(101,241,194,0.5)] bg-[rgba(39,78,66,0.66)]'
              : 'border-transparent bg-[rgba(29,50,44,0.62)] hover:border-[rgba(101,241,194,0.5)] hover:bg-[rgba(39,78,66,0.66)]'"
            :title="sonata.name"
            :aria-pressed="selectedSonataIds.includes(sonata.id)"
            type="button"
            @click="store.toggleSonata(sonata.id)"
          >
            <img loading="lazy" decoding="async" v-if="sonata.iconUrl" class="h-36px w-36px object-contain" :src="sonata.iconUrl" alt="" />
            <span class="w-full whitespace-normal break-words text-12px leading-tight min-[1024px]:overflow-hidden min-[1024px]:text-ellipsis min-[1024px]:whitespace-nowrap min-[1024px]:text-8px text-[#b9c9c2]">{{ sonata.name }}</span>
          </button>
        </WuScrollArea>
      </div>

      <div id="echo-filters" tabindex="-1" class="border-b border-[var(--line)] p-18px">
        <div class="mb-13px flex items-center justify-between gap-12px">
          <div>
            <span class="block text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">ECHO TARGETS</span>
            <div class="mt-4px text-14px text-[#e7f1ec] font-[650]">选择声骸</div>
          </div>
          <span class="text-14px min-[1024px]:text-10px text-[var(--accent)] font-600">{{ visibleEchoLocations.length }} 点</span>
        </div>
        <div class="mb-10px flex h-44px w-full min-[1024px]:h-34px items-center gap-7px border border-[var(--line)] rounded-7px bg-[rgba(21,40,35,0.78)] px-10px text-[#6f887f] focus-within:border-[rgba(101,241,194,0.55)]">
          <span>⌕</span>
          <input aria-label="搜索声骸" class="w-full min-w-0 border-0 bg-transparent text-16px min-[1024px]:text-11px text-[#dce9e3] font-inherit outline-none" :value="echoSearch" type="search" :placeholder="`搜索 ${dataset?.echoes.length ?? 0} 个 C1/C3 声骸`" @input="onEchoSearch" />
        </div>
        <WuScrollArea :unbounded="compact"
          class="min-[1024px]:max-h-290px"
          content-class="flex flex-col gap-4px pr-2px"
        >
          <button
            v-for="echo in echoesMatchingSonata"
            :key="echo.id"
            :aria-pressed="selectedEchoIds.includes(echo.id)"
            class="grid min-h-48px w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_20px] items-center rounded-6px border px-8px py-4px pl-4px text-left font-inherit"
            :class="selectedEchoIds.includes(echo.id)
              ? 'border-[rgba(101,241,194,0.34)] bg-[rgba(34,65,55,0.66)]'
              : 'border-transparent bg-[rgba(25,43,38,0.48)] hover:border-[rgba(101,241,194,0.34)] hover:bg-[rgba(34,65,55,0.66)]'"
            type="button"
            @click="store.toggleEcho(echo.id)"
          >
            <img loading="lazy" decoding="async" class="h-38px w-38px object-contain" :src="echo.iconUrl" alt="" />
            <span class="flex overflow-hidden flex-col items-start gap-3px">
              <span class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-14px min-[1024px]:text-11px text-[#dce9e3] font-[560]">{{ echo.name }}</span>
              <span class="text-12px min-[1024px]:text-9px text-[#70877e]">COST {{ echo.cost }} · {{ locationCountByEcho.get(echo.id) ?? 0 }} 处</span>
            </span>
            <span class="text-center text-13px text-[var(--accent)]">{{ selectedEchoIds.includes(echo.id) ? '✓' : '+' }}</span>
          </button>
        </WuScrollArea>
        <div v-if="echoesMatchingSonata.length === 0" class="py-18px text-center text-14px text-[var(--muted)]" role="status">没有匹配的声骸，试试其他名称或合鸣效果。</div>
        <button class="min-h-44px min-[1024px]:min-h-0 mt-10px w-full cursor-pointer border border-[var(--line)] rounded-6px bg-transparent p-8px text-14px min-[1024px]:text-10px text-[#8fa49c] font-inherit" type="button" @click="store.clearFilters">重置声骸与合鸣筛选</button>
      </div>
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
        <div class="mb-8px text-12px min-[1024px]:text-8px text-[#6f877e] leading-[1.5]">勾选表示允许显示；地图缩小时仍会按点位优先级自动隐藏。</div>
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
              <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#6f877e]">{{ pointModeLabel(pointGroup.modes) }} · {{ pointZoomLabel(pointGroup.minZooms) }} · {{ pointGroup.typeCount }} 类</span>
            </span>
            <span class="text-12px min-[1024px]:text-9px text-[#82988f]">{{ pointGroup.count }}</span>
          </WuCheckBox>
          <div v-if="pointGroupOptions.length === 0" class="py-12px text-center text-12px min-[1024px]:text-9px text-[#71877e]">当前地图没有定位点图标</div>
        </WuScrollArea>
      </div>

      <div class="flex flex-wrap gap-x-15px gap-y-8px border-b border-[var(--line)] px-18px py-13px">
        <WuCheckBox
          class="flex min-h-44px items-center gap-8px text-14px min-[1024px]:text-10px text-[#a7b8b1]"
          :model-value="showProvisional"
          @update:model-value="store.setProvisionalVisible"
        >
          待补 XYZ 声骸
        </WuCheckBox>
      </div>

    </WuScrollArea>
  </div>
</template>
