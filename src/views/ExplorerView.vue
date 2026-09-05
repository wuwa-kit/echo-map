<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsyncState, useEventListener, useMediaQuery, useResizeObserver, useWindowSize } from '@vueuse/core'
import ControlPanel from '../components/ControlPanel.vue'
import MapCanvas from '../components/MapCanvas.vue'
import RoutePanel from '../components/RoutePanel.vue'
import WuSvg from '../components/base/WuSvg.vue'
import { useEqualComputed } from '../composables/useEqualComputed.ts'
import { useExplorerRouteQuery } from '../composables/useExplorerRouteQuery.ts'
import { loadMapDataset } from '../data/load.ts'
import { useExplorerStore } from '../stores/explorer.ts'
import type { MapDataset } from '../domain/types.ts'
import type { MapPadding } from '../map/viewport-padding.ts'
import type { ExplorerUrlSnapshot, MobileSheet } from '../url/explorer-url.ts'

const store = useExplorerStore()
onBeforeUnmount(store.clearRoute)
const { controlPanelCollapsed, dataset, mobileSheet, route, planning, selectedEchoIds, selectedSonataIds } = storeToRefs(store)
const compact = useMediaQuery('(max-width: 1023px)')
const shortLandscape = useMediaQuery('(min-width: 500px) and (max-height: 500px)')
const { height: viewportHeight } = useWindowSize({ type: 'visual' })
const viewportTop = shallowRef(window.visualViewport?.offsetTop ?? 0)
useEventListener(window.visualViewport, ['resize', 'scroll'], () => {
  viewportTop.value = window.visualViewport?.offsetTop ?? 0
})
const stage = useTemplateRef<HTMLElement>('stageRef')
const controlDock = useTemplateRef<HTMLElement>('controlDockRef')
const routeDock = useTemplateRef<HTMLElement>('routeDockRef')
const mobileBar = useTemplateRef<HTMLElement>('mobileBarRef')
const filtersButton = useTemplateRef<HTMLButtonElement>('filtersButtonRef')
const routeButton = useTemplateRef<HTMLButtonElement>('routeButtonRef')
const mapPadding = shallowRef<MapPadding>([16, 16, 16, 16])
const controlVisible = computed(() => compact.value ? mobileSheet.value === 'filters' : !controlPanelCollapsed.value)
const routeVisible = computed(() => !compact.value || mobileSheet.value === 'route')
const compactPanelClass = computed(() => shortLandscape.value
  ? 'bottom-[var(--mobile-bar-height)] right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))] w-[min(360px,calc(100%_-_24px))] rounded-14px'
  : 'bottom-[var(--mobile-bar-height)] inset-x-0 max-h-[min(70%,calc(100%_-_var(--mobile-bar-height)_-_12px))] rounded-t-18px')

function updateMapPadding(): void {
  if (!stage.value) {
    return
  }
  const area = stage.value.getBoundingClientRect()
  const style = getComputedStyle(stage.value)
  const safe = (edge: string): number => Number.parseFloat(style.getPropertyValue(`--safe-${edge}`)) || 0
  const padding: MapPadding = [safe('top') + 16, safe('right') + 16, safe('bottom') + 16, safe('left') + 16]
  if (compact.value && mobileBar.value) {
    padding[2] = area.bottom - mobileBar.value.getBoundingClientRect().top + 12
  }
  const zoom = stage.value.querySelector('.ol-zoom')?.getBoundingClientRect()
  const attribution = stage.value.querySelector('.ol-attribution')?.getBoundingClientRect()
  if (zoom) {
    padding[3] = Math.max(padding[3], zoom.right - area.left + 12)
  }
  if (attribution) {
    padding[2] = Math.max(padding[2], area.bottom - attribution.top + 12)
  }
  for (const panel of [controlDock.value, routeDock.value]) {
    if (!panel || panel.getClientRects().length === 0) {
      continue
    }
    const rect = panel.getBoundingClientRect()
    if (compact.value && !shortLandscape.value) {
      padding[2] = Math.max(padding[2], area.bottom - rect.top + 12)
    } else {
      padding[1] = Math.max(padding[1], area.right - rect.left + 12)
    }
  }
  mapPadding.value = padding
}

