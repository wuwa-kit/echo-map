<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import { useRouteQuery } from '@vueuse/router'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { pointTitle } from '../domain/point-library.ts'
import EchoEditorFields from '../components/EchoEditorFields.vue'
import NavigationEditorFields from '../components/NavigationEditorFields.vue'
import PointEditorMap from '../components/PointEditorMap.vue'
import WuCheckBox from '../components/base/WuCheckBox.vue'
import WuDialog from '../components/base/WuDialog.vue'
import WuInput from '../components/base/WuInput.vue'
import WuMessage from '../components/base/WuMessage.vue'
import WuPopover from '../components/base/WuPopover.vue'
import WuScrollArea from '../components/base/WuScrollArea.vue'
import { compactWikiEchoId, parseWikiEchoId } from '../url/wiki-id.ts'
import { DEFAULT_STATE_ID } from '../url/explorer-url.ts'

const store = usePointEditorStore()
const compact = useMediaQuery('(max-width: 1023px)')
const { hasUnsavedChanges, editorMode, completePoints, importScope, dataset, library, officialLibrary, allPoints, showOfficial, trackingEchoId, matchRadius, heightTolerance, requiresMatchDecision, draft, filteredPoints, nearbyPoints, busy, dirty, error, notice, search, coordinateText, recovery, deleted, importPreview, versions, storage } = storeToRefs(store)
const importFile = useTemplateRef<HTMLInputElement>('importFileRef')
const moreButton = useTemplateRef<HTMLButtonElement>('moreButtonRef')
const morePopover = useTemplateRef<InstanceType<typeof WuPopover>>('morePopoverRef')
const coordinatePasteExpanded = shallowRef(false)
const coordinateAxesExpanded = shallowRef(false)
const libraryQuery = useRouteQuery<string | undefined>('library', undefined, { mode: 'replace' })
const paneQuery = useRouteQuery<string | undefined>('pane', undefined, { mode: 'replace' })
const statusQuery = useRouteQuery<string | undefined>('status', undefined, { mode: 'replace' })
const libraryExpanded = computed(() => libraryQuery.value !== '0')
const mobileList = computed(() => paneQuery.value === 'list')
const visibleLibraryPoints = computed(() => filteredPoints.value.filter((point) => {
  if (statusQuery.value === 'partial') return point.kind === 'echo' && point.compositionStatus !== 'complete'
  return !statusQuery.value || point.status === statusQuery.value
}))
const listLimit = shallowRef(100)
function toggleLibrary(): void {
  if (compact.value) paneQuery.value = mobileList.value ? undefined : 'list'
  else libraryQuery.value = libraryExpanded.value ? '0' : undefined
}
function filterStatus(status: string | undefined): void {
  statusQuery.value = status
  listLimit.value = 100
}
const previewPointId = shallowRef<string | null>(null)
const previewPoint = computed(() => completePoints.value.find(({ id }) => id === previewPointId.value))
const modeQuery = useRouteQuery<string | undefined>('mode', undefined, { mode: 'replace' })
const matchSettingsExpanded = shallowRef(false)
const noteExpanded = shallowRef(false)
const mapCandidateIds = shallowRef<string[]>([])
const editorMap = useTemplateRef<InstanceType<typeof PointEditorMap>>('editorMapRef')
const selectedQuery = useRouteQuery<string | undefined>('point', undefined, { mode: 'replace' })
const mapQuery = useRouteQuery<string | undefined>('map', undefined, { mode: 'replace' })
const regionQuery = useRouteQuery<string | undefined>('region', undefined, { mode: 'replace' })
const floorQuery = useRouteQuery<string | undefined>('floor', undefined, { mode: 'replace' })
const gravityQuery = useRouteQuery<string | undefined>('gravity', undefined, { mode: 'replace' })
const xQuery = useRouteQuery<string | undefined>('x', undefined, { mode: 'replace' })
const yQuery = useRouteQuery<string | undefined>('y', undefined, { mode: 'replace' })
const zoomQuery = useRouteQuery<string | undefined>('zoom', undefined, { mode: 'replace' })
const officialQuery = useRouteQuery<string | undefined>('official', undefined, { mode: 'replace' })
const trackingQuery = useRouteQuery<string | undefined>('tracking', undefined, { mode: 'replace' })
const radiusQuery = useRouteQuery<string | undefined>('radius', undefined, { mode: 'replace' })
const heightQuery = useRouteQuery<string | undefined>('matchHeight', undefined, { mode: 'replace' })
const floorStyleQuery = useRouteQuery<string | undefined>('floorStyle', 'icons', { mode: 'replace' })
let mapContextUrlSyncEnabled = false
const savedViewport = computed(() => {
  if (xQuery.value === undefined || yQuery.value === undefined || zoomQuery.value === undefined) return null
  const x = Number(xQuery.value), y = Number(yQuery.value), zoom = Number(zoomQuery.value)
  return [x, y, zoom].every(Number.isFinite) && zoom >= 0 && zoom <= 24 ? { center: [x, y] as [number, number], zoom } : null
})
const compactFloors = computed(() => floorStyleQuery.value !== 'list')
const modePoints = computed(() => library.value.points.filter(({ kind }) => kind === editorMode.value))
const verifiedCount = computed(() => modePoints.value.filter(({ status }) => status === 'verified').length)
const existing = computed(() => library.value.points.some(({ id }) => id === draft.value?.id))
const hasMapPosition = computed(() => draft.value !== null && draft.value.coordinate.x !== null && draft.value.coordinate.y !== null)
const libraryListPoints = computed(() => mapCandidateIds.value.length
  ? allPoints.value.filter(({ id }) => mapCandidateIds.value.includes(id))
  : filteredPoints.value)
