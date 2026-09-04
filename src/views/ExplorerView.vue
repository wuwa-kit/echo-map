<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsyncState } from '@vueuse/core'
import ControlPanel from '../components/ControlPanel.vue'
import MapCanvas from '../components/MapCanvas.vue'
import RoutePanel from '../components/RoutePanel.vue'
import { useEqualComputed } from '../composables/useEqualComputed.ts'
import { useExplorerRouteQuery } from '../composables/useExplorerRouteQuery.ts'
import { loadMapDataset } from '../data/load.ts'
import { useExplorerStore } from '../stores/explorer.ts'
import type { MapDataset } from '../domain/types.ts'
import type { ExplorerUrlSnapshot } from '../url/explorer-url.ts'

const store = useExplorerStore()
const { controlPanelCollapsed, dataset } = storeToRefs(store)
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
  routeZWeight: store.routeZWeight,
  viewport: store.mapViewport,
}))

function syncUrl(): void {
  routeQuery.write(urlSnapshot.value)
}

watch(urlSnapshot, (snapshot) => {
  if (urlSyncEnabled) {
    routeQuery.write(snapshot)
  }
})

const { error: loadFailure, isLoading: loading } = useAsyncState<MapDataset | null>(
  loadMapDataset,
  null,
  {
    onSuccess(value) {
      if (value) {
        store.setDataset(value)
        store.restoreUrlState(routeQuery.read())
        urlSyncEnabled = true
        syncUrl()
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
    class="relative h-dvh w-dvw overflow-hidden [background:radial-gradient(circle_at_30%_0%,rgba(42,107,87,0.17),transparent_36%),#07100f]"
  >
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center text-[#9ab0a7]" role="status" aria-live="polite">
      <span class="h-34px w-34px animate-spin border-2 border-[rgba(101,241,194,0.16)] border-t-[var(--accent)] rounded-full" />
      <div class="mb-7px mt-18px text-20px text-[#e4f0eb]">正在装载地图数据</div>
      <div class="text-11px">解析声骸白名单、地图瓦片和分层信息…</div>
    </div>
    <div v-else-if="loadError" class="absolute inset-0 flex flex-col items-center justify-center text-[#9ab0a7]" role="alert">
      <div class="mb-7px text-20px text-[#e4f0eb]">地图数据无法加载</div>
      <div class="text-11px">{{ loadError }}</div>
      <span class="mt-12px rounded-5px bg-[rgba(101,241,194,0.08)] px-10px py-7px text-[var(--accent)]">pnpm data:sync</span>
    </div>
    <div
      v-else-if="dataset"
      class="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-[#101c1a] [--control-panel-width:340px] max-[900px]:[--control-panel-width:285px] max-[680px]:[--control-panel-width:min(320px,calc(100vw_-_44px))]"
    >
      <MapCanvas />
      <div
        class="absolute bottom-14px flex max-w-560px flex-wrap items-center gap-x-13px gap-y-7px border border-[var(--line)] rounded-7px bg-[rgba(7,16,15,0.84)] px-11px py-8px text-9px text-[#9bada6] backdrop-blur-10px transition-[right] duration-220 ease max-[680px]:hidden"
        :class="controlPanelCollapsed ? 'right-18px' : 'right-[calc(var(--control-panel-width)+18px)]'"
      >
        <span class="flex items-center gap-5px"><span class="h-8px w-8px border-2 border-[var(--accent)] rounded-full" /> 已有 XYZ</span>
        <span class="flex items-center gap-5px"><span class="h-8px w-8px border border-dashed border-[#b8cbc3] rounded-full" /> 临时 XY</span>
        <span class="flex items-center gap-5px"><span class="h-8px w-8px rotate-45 bg-[var(--accent)]" /> 可传送点</span>
        <span class="flex items-center gap-5px"><span class="h-8px w-8px rotate-45 bg-[#91a69e] opacity-48" /> 不可传送点</span>
        <span class="flex items-center gap-5px"><span class="w-16px border-t-2 border-dashed border-[var(--accent)]" /> 规划路线</span>
      </div>
      <RoutePanel />
      <ControlPanel
        :collapsed="controlPanelCollapsed"
        @toggle="store.toggleControlPanel"
      />
    </div>
  </div>
</template>