useResizeObserver([stage, controlDock, routeDock, mobileBar], updateMapPadding)
watch([compact, shortLandscape, controlVisible, routeVisible], updateMapPadding, { flush: 'post' })

async function openSheet(sheet: Exclude<MobileSheet, null>): Promise<void> {
  if (mobileSheet.value === sheet) {
    await closeSheet()
    return
  }
  store.setMobileSheet(sheet)
  await nextTick()
  const panel = sheet === 'filters' ? controlDock.value : routeDock.value
  panel?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
}

async function closeSheet(): Promise<void> {
  const previous = mobileSheet.value
  store.setMobileSheet(null)
  await nextTick()
  const button = previous === 'filters' ? filtersButton.value : routeButton.value
  button?.focus({ preventScroll: true })
}

function onKeydown(event: KeyboardEvent): void {
  if (compact.value && mobileSheet.value && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault()
    void closeSheet()
  }
}

const routeQuery = useExplorerRouteQuery()
let urlSyncEnabled = false
const urlSnapshot = useEqualComputed<ExplorerUrlSnapshot>(() => ({
  stateId: store.selectedStateId,
  countryId: store.selectedCountryId,
  levelId: store.selectedLevelId,
  echoIds: store.selectedEchoIds,
  sonataIds: store.selectedSonataIds,
  hiddenPointGroupIds: store.hiddenPointGroupIds,
  showProvisional: store.showProvisional,
  controlPanelCollapsed: store.controlPanelCollapsed,
  mobileSheet: store.mobileSheet,
  routeZWeight: store.routeZWeight,
  viewport: store.mapViewport,
}))
watch(urlSnapshot, (snapshot) => {
  if (urlSyncEnabled) {
    routeQuery.write(snapshot)
  }
})
const { error: loadFailure, isLoading: loading, execute: reloadDataset } = useAsyncState<MapDataset | null>(
  loadMapDataset,
  null,
  {
    onSuccess(value) {
      if (value) {
        store.setDataset(value)
        store.restoreUrlState(routeQuery.read())
        urlSyncEnabled = true
        routeQuery.write(urlSnapshot.value)
      }
    },
  },
)
const loadError = computed(() => {
  const error = loadFailure.value
  return error instanceof Error ? error.message : error === undefined ? '' : String(error)
})
</script>