const importSummary = computed(() => {
  if (!importPreview.value) return null
  const oldIds = new Set(library.value.points.map(({ id }) => id))
  const newIds = new Set(importPreview.value.points.map(({ id }) => id))
  return {
    added: [...newIds].filter((id) => !oldIds.has(id)).length, removed: [...oldIds].filter((id) => !newIds.has(id)).length, updated: importPreview.value.points.filter((point) => {
      const old = library.value.points.find(({ id }) => id === point.id)
      return old && JSON.stringify(old) !== JSON.stringify(point)
    }).length
  }
})
const buttonClass = 'min-h-40px rounded-7px border border-[var(--line)] bg-[#142a22] px-12px text-13px text-[#c7dfd2] disabled:opacity-40'
const toolbarButtonClass = 'min-h-32px rounded-6px border border-[var(--line)] bg-[#142a22] px-10px text-12px text-[#c7dfd2] disabled:opacity-40'

function switchMode(kind: 'echo' | 'navigation'): void {
  store.switchEditorMode(kind)
  if (kind === 'navigation' && statusQuery.value === 'partial') statusQuery.value = undefined
  listLimit.value = 100
  modeQuery.value = editorMode.value === 'echo' ? undefined : 'navigation'
  selectedQuery.value = existing.value ? draft.value?.id : undefined
  previewPointId.value = null
  mapCandidateIds.value = []
  resetDisclosures()
}
function selectPoint(id: string): void {
  const point = completePoints.value.find((point) => point.id === id)
  if (point && (point.kind !== editorMode.value || point.status === 'imported')) {
    previewPointId.value = id
    return
  }
  const previousId = draft.value?.id
  store.selectPoint(id)
  selectedQuery.value = existing.value ? draft.value?.id : undefined
  if (draft.value?.id !== previousId) resetDisclosures()
}
function editPreview(): void {
  const point = previewPoint.value
  if (!point) return
  if (point.kind !== editorMode.value) switchMode(point.kind)
  previewPointId.value = point.id
  store.selectPoint(point.id)
  if (draft.value?.id === point.id || draft.value?.replacesOfficialIds?.some((id) => (point.officialIds ?? [point.id]).includes(id))) {
    previewPointId.value = null
    selectedQuery.value = existing.value ? draft.value?.id : undefined
    resetDisclosures()
  }
}
async function saveNextNavigation(): Promise<void> {
  await save('verified')
  if (dirty.value || error.value) return
  const next = completePoints.value.find((point) => point.kind === 'navigation' && point.status === 'imported' && point.stateId === draft.value?.stateId && point.levelId === draft.value?.levelId && (point.gravityType ?? null) === (draft.value?.gravityType ?? null))
  if (next) previewPointId.value = next.id
  else store.reportError('当前地图与楼层没有待核验的官方定位点。')
}
function selectMapPoint(id: string): void {
  if (id === draft.value?.id) return
  selectPoint(id)
}
async function locateCurrentPoint(): Promise<void> {
  paneQuery.value = undefined
  await nextTick()
  editorMap.value?.locateDraft()
}
function selectMapPoints(ids: string[]): void {
  if (ids.length === 1 && ids[0]) {
    selectMapPoint(ids[0])
    return
  }
  mapCandidateIds.value = [...ids]
  paneQuery.value = undefined
}
function toggleOfficial(checked: boolean): void {
  store.setOfficialVisible(checked)
  officialQuery.value = showOfficial.value ? undefined : '0'
}
function setMatchDistance(kind: 'radius' | 'height', value: string): void {
  store.setMatchingDistance(kind, Number(value))
  radiusQuery.value = matchRadius.value === 30 ? undefined : String(matchRadius.value)
  heightQuery.value = heightTolerance.value === 8 ? undefined : String(heightTolerance.value)
}
function newPoint(kind: 'echo' | 'navigation'): void {
  const previousId = draft.value?.id
  store.newPoint(kind)
  if (!existing.value) selectedQuery.value = undefined
  if (draft.value?.id !== previousId) resetDisclosures()
}
async function runDraftAction(action: () => void | Promise<void>): Promise<void> {
  const previousId = draft.value?.id
  await action()
  selectedQuery.value = existing.value ? draft.value?.id : undefined
  if (draft.value?.id !== previousId) resetDisclosures()
}
async function save(status: 'draft' | 'verified', next = false): Promise<void> {
  await store.saveDraft(status, next)
  if (!dirty.value) selectedQuery.value = existing.value ? draft.value?.id : undefined
  if (!dirty.value && next) resetDisclosures()
}
function resetDisclosures(): void {
  coordinatePasteExpanded.value = false
  coordinateAxesExpanded.value = false
  matchSettingsExpanded.value = false
  noteExpanded.value = false
}
function selectLibraryPoint(id: string, close: () => void): void {
  const fromMap = mapCandidateIds.value.length > 0
  close()
  if (fromMap) selectMapPoint(id)
  else selectPoint(id)
}
function clearMapCandidates(): void {
  mapCandidateIds.value = []
}
function saveFromMenu(status: 'draft' | 'verified', next: boolean, close: () => void): void {
  close()
  void save(status, next)
}
function runFromMenu(action: () => void | Promise<void>, close: () => void): void {
  close()
  void runDraftAction(action)
}
function revealMatchSettings(close: () => void): void {
  close()
  matchSettingsExpanded.value = true
}
function applyCoordinateText(): void {
  store.applyCoordinateText()
  if (draft.value && Object.values(draft.value.coordinate).every((value) => value !== null)) coordinatePasteExpanded.value = false
}
async function importJson(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  if (file) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('导入文件超过 10 MB')
      store.previewImport(await file.text())
    } catch (error) { store.reportError(error instanceof Error ? error.message : String(error)) }
  }
  input.value = ''
}
function exportJson(): void {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify({ version: 1, points: modePoints.value }, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `echo-map-${editorMode.value}-points.json`
  link.click()
  URL.revokeObjectURL(url)
}
function publishViewport(viewport: {
  center: [number, number]
  zoom: number
} | null): void {
  if (!viewport) {
    xQuery.value = yQuery.value = zoomQuery.value = undefined
    return
  }
  xQuery.value = String(Number(viewport.center[0].toFixed(2)))
  yQuery.value = String(Number(viewport.center[1].toFixed(2)))
  zoomQuery.value = String(Number(viewport.zoom.toFixed(4)))
}
function toggleFloorLayout(): void {
  floorStyleQuery.value = compactFloors.value ? 'list' : undefined
}
function queryInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}
function publishMapContext(): void {
  if (!draft.value) return
  mapQuery.value = draft.value.stateId === DEFAULT_STATE_ID ? undefined : String(draft.value.stateId)
  regionQuery.value = draft.value.countryId === null ? undefined : String(draft.value.countryId)
  floorQuery.value = draft.value.levelId ?? undefined
  gravityQuery.value = draft.value.gravityType === null ? undefined : String(draft.value.gravityType)
}
watch([
  () => draft.value?.stateId,
  () => draft.value?.countryId,
  () => draft.value?.levelId,
  () => draft.value?.gravityType,
], () => {
  if (mapContextUrlSyncEnabled) publishMapContext()
})
onMounted(async () => {
  if (!['draft', 'verified', 'imported', 'partial'].includes(statusQuery.value ?? '')) statusQuery.value = undefined
  if (libraryQuery.value !== '0') libraryQuery.value = undefined
  if (paneQuery.value !== 'list') paneQuery.value = undefined
  await store.load()
  if (modeQuery.value === 'navigation') store.switchEditorMode('navigation')
  modeQuery.value = editorMode.value === 'echo' ? undefined : 'navigation'
  if (editorMode.value === 'navigation' && statusQuery.value === 'partial') statusQuery.value = undefined
  store.setOfficialVisible(officialQuery.value !== '0')
  officialQuery.value = showOfficial.value ? undefined : '0'
  store.setMatchingDistance('radius', Number(radiusQuery.value ?? 30))
  store.setMatchingDistance('height', Number(heightQuery.value ?? 8))
  let selectedExistingPoint = false
  if (selectedQuery.value && !dirty.value) {
    if (library.value.points.some(({ id, kind }) => id === selectedQuery.value && kind === editorMode.value)) {
      store.selectPoint(selectedQuery.value)
      selectedExistingPoint = true
    } else selectedQuery.value = undefined
  }
  if (!selectedExistingPoint) {
    store.initializeMapContext({
      stateId: queryInteger(mapQuery.value),
      countryId: queryInteger(regionQuery.value),
      levelId: floorQuery.value?.trim() || undefined,
      gravityType: gravityQuery.value === '1' ? 1 : gravityQuery.value === '2' ? 2 : undefined,
    })
  }
  store.setTrackingEcho(parseWikiEchoId(trackingQuery.value) ?? '')
  trackingQuery.value = compactWikiEchoId(trackingEchoId.value)
  radiusQuery.value = matchRadius.value === 30 ? undefined : String(matchRadius.value)
  heightQuery.value = heightTolerance.value === 8 ? undefined : String(heightTolerance.value)
  floorStyleQuery.value = compactFloors.value ? undefined : 'list'
  mapContextUrlSyncEnabled = true
  publishMapContext()
})
onBeforeRouteLeave(() => !hasUnsavedChanges.value || window.confirm('当前修改尚未保存到点位库。离开后可恢复浏览器草稿，仍要离开吗？'))
useEventListener(window, 'beforeunload', (event) => {
  if (hasUnsavedChanges.value) {
    event.preventDefault()
    event.returnValue = ''
  }
})
</script>