<template>
  <div
    class="fixed inset-x-0 top-[var(--viewport-top)] h-[var(--viewport-height)] overflow-hidden bg-[#07100f]"
    :style="{ '--viewport-height': `${viewportHeight}px`, '--viewport-top': `${viewportTop}px` }"
    @keydown="onKeydown"
  >
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center gap-14px p-24px text-center text-14px text-[#9ab0a7]" role="status" aria-live="polite">
      <span class="h-34px w-34px animate-spin border-2 border-[rgba(101,241,194,0.16)] border-t-[var(--accent)] rounded-full" />
      <div class="text-20px text-[#e4f0eb]">正在装载地图数据</div>
      <div>加载声骸、地图与楼层信息…</div>
    </div>
    <div v-else-if="loadError" class="absolute inset-0 flex flex-col items-center justify-center gap-14px p-24px text-center text-14px text-[#9ab0a7]" role="alert">
      <div class="text-20px text-[#e4f0eb]">地图数据无法加载</div>
      <div class="max-w-full break-words">{{ loadError }}</div>
      <button type="button" class="min-h-44px cursor-pointer rounded-7px border border-[var(--accent)] bg-transparent px-20px text-14px text-[var(--accent)]" @click="reloadDataset()">重新加载</button>
    </div>
    <div
      v-else-if="dataset"
      ref="stageRef"
      class="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-[#101c1a] [--control-panel-width:340px] [--mobile-bar-height:calc(72px+env(safe-area-inset-bottom))] [--safe-top:env(safe-area-inset-top)] [--safe-right:env(safe-area-inset-right)] [--safe-bottom:env(safe-area-inset-bottom)] [--safe-left:env(safe-area-inset-left)]"
    >
      <MapCanvas :padding="mapPadding" />
      <div v-if="!compact" class="absolute bottom-14px right-[calc(var(--control-panel-width)+18px)] flex max-w-560px flex-wrap items-center gap-12px rounded-7px border border-[var(--line)] bg-[#07100fe6] px-11px py-8px text-11px text-[#9bada6]" :class="controlPanelCollapsed ? 'translate-x-[var(--control-panel-width)]' : ''">
        <span>实测 XYZ 可规划</span>
        <span>临时 XY 仅定位</span>
        <span class="text-[var(--accent)]">虚线为规划路线</span>
      </div>
      <div
        v-show="routeVisible"
        id="route-panel"
        ref="routeDockRef"
        class="absolute z-80 min-h-0 flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--panel)] shadow-xl"
        :class="compact ? compactPanelClass : ['top-18px max-h-[calc(100%_-_76px)] w-315px rounded-9px', controlPanelCollapsed ? 'right-18px' : 'right-[calc(var(--control-panel-width)+56px)]']"
        role="complementary"
        aria-label="路线规划面板"
      >
        <div v-if="compact" class="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-16px py-6px">
          <span class="text-16px font-600">刷取路线</span>
          <button type="button" class="min-h-44px cursor-pointer rounded-7px border-0 bg-transparent px-12px text-14px text-[var(--accent)]" aria-label="收起路线面板" @click="closeSheet">返回地图</button>
        </div>
        <RoutePanel :compact="compact" />
      </div>
      <div
        v-show="controlVisible"
        id="control-panel"
        ref="controlDockRef"
        class="absolute z-80 min-h-0 flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--panel)] shadow-xl"
        :class="compact ? compactPanelClass : 'inset-y-0 right-0 w-[var(--control-panel-width)]'"
        role="complementary"
        aria-label="地图筛选面板"
      >
        <div v-if="compact" class="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-16px py-6px">
          <span class="text-16px font-600">地图筛选</span>
          <button type="button" class="min-h-44px cursor-pointer rounded-7px border-0 bg-transparent px-12px text-14px text-[var(--accent)]" aria-label="收起筛选面板" @click="closeSheet">查看地图</button>
        </div>
        <ControlPanel :compact="compact" />
      </div>
      <button
        v-if="!compact"
        type="button"
        class="absolute top-14px z-90 grid h-44px w-44px cursor-pointer place-items-center rounded-l-9px border border-[var(--line)] bg-[var(--panel)] text-[var(--accent)]"
        :class="controlPanelCollapsed ? 'right-0' : 'right-[var(--control-panel-width)]'"
        :aria-label="controlPanelCollapsed ? '展开地图数据面板' : '收起地图数据面板'"
        :aria-expanded="!controlPanelCollapsed"
        aria-controls="control-panel"
        @click="store.toggleControlPanel"
      >
        <WuSvg name="chevron-right" class="[--wu-svg-h:18px]" :class="controlPanelCollapsed ? 'rotate-180' : ''" />
      </button>
      <div
        v-if="compact"
        ref="mobileBarRef"
        class="absolute inset-x-0 bottom-0 z-90 grid h-[var(--mobile-bar-height)] grid-cols-2 items-start gap-10px border-t border-[var(--line)] bg-[#091412] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-10px"
        role="group"
        aria-label="地图工具"
      >
        <button ref="filtersButtonRef" type="button" class="min-h-50px min-w-0 cursor-pointer rounded-9px border border-[var(--line)] px-10px text-14px text-[#eaf4ef]" :class="mobileSheet === 'filters' ? 'bg-[#245442]' : 'bg-[#152b24]'" :aria-expanded="mobileSheet === 'filters'" aria-controls="control-panel" @click="openSheet('filters')">
          筛选<span v-if="selectedEchoIds.length + selectedSonataIds.length" class="ml-6px text-[var(--accent)]">{{ selectedEchoIds.length + selectedSonataIds.length }}</span>
        </button>
        <button ref="routeButtonRef" type="button" class="min-h-50px min-w-0 cursor-pointer rounded-9px border border-[var(--line)] px-10px text-14px text-[#eaf4ef]" :class="mobileSheet === 'route' ? 'bg-[#245442]' : 'bg-[#152b24]'" :aria-expanded="mobileSheet === 'route'" aria-controls="route-panel" @click="openSheet('route')">
          {{ planning ? '路线优化中…' : route ? `路线 · ${route.points.length} 点` : '路线' }}
        </button>
      </div>
    </div>
  </div>
</template>