<template>
  <WuScrollArea :unbounded="!compact" class="h-full bg-[#091510] text-[#d7eadf]" content-class="lg:flex lg:h-full lg:flex-col" viewport-class="lg:h-full">
    <WuMessage v-if="error" :message="error" type="error" :duration="0" @close="store.dismissMessage" />
    <WuMessage v-else-if="notice" :message="notice" @close="store.dismissMessage" />
    <WuDialog :open="recovery !== null" @dismiss-requested="store.dismissRecovery">
      <div class="p-18px">
        <div class="text-16px font-600">发现上次未保存的编辑</div>
        <div class="mt-8px text-13px text-[#9db9aa]">是否恢复这份浏览器草稿继续录入？</div>
        <div class="mt-18px flex justify-end gap-8px">
          <button :class="buttonClass" @click="store.dismissRecovery">忽略草稿</button>
          <button class="min-h-40px rounded-7px border-0 bg-[#65f1c2] px-12px text-13px text-[#092519] font-600" @click="runDraftAction(store.recoverDraft)">恢复草稿</button>
        </div>
      </div>
    </WuDialog>
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-8px border-b border-[var(--line)] px-12px py-6px lg:px-16px">
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-12px gap-y-2px"><RouterLink to="/" class="text-12px text-[#8eae9d]">← 地图</RouterLink><div class="text-16px font-600">点位录入</div><div class="text-11px text-[#7d9e8b]">人工 已核验 {{ verifiedCount }} · 草稿 {{ modePoints.length - verifiedCount }} · 官方 {{ officialLibrary.points.filter(({ kind }) => kind === editorMode).length }} · {{ storage === 'browser' ? '浏览器存储' : '项目文件' }}</div></div>
      <div class="flex flex-wrap gap-5px">
        <button :class="toolbarButtonClass" :disabled="busy" @click="store.load">刷新</button>
        <button :class="toolbarButtonClass" :disabled="busy || !dataset" @click="exportJson">导出当前模式</button>
        <button :class="toolbarButtonClass" :disabled="busy || !dataset" @click="importFile?.click()">导入当前模式</button>
        <button :class="toolbarButtonClass" :disabled="busy" @click="store.loadVersions">整库历史</button>
        <input ref="importFileRef" type="file" accept="application/json,.json" class="hidden" @change="importJson" />
      </div>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-8px border-b border-[var(--line)] px-12px py-8px">
      <button v-for="mode in (['echo', 'navigation'] as const)" :key="mode" class="min-h-36px rounded-6px border px-12px text-12px" :class="editorMode === mode ? 'border-[#65f1c2] bg-[#204b3b] text-[#8fffd4]' : 'border-[var(--line)] bg-[#10241b] text-[#91ae9e]'" :disabled="busy" @click="switchMode(mode)">{{ mode === 'echo' ? '声骸录入 · C1 / C3' : '定位点维护' }}</button>
      <span class="text-11px text-[#91ae9e]">{{ editorMode === 'echo' ? '追踪声骸 → 实测坐标 → 确认怪群 → 连续录入' : '选择官方点 → 核验图标坐标 → 确认传送能力与落点' }}</span>
      <button :class="toolbarButtonClass" @click="toggleLibrary">{{ compact ? (mobileList ? '查看地图' : '查看列表') : (libraryExpanded ? '收起列表' : '展开列表') }}</button>
      <button :class="toolbarButtonClass" :disabled="busy" @click="newPoint(editorMode)">＋ {{ editorMode === 'echo' ? '新增声骸点' : '新增人工定位点' }}</button>
    </div>
    <WuDialog :open="Boolean(previewPoint)" @dismiss-requested="previewPointId = null">
      <div v-if="previewPoint && dataset" class="p-18px">
        <div class="text-16px font-600">{{ pointTitle(previewPoint, dataset) }}</div>
        <div class="mt-8px text-12px text-[#9db9aa]">{{ previewPoint.status === 'imported' ? '官方参考点 · Z=0 为占位高度，尚未实测' : '人工点位' }}</div>
        <div class="mt-8px font-mono">{{ Object.values(previewPoint.coordinate).join(', ') }}</div>
        <div class="mt-8px text-12px">{{ previewPoint.note }}</div>
        <div v-if="dirty && previewPoint.kind === editorMode" class="mt-8px text-12px text-[#d8b778]">当前编辑尚未保存，请先存草稿或放弃修改。</div>
        <div class="mt-16px flex flex-wrap gap-8px"><button v-if="dirty && previewPoint.kind === editorMode" :class="buttonClass" :disabled="busy" @click="save('draft')">保存当前草稿</button><button :class="buttonClass" @click="previewPointId = null">关闭预览</button><button :class="buttonClass" :disabled="busy" @click="editPreview">{{ previewPoint.status === 'imported' ? '录入实测数据' : '维护此点' }}</button></div>
      </div>
    </WuDialog>
    <div v-if="deleted" class="flex shrink-0 items-center gap-10px bg-[#192e25] px-20px py-8px text-13px"><span>点位已删除。</span><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.undoDelete)">撤销删除</button></div>
    <div v-if="importPreview && importSummary" class="shrink-0 border-b border-[#937544] bg-[#302b1c] p-16px text-13px">
      <div>{{ importScope === 'all' ? '整库恢复' : '当前模式替换' }}预览：合并后共 {{ importPreview.points.length }} 处，新增 {{ importSummary.added }}、修改 {{ importSummary.updated }}、移除 {{ importSummary.removed }}。保存前会保留当前版本。</div>
      <div class="mt-10px flex gap-8px"><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.applyImport)">确认替换点位库</button><button :class="buttonClass" :disabled="busy" @click="store.cancelImport">取消</button></div>
    </div>
    <WuScrollArea v-if="versions.length" class="max-h-160px shrink-0 border-b border-[var(--line)]" content-class="p-12px">
      <div class="mb-8px flex items-center justify-between text-13px"><span>历史版本 · 选择后预览差异</span><button :class="buttonClass" @click="store.closeVersions">收起</button></div>
      <button v-for="version in versions" :key="version.revision" :class="buttonClass" class="mb-6px mr-6px" :disabled="busy" @click="store.previewVersion(version.revision)">{{ new Date(version.savedAt).toLocaleString('zh-CN') }}</button>
    </WuScrollArea>
    <div v-if="dataset && draft" class="min-h-0 flex-1 lg:grid" :class="libraryExpanded ? 'lg:grid-cols-[260px_minmax(240px,1fr)_360px]' : 'lg:grid-cols-[minmax(240px,1fr)_360px]'">
      <WuScrollArea v-if="compact ? mobileList : libraryExpanded" class="max-h-340px min-h-0 border-r border-[var(--line)] lg:max-h-none" content-class="p-10px">
        <div class="mb-8px text-13px font-600">{{ editorMode === 'echo' ? '声骸点位库' : '定位点核验库' }} · {{ visibleLibraryPoints.length }}</div>
        <WuInput :model-value="search" type="search" :placeholder="editorMode === 'echo' ? '搜索声骸、坐标或备注' : '搜索名称、坐标或备注'" @update:model-value="store.setSearch" />
        <WuCheckBox :model-value="showOfficial" :disabled="busy" class="my-8px flex items-center gap-7px text-12px" @update:model-value="toggleOfficial">显示官方参考点</WuCheckBox>
        <div class="mb-8px flex flex-wrap gap-5px"><button v-for="filter in [{ value: undefined, label: '全部' }, { value: 'imported', label: '官方待核验' }, { value: 'draft', label: '草稿' }, { value: 'verified', label: '已核验' }]" :key="filter.label" :class="toolbarButtonClass" @click="filterStatus(filter.value)">{{ filter.label }}{{ statusQuery === filter.value ? ' ✓' : '' }}</button><button v-if="editorMode === 'echo'" :class="toolbarButtonClass" @click="filterStatus('partial')">待补齐{{ statusQuery === 'partial' ? ' ✓' : '' }}</button></div>
        <button v-for="point in visibleLibraryPoints.slice(0, listLimit)" :key="point.id" type="button" class="mb-6px w-full rounded-7px border border-[var(--line)] bg-[#10241b] p-9px text-left" :class="point.id === draft.id ? 'border-[#65f1c2]' : ''" :disabled="busy" @click="selectPoint(point.id)">
          <div class="text-12px">{{ pointTitle(point, dataset) }}</div>
          <div class="mt-5px text-10px text-[#91ae9e]">{{ point.status === 'imported' ? '官方 · 待实测' : point.status === 'verified' ? '已核验' : '草稿' }}<span v-if="point.kind === 'echo' && point.compositionStatus !== 'complete'"> · 清单待补齐</span></div>
          <div class="mt-4px font-mono text-10px text-[#789788]">{{ Object.values(point.coordinate).map((value) => value ?? '—').join(', ') }}</div>
        </button>
        <div v-if="!visibleLibraryPoints.length" class="py-20px text-12px text-[#789788]">没有匹配点位，可新增记录。</div>
        <button v-if="visibleLibraryPoints.length > listLimit" :class="buttonClass" class="w-full" @click="listLimit += 100">继续加载（{{ listLimit }} / {{ visibleLibraryPoints.length }}）</button>
      </WuScrollArea>
      <WuDialog :open="mapCandidateIds.length > 1" @dismiss-requested="clearMapCandidates">
        <div class="p-16px"><div class="mb-10px">此处点位</div><button v-for="point in libraryListPoints" :key="point.id" :class="buttonClass" class="mb-6px block w-full" @click="selectLibraryPoint(point.id, clearMapCandidates)">{{ pointTitle(point, dataset) }}</button><button :class="buttonClass" @click="clearMapCandidates">关闭</button></div>
      </WuDialog>
      <PointEditorMap
        v-show="!compact || !mobileList"
        :dataset="dataset" :points="allPoints" :draft="draft" :compact="compact" :compact-floors="compactFloors" :saved-viewport="savedViewport"
        ref="editorMapRef"
        class="h-340px lg:h-full" @point-selected="selectMapPoints"
        @viewport-changed="publishViewport" @floor-layout-toggled="toggleFloorLayout"
      />
      <WuScrollArea :unbounded="compact" class="min-h-0 border-t border-[var(--line)] bg-[#0d1e16] lg:border-l lg:border-t-0" content-class="p-12px pb-0">
        <div class="mb-12px flex items-center justify-between"><div class="text-16px font-600">{{ existing ? '编辑' : '新增' }}{{ draft.kind === 'echo' ? '刷取点' : '定位点' }}</div><span v-if="dirty || existing" class="text-11px" :class="dirty ? 'text-[#dcb77b]' : draft.status === 'verified' ? 'text-[#77e5b6]' : 'text-[#dcb77b]'">{{ dirty ? '未保存' : draft.status === 'verified' ? '已核验' : '草稿' }}</span></div>

        <button type="button" :class="buttonClass" class="mb-8px w-full" :disabled="busy || !hasMapPosition" @click="locateCurrentPoint">定位到此点</button>
        <EchoEditorFields v-if="draft.kind === 'echo'" section="tracking" />

        <div class="mt-8px rounded-8px border border-[var(--line)] p-9px">
          <div class="flex items-center justify-between gap-8px"><div class="text-12px font-600">{{ draft.kind === 'navigation' ? '图标点位坐标' : '实测坐标' }}</div><div class="flex gap-8px"><button type="button" class="border-0 bg-transparent p-0 text-11px text-[#83b69e]" @click="coordinatePasteExpanded = !coordinatePasteExpanded">粘贴 XYZ</button><button type="button" class="border-0 bg-transparent p-0 text-11px text-[#83b69e]" @click="coordinateAxesExpanded = !coordinateAxesExpanded">{{ coordinateAxesExpanded ? '收起' : '逐轴编辑' }}</button></div></div>
          <div v-if="!hasMapPosition || coordinatePasteExpanded" class="mt-7px flex gap-5px"><WuInput :model-value="coordinateText" :disabled="busy" placeholder="-497, 449, 18" @update:model-value="store.setCoordinateText" @confirm="applyCoordinateText" /><button type="button" class="min-h-36px shrink-0 rounded-6px border border-[var(--line)] bg-[#173328] px-9px text-12px text-[#c7dfd2]" :disabled="busy" @click="applyCoordinateText">应用</button></div>
          <div v-if="hasMapPosition && !coordinateAxesExpanded" class="mt-7px grid grid-cols-3 gap-6px"><div class="rounded-6px bg-[#10241b] px-8px py-6px text-10px text-[#789788]">X<span class="mt-2px block truncate font-mono text-12px text-[#c8ddd2]">{{ draft.coordinate.x }}</span></div><div class="rounded-6px bg-[#10241b] px-8px py-6px text-10px text-[#789788]">Y<span class="mt-2px block truncate font-mono text-12px text-[#c8ddd2]">{{ draft.coordinate.y }}</span></div><div class="text-10px text-[#789788]">Z<WuInput class="mt-2px font-mono" size="sm" inputmode="numeric" :model-value="draft.coordinate.z" :disabled="busy" @update:model-value="store.setCoordinate('z', $event)" /></div></div>
          <div v-if="coordinateAxesExpanded" class="mt-7px grid grid-cols-3 gap-6px"><div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="text-10px text-[#789788]">{{ axis.toUpperCase() }}<WuInput class="mt-2px font-mono" size="sm" inputmode="numeric" :model-value="draft.coordinate[axis]" :disabled="busy" @update:model-value="store.setCoordinate(axis, $event)" /></div></div>
        </div>

        <div v-if="nearbyPoints.length || matchSettingsExpanded" class="mt-8px rounded-8px border border-[#745f38] bg-[#261f14] p-9px">
          <div class="flex items-center justify-between"><div class="text-12px font-600">{{ nearbyPoints.length ? `附近找到 ${nearbyPoints.length} 处候选` : '匹配设置' }}</div><button type="button" class="border-0 bg-transparent p-0 text-11px text-[#c6a96f]" @click="matchSettingsExpanded = !matchSettingsExpanded">{{ matchSettingsExpanded ? '收起设置' : '设置范围' }}</button></div>
          <div v-if="matchSettingsExpanded" class="mt-7px grid grid-cols-2 gap-7px"><div class="text-10px text-[#aa9876]">XY 范围<WuInput type="number" min="1" max="500" :model-value="matchRadius" lazy @update:model-value="setMatchDistance('radius', $event)" /></div><div class="text-10px text-[#aa9876]">最大高度差<WuInput type="number" min="0" max="500" :model-value="heightTolerance" lazy @update:model-value="setMatchDistance('height', $event)" /></div></div>
          <template v-if="nearbyPoints.length">
            <div v-for="nearby in nearbyPoints.slice(0, 8)" :key="nearby.point.id" class="mt-7px rounded-6px bg-[#332a1a] p-8px"><div class="text-12px">{{ pointTitle(nearby.point, dataset) }}</div><div class="mt-3px font-mono text-10px text-[#b29e79]">{{ Object.values(nearby.point.coordinate).map((value) => value ?? '—').join(', ') }} · XY {{ nearby.distance.toFixed(1) }}</div><button v-if="draft.kind === 'echo' && draft.status === 'draft'" type="button" class="mt-6px min-h-32px w-full rounded-5px border border-[#6e5936] bg-[#3b3020] text-11px text-[#e2c893]" :disabled="busy" @click="runDraftAction(() => store.appendToNearby(nearby.point.id))">追加到此点</button><button v-if="draft.kind === 'navigation'" :class="buttonClass" class="mt-6px w-full" @click="previewPointId = nearby.point.id">查看已有点位</button><div class="mt-3px text-10px text-[#b29e79]">{{ nearby.point.status === 'imported' ? '官方参考 · 高度未实测' : `人工点 · 高度差 ${nearby.heightDifference ?? '未知'}` }}</div></div>
            <button v-if="requiresMatchDecision" type="button" class="mt-7px min-h-34px w-full rounded-5px border border-[#7b6741] bg-transparent text-11px text-[#e2c893]" @click="store.confirmSeparatePoint">这些都不是，建立独立点位</button>
          </template>
        </div>

        <EchoEditorFields v-if="draft.kind === 'echo'" section="members" :key="draft.id" />

        <NavigationEditorFields v-if="draft.kind === 'navigation'" :key="draft.id" />

        <button v-if="!noteExpanded && !draft.note" type="button" class="mt-8px min-h-34px border border-dashed border-[var(--line)] rounded-6px bg-transparent text-11px text-[#83a996]" @click="noteExpanded = true">＋ 添加备注</button>
        <div v-else class="mt-8px rounded-7px border border-[var(--line)] p-9px"><div class="mb-4px flex items-center justify-between text-11px text-[#91ae9e]"><span>备注</span><button v-if="!draft.note" type="button" class="border-0 bg-transparent p-0 text-10px text-[#789788]" @click="noteExpanded = false">收起</button></div><WuInput :model-value="draft.note" :disabled="busy" placeholder="入口、地形、核验说明…" @update:model-value="store.setNote" /></div>

        <button v-if="draft.kind === 'navigation'" :class="buttonClass" class="mt-10px w-full" :disabled="busy" @click="saveNextNavigation">核验保存，查看下一待核验点 →</button>
        <div class="sticky bottom-0 mt-10px flex gap-6px border-t border-[var(--line)] bg-[#0d1e16] py-10px">
          <button type="button" :class="buttonClass" :disabled="busy" @click="save('draft')">存草稿</button>
          <button type="button" class="min-h-42px flex-1 rounded-7px border-0 bg-[#65f1c2] px-8px text-13px text-[#092519] font-600 disabled:opacity-40" :disabled="busy" @click="save('verified', !existing && draft.kind === 'echo')">{{ busy ? '保存中…' : existing ? '保存修改' : draft.kind === 'echo' ? '核验保存，继续下一处 →' : '核验并保存' }}</button>
          <button ref="moreButtonRef" type="button" class="min-h-42px w-44px shrink-0 rounded-7px border border-[var(--line)] bg-[#142a22] text-16px text-[#c7dfd2]" :disabled="busy" @click="morePopover?.toggle()">···</button>
          <WuPopover ref="morePopoverRef" :anchor="moreButton" :width="190" placement="top-end" class="border border-[#355748] rounded-8px bg-[#10231c] p-5px shadow-[0_14px_42px_rgba(0,0,0,0.46)]">
            <template #default="{ close }">
              <button type="button" class="min-h-36px w-full border-0 rounded-5px bg-transparent px-9px text-left text-11px text-[#cce2d6] hover:bg-[#193329]" @click="saveFromMenu('draft', false, close)">保存草稿</button>
              <button v-if="!existing && draft.kind === 'echo'" type="button" class="min-h-36px w-full border-0 rounded-5px bg-transparent px-9px text-left text-11px text-[#cce2d6] hover:bg-[#193329]" @click="saveFromMenu('verified', false, close)">核验并保存</button>
              <button v-if="draft.kind === 'echo'" type="button" class="min-h-36px w-full border-0 rounded-5px bg-transparent px-9px text-left text-11px text-[#cce2d6] hover:bg-[#193329]" @click="revealMatchSettings(close)">匹配设置</button>
              <button type="button" class="min-h-36px w-full border-0 rounded-5px bg-transparent px-9px text-left text-11px text-[#cce2d6] hover:bg-[#193329]" @click="runFromMenu(store.copyPoint, close)">复制到新点</button>
              <button type="button" class="min-h-36px w-full border-0 rounded-5px bg-transparent px-9px text-left text-11px text-[#cce2d6] hover:bg-[#193329]" @click="runFromMenu(store.discardChanges, close)">放弃修改</button>
              <button v-if="existing" type="button" class="min-h-36px w-full border-0 rounded-5px bg-transparent px-9px text-left text-11px text-[#e5ad9a] hover:bg-[#33231f]" @click="runFromMenu(store.deletePoint, close)">删除点位</button>
            </template>
          </WuPopover>
        </div>
      </WuScrollArea>
    </div>
    <div v-else class="flex flex-1 items-center justify-center p-40px text-14px text-[#91ae9e]">{{ busy ? '正在载入录入系统…' : '点位录入加载失败，请检查网络后重新载入。' }}</div>
  </WuScrollArea>
</template>
