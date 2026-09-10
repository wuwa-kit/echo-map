<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import { useRouteQuery } from '@vueuse/router'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { MODE_NAMES, NAVIGATION_NAMES, pointTitle } from '../domain/point-library.ts'
import { navigationKindSchema, navigationModeSchema } from '../domain/schema.ts'
import PointEditorMap from '../components/PointEditorMap.vue'
import EchoPointIcon from '../components/EchoPointIcon.vue'
import WuCheckBox from '../components/base/WuCheckBox.vue'
import WuDialog from '../components/base/WuDialog.vue'
import WuInput from '../components/base/WuInput.vue'
import WuMessage from '../components/base/WuMessage.vue'
import WuOption from '../components/base/WuOption.vue'
import WuPopover from '../components/base/WuPopover.vue'
import WuScrollArea from '../components/base/WuScrollArea.vue'
import WuSelect from '../components/base/WuSelect.vue'
import type { WuSelectValue } from '../components/base/select-context.ts'
import { compactWikiEchoId, parseWikiEchoId } from '../url/wiki-id.ts'

const store = usePointEditorStore()
const compact = useMediaQuery('(max-width: 1023px)')
const { dataset, library, officialLibrary, allPoints, showOfficial, trackingEchoId, matchRadius, heightTolerance, requiresMatchDecision, draft, filteredPoints, nearbyPoints, busy, dirty, error, notice, search, monsterSearch, coordinateText, teleportCoordinateText, recovery, deleted, importPreview, versions } = storeToRefs(store)
const importFile = useTemplateRef<HTMLInputElement>('importFileRef')
const libraryButton = useTemplateRef<HTMLButtonElement>('libraryButtonRef')
const newButton = useTemplateRef<HTMLButtonElement>('newButtonRef')
const moreButton = useTemplateRef<HTMLButtonElement>('moreButtonRef')
const libraryPopover = useTemplateRef<InstanceType<typeof WuPopover>>('libraryPopoverRef')
const newPopover = useTemplateRef<InstanceType<typeof WuPopover>>('newPopoverRef')
const morePopover = useTemplateRef<InstanceType<typeof WuPopover>>('morePopoverRef')
const coordinatePasteExpanded = shallowRef(false)
const coordinateAxesExpanded = shallowRef(false)
const membersExpanded = shallowRef(false)
const navigationExpanded = shallowRef(false)
const teleportExpanded = shallowRef(false)
const matchSettingsExpanded = shallowRef(false)
const noteExpanded = shallowRef(false)
const mapCandidateIds = shallowRef<string[]>([])
const selectedQuery = useRouteQuery<string | undefined>('point', undefined, { mode: 'replace' })
const xQuery = useRouteQuery<string | undefined>('x', undefined, { mode: 'replace' })
const yQuery = useRouteQuery<string | undefined>('y', undefined, { mode: 'replace' })
const zoomQuery = useRouteQuery<string | undefined>('zoom', undefined, { mode: 'replace' })
const officialQuery = useRouteQuery<string | undefined>('official', undefined, { mode: 'replace' })
const trackingQuery = useRouteQuery<string | undefined>('tracking', undefined, { mode: 'replace' })
const radiusQuery = useRouteQuery<string | undefined>('radius', undefined, { mode: 'replace' })
const heightQuery = useRouteQuery<string | undefined>('matchHeight', undefined, { mode: 'replace' })
const floorStyleQuery = useRouteQuery<string | undefined>('floorStyle', 'icons', { mode: 'replace' })
const savedViewport = computed(() => {
  if (xQuery.value === undefined || yQuery.value === undefined || zoomQuery.value === undefined) return null
  const x = Number(xQuery.value), y = Number(yQuery.value), zoom = Number(zoomQuery.value)
  return [x, y, zoom].every(Number.isFinite) && zoom >= 0 && zoom <= 24 ? { center: [x, y] as [number, number], zoom } : null
})
const compactFloors = computed(() => floorStyleQuery.value !== 'list')
const echoes = computed(() => dataset.value?.echoes.filter((echo) => echo.name.includes(monsterSearch.value.trim())).slice(0, 30) ?? [])
const echoById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo])))
const verifiedCount = computed(() => library.value.points.filter(({ status }) => status === 'verified').length)
const existing = computed(() => library.value.points.some(({ id }) => id === draft.value?.id))
const hasMapPosition = computed(() => draft.value !== null && draft.value.coordinate.x !== null && draft.value.coordinate.y !== null)
const navigationSummary = computed(() => draft.value?.kind === 'navigation'
  ? `${NAVIGATION_NAMES[draft.value.navigationKind]} · ${MODE_NAMES[draft.value.mode]}`
  : '')
const libraryListPoints = computed(() => mapCandidateIds.value.length
  ? filteredPoints.value.filter(({ id }) => mapCandidateIds.value.includes(id))
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

function selectPoint(id: string): void {
  const previousId = draft.value?.id
  store.selectPoint(id)
  selectedQuery.value = existing.value ? draft.value?.id : undefined
  if (draft.value?.id !== previousId) resetDisclosures()
}
function selectMapPoint(id: string): void {
  if (store.discardEmptyMapDraft(id)) resetDisclosures()
  else selectPoint(id)
}
function selectMapPoints(ids: string[]): void {
  if (ids.length === 1 && ids[0]) {
    selectMapPoint(ids[0])
    return
  }
  mapCandidateIds.value = [...ids]
  libraryPopover.value?.show()
}
function toggleOfficial(checked: boolean): void {
  store.setOfficialVisible(checked)
  officialQuery.value = showOfficial.value ? undefined : '0'
}
function setTracking(value: WuSelectValue): void {
  store.setTrackingEcho(typeof value === 'string' ? value : '')
  trackingQuery.value = compactWikiEchoId(trackingEchoId.value)
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
  membersExpanded.value = false
  navigationExpanded.value = false
  teleportExpanded.value = false
  matchSettingsExpanded.value = false
  noteExpanded.value = false
}
function selectLibraryPoint(id: string, close: () => void): void {
  const fromMap = mapCandidateIds.value.length > 0
  close()
  if (fromMap) selectMapPoint(id)
  else selectPoint(id)
}
function openLibrary(): void {
  mapCandidateIds.value = []
  libraryPopover.value?.toggle()
}
function clearMapCandidates(): void {
  mapCandidateIds.value = []
}
function startNewPoint(kind: 'echo' | 'navigation', close: () => void): void {
  close()
  newPoint(kind)
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
function setNavigationKind(value: WuSelectValue): void {
  const parsed = navigationKindSchema.safeParse(value)
  if (parsed.success) store.setNavigationKind(parsed.data)
}
function setMode(value: WuSelectValue): void {
  const parsed = navigationModeSchema.safeParse(value)
  if (parsed.success) store.setMode(parsed.data)
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
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(library.value, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'echo-map-points.json'
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
onMounted(async () => {
  await store.load()
  store.setOfficialVisible(officialQuery.value !== '0')
  officialQuery.value = showOfficial.value ? undefined : '0'
  store.setMatchingDistance('radius', Number(radiusQuery.value ?? 30))
  store.setMatchingDistance('height', Number(heightQuery.value ?? 8))
  if (selectedQuery.value && !dirty.value) {
    if (library.value.points.some(({ id }) => id === selectedQuery.value)) store.selectPoint(selectedQuery.value)
    else selectedQuery.value = undefined
  }
  store.setTrackingEcho(parseWikiEchoId(trackingQuery.value) ?? '')
  trackingQuery.value = compactWikiEchoId(trackingEchoId.value)
  radiusQuery.value = matchRadius.value === 30 ? undefined : String(matchRadius.value)
  heightQuery.value = heightTolerance.value === 8 ? undefined : String(heightTolerance.value)
  floorStyleQuery.value = compactFloors.value ? undefined : 'list'
})
onBeforeRouteLeave(() => !dirty.value || window.confirm('当前修改尚未保存到点位库。离开后可恢复浏览器草稿，仍要离开吗？'))
useEventListener(window, 'beforeunload', (event) => {
  if (dirty.value) {
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
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-12px gap-y-2px"><RouterLink to="/" class="text-12px text-[#8eae9d]">← 地图</RouterLink><div class="text-16px font-600">点位录入</div><div class="text-11px text-[#7d9e8b]">人工 已核验 {{ verifiedCount }} · 草稿 {{ library.points.length - verifiedCount }} · 官方 {{ officialLibrary.points.length }}</div></div>
      <div class="flex flex-wrap gap-5px">
        <button :class="toolbarButtonClass" :disabled="busy" @click="store.load">刷新</button>
        <button :class="toolbarButtonClass" :disabled="busy || !dataset" @click="exportJson">导出</button>
        <button :class="toolbarButtonClass" :disabled="busy || !dataset" @click="importFile?.click()">导入</button>
        <button :class="toolbarButtonClass" :disabled="busy" @click="store.loadVersions">历史</button>
        <input ref="importFileRef" type="file" accept="application/json,.json" class="hidden" @change="importJson" />
      </div>
    </div>
    <div v-if="deleted" class="flex shrink-0 items-center gap-10px bg-[#192e25] px-20px py-8px text-13px"><span>点位已删除。</span><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.undoDelete)">撤销删除</button></div>
    <div v-if="importPreview && importSummary" class="shrink-0 border-b border-[#937544] bg-[#302b1c] p-16px text-13px">
      <div>替换预览：共 {{ importPreview.points.length }} 处，新增 {{ importSummary.added }}、修改 {{ importSummary.updated }}、移除 {{ importSummary.removed }}。保存前会保留当前版本。</div>
      <div class="mt-10px flex gap-8px"><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.applyImport)">确认替换点位库</button><button :class="buttonClass" :disabled="busy" @click="store.cancelImport">取消</button></div>
    </div>
    <WuScrollArea v-if="versions.length" class="max-h-160px shrink-0 border-b border-[var(--line)]" content-class="p-12px">
      <div class="mb-8px flex items-center justify-between text-13px"><span>历史版本 · 选择后预览差异</span><button :class="buttonClass" @click="store.closeVersions">收起</button></div>
      <button v-for="version in versions" :key="version.revision" :class="buttonClass" class="mb-6px mr-6px" :disabled="busy" @click="store.previewVersion(version.revision)">{{ new Date(version.savedAt).toLocaleString('zh-CN') }}</button>
    </WuScrollArea>
    <div v-if="dataset && draft" class="min-h-0 flex-1 lg:grid lg:grid-cols-[72px_minmax(240px,1fr)_340px] xl:grid-cols-[80px_minmax(300px,1fr)_360px]">
      <div class="flex shrink-0 gap-6px border-b border-[var(--line)] p-6px lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
        <button ref="libraryButtonRef" type="button" class="min-h-42px flex-1 rounded-6px border border-[var(--line)] bg-[#10241b] px-6px text-11px text-[#b9cfbf] lg:flex-none lg:px-3px" :disabled="busy" @click="openLibrary">点位库<span class="ml-4px text-[#6f9180] lg:ml-0 lg:block">{{ allPoints.length }}</span></button>
        <button ref="newButtonRef" type="button" class="min-h-42px flex-1 rounded-6px border border-[var(--line)] bg-[#142a22] px-6px text-11px text-[#c7dfd2] lg:flex-none lg:px-3px" :disabled="busy" @click="newPopover?.toggle()">＋ 新增</button>
        <WuPopover ref="libraryPopoverRef" :anchor="libraryButton" :width="compact ? 'viewport' : 320" :max-height="680" placement="bottom-start" class="border border-[#355748] rounded-9px bg-[#0d1e16] shadow-[0_18px_52px_rgba(0,0,0,0.5)]" @closed="clearMapCandidates">
          <template #default="{ close }">
            <div class="flex h-600px max-h-[calc(100vh-32px)] flex-col p-12px">
              <div class="flex items-center justify-between"><div class="text-14px font-600">{{ mapCandidateIds.length ? '此处点位' : '点位库' }} · {{ libraryListPoints.length }}</div><button type="button" class="h-30px w-30px border-0 bg-transparent text-18px text-[#91ae9e]" @click="close">×</button></div>
              <WuInput class="mt-8px" :model-value="search" type="search" placeholder="搜索怪物、坐标或备注" @update:model-value="store.setSearch" />
              <WuCheckBox :model-value="showOfficial" :disabled="busy" class="mt-7px flex min-h-32px items-center gap-7px text-12px text-[#9fbdad]" @update:model-value="toggleOfficial">显示官方点位</WuCheckBox>
              <WuScrollArea class="mt-8px min-h-0 flex-1">
                <div v-if="!libraryListPoints.length" class="py-24px text-center text-13px text-[#7e9e8d]">没有匹配的点位</div>
                <button v-for="point in libraryListPoints.slice(0, 100)" :key="point.id" type="button" class="mb-5px w-full rounded-7px border border-[var(--line)] bg-[#10241b] px-9px py-7px text-left" :class="point.id === draft.id ? 'border-[#65f1c2]' : ''" :disabled="busy" @click="selectLibraryPoint(point.id, close)">
                  <div class="truncate text-12px text-[#d0e4d9]">{{ pointTitle(point, dataset) }}</div>
                  <div class="mt-4px flex items-center justify-between gap-6px text-10px"><span :class="point.status === 'verified' ? 'text-[#77e5b6]' : 'text-[#d8b778]'">{{ point.status === 'imported' ? '官方' : point.status === 'verified' ? '已核验' : '草稿' }}</span><span class="truncate font-mono text-[#789788]">{{ Object.values(point.coordinate).map((value) => value ?? '—').join(', ') }}</span></div>
                </button>
                <div v-if="libraryListPoints.length > 100" class="py-8px text-11px text-[#7e9e8d]">仅显示前 100 处，请继续搜索缩小范围。</div>
              </WuScrollArea>
            </div>
          </template>
        </WuPopover>
        <WuPopover ref="newPopoverRef" :anchor="newButton" :width="160" placement="bottom-start" class="border border-[#355748] rounded-8px bg-[#10231c] p-5px shadow-[0_14px_42px_rgba(0,0,0,0.46)]">
          <template #default="{ close }">
            <button type="button" class="min-h-38px w-full border-0 rounded-5px bg-transparent px-9px text-left text-12px text-[#cce2d6] hover:bg-[#193329]" @click="startNewPoint('echo', close)">新增刷取点</button>
            <button type="button" class="min-h-38px w-full border-0 rounded-5px bg-transparent px-9px text-left text-12px text-[#cce2d6] hover:bg-[#193329]" @click="startNewPoint('navigation', close)">新增定位点</button>
          </template>
        </WuPopover>
      </div>
      <PointEditorMap
        :dataset="dataset" :points="allPoints" :draft="draft" :compact="compact" :compact-floors="compactFloors" :saved-viewport="savedViewport"
        class="h-340px lg:h-full" @point-selected="selectMapPoints" @position-picked="store.pickMapPosition"
        @viewport-changed="publishViewport" @floor-layout-toggled="toggleFloorLayout"
      />
      <WuScrollArea :unbounded="compact" class="min-h-0 border-t border-[var(--line)] bg-[#0d1e16] lg:border-l lg:border-t-0" content-class="p-12px pb-0">
        <div class="mb-12px flex items-center justify-between"><div class="text-16px font-600">{{ existing ? '编辑' : '新增' }}{{ draft.kind === 'echo' ? '刷取点' : '定位点' }}</div><span v-if="dirty || existing" class="text-11px" :class="dirty ? 'text-[#dcb77b]' : draft.status === 'verified' ? 'text-[#77e5b6]' : 'text-[#dcb77b]'">{{ dirty ? '未保存' : draft.status === 'verified' ? '已核验' : '草稿' }}</span></div>

        <div v-if="draft.kind === 'echo'" class="rounded-8px border border-[var(--line)] bg-[#142d22] p-9px">
          <div class="mb-5px text-12px text-[#a8cbb8]">追踪声骸</div>
          <WuSelect :model-value="trackingEchoId" :disabled="busy" @update:model-value="setTracking">
            <WuOption value="">未选择</WuOption>
            <WuOption v-for="echo in dataset.echoes" :key="echo.id" :value="echo.id">{{ echo.name }} · C{{ echo.cost }}</WuOption>
          </WuSelect>
          <button v-if="trackingEchoId && !draft.members.some(({ echoId }) => echoId === trackingEchoId)" type="button" class="mt-6px min-h-32px w-full rounded-5px border border-[var(--line)] bg-[#173328] text-11px text-[#bde2ce]" :disabled="busy" @click="store.addMember(trackingEchoId)">加入本次记录</button>
        </div>

        <div class="mt-8px rounded-8px border border-[var(--line)] p-9px">
          <div class="flex items-center justify-between gap-8px"><div class="text-12px font-600">{{ draft.kind === 'navigation' ? '图标点位坐标' : '实测坐标' }}</div><div class="flex gap-8px"><button type="button" class="border-0 bg-transparent p-0 text-11px text-[#83b69e]" @click="coordinatePasteExpanded = !coordinatePasteExpanded">粘贴 XYZ</button><button type="button" class="border-0 bg-transparent p-0 text-11px text-[#83b69e]" @click="coordinateAxesExpanded = !coordinateAxesExpanded">{{ coordinateAxesExpanded ? '收起' : '逐轴编辑' }}</button></div></div>
          <div v-if="!hasMapPosition || coordinatePasteExpanded" class="mt-7px flex gap-5px"><WuInput :model-value="coordinateText" :disabled="busy" placeholder="-497, 449, 18" @update:model-value="store.setCoordinateText" @confirm="applyCoordinateText" /><button type="button" class="min-h-36px shrink-0 rounded-6px border border-[var(--line)] bg-[#173328] px-9px text-12px text-[#c7dfd2]" :disabled="busy" @click="applyCoordinateText">应用</button></div>
          <div v-if="hasMapPosition && !coordinateAxesExpanded" class="mt-7px grid grid-cols-3 gap-6px"><div class="rounded-6px bg-[#10241b] px-8px py-6px text-10px text-[#789788]">X<span class="mt-2px block truncate font-mono text-12px text-[#c8ddd2]">{{ draft.coordinate.x }}</span></div><div class="rounded-6px bg-[#10241b] px-8px py-6px text-10px text-[#789788]">Y<span class="mt-2px block truncate font-mono text-12px text-[#c8ddd2]">{{ draft.coordinate.y }}</span></div><div class="text-10px text-[#789788]">Z<WuInput class="mt-2px font-mono" size="sm" inputmode="numeric" :model-value="draft.coordinate.z" :disabled="busy" @update:model-value="store.setCoordinate('z', $event)" /></div></div>
          <div v-if="coordinateAxesExpanded" class="mt-7px grid grid-cols-3 gap-6px"><div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="text-10px text-[#789788]">{{ axis.toUpperCase() }}<WuInput class="mt-2px font-mono" size="sm" inputmode="numeric" :model-value="draft.coordinate[axis]" :disabled="busy" @update:model-value="store.setCoordinate(axis, $event)" /></div></div>
        </div>

        <div v-if="draft.kind === 'echo' && (nearbyPoints.length || matchSettingsExpanded)" class="mt-8px rounded-8px border border-[#745f38] bg-[#261f14] p-9px">
          <div class="flex items-center justify-between"><div class="text-12px font-600">{{ nearbyPoints.length ? `附近找到 ${nearbyPoints.length} 处候选` : '匹配设置' }}</div><button type="button" class="border-0 bg-transparent p-0 text-11px text-[#c6a96f]" @click="matchSettingsExpanded = !matchSettingsExpanded">{{ matchSettingsExpanded ? '收起设置' : '设置范围' }}</button></div>
          <div v-if="matchSettingsExpanded" class="mt-7px grid grid-cols-2 gap-7px"><div class="text-10px text-[#aa9876]">XY 范围<WuInput type="number" min="1" max="500" :model-value="matchRadius" lazy @update:model-value="setMatchDistance('radius', $event)" /></div><div class="text-10px text-[#aa9876]">最大高度差<WuInput type="number" min="0" max="500" :model-value="heightTolerance" lazy @update:model-value="setMatchDistance('height', $event)" /></div></div>
          <template v-if="nearbyPoints.length">
            <div v-for="nearby in nearbyPoints.slice(0, 8)" :key="nearby.point.id" class="mt-7px rounded-6px bg-[#332a1a] p-8px"><div class="text-12px">{{ pointTitle(nearby.point, dataset) }}</div><div class="mt-3px font-mono text-10px text-[#b29e79]">{{ Object.values(nearby.point.coordinate).map((value) => value ?? '—').join(', ') }} · XY {{ nearby.distance.toFixed(1) }}</div><button v-if="!existing" type="button" class="mt-6px min-h-32px w-full rounded-5px border border-[#6e5936] bg-[#3b3020] text-11px text-[#e2c893]" :disabled="busy" @click="runDraftAction(() => store.appendToNearby(nearby.point.id))">追加到此点</button></div>
            <button v-if="requiresMatchDecision" type="button" class="mt-7px min-h-34px w-full rounded-5px border border-[#7b6741] bg-transparent text-11px text-[#e2c893]" @click="store.confirmSeparatePoint">这些都不是，建立独立点位</button>
          </template>
        </div>

        <div v-if="draft.kind === 'echo'" class="mt-8px rounded-8px border border-[var(--line)] p-9px">
          <button type="button" class="w-full flex items-center gap-9px border-0 bg-transparent p-0 text-left" @click="membersExpanded = !membersExpanded"><EchoPointIcon :members="draft.members" :echoes="dataset.echoes" /><span class="min-w-0 flex-1"><span class="block text-12px font-600">怪物清单</span><span class="mt-2px block text-11px text-[#789788]">{{ draft.members.length }} 种 · {{ draft.members.reduce((sum, member) => sum + member.count, 0) }} 只</span></span><span class="text-11px text-[#83b69e]">{{ membersExpanded ? '收起' : '管理' }}</span></button>
          <div v-if="membersExpanded" class="mt-9px border-t border-[var(--line)] pt-9px">
            <WuCheckBox :model-value="draft.compositionStatus === 'complete'" :disabled="busy" class="mb-8px flex min-h-32px items-center gap-7px text-11px text-[#a9c7b6]" @update:model-value="store.setCompositionComplete">怪物清单已补齐</WuCheckBox>
            <div v-for="member in draft.members" :key="member.echoId" class="mb-5px flex items-center gap-5px rounded-6px bg-[#152c22] px-7px py-5px"><img :src="echoById.get(member.echoId)?.iconUrl" class="h-28px w-28px object-contain" /><span class="min-w-0 flex-1 truncate text-11px">{{ echoById.get(member.echoId)?.name ?? member.echoId }}</span><div class="w-48px shrink-0"><WuInput size="sm" type="number" min="1" max="999" :model-value="member.count" :disabled="busy" @update:model-value="store.setMemberCount(member.echoId, Number($event))" /></div><button type="button" class="h-30px border-0 bg-transparent px-3px text-11px text-[#9dac9f]" :disabled="busy" @click="store.removeMember(member.echoId)">移除</button></div>
            <WuInput class="mt-6px" :model-value="monsterSearch" type="search" placeholder="搜索并添加怪物" @update:model-value="store.setMonsterSearch" />
            <WuScrollArea class="mt-6px max-h-180px" content-class="grid grid-cols-2 gap-5px"><button v-for="echo in echoes" :key="echo.id" type="button" class="flex min-h-40px items-center gap-5px rounded-5px border border-[var(--line)] bg-[#10251b] p-4px text-left" :disabled="busy" @click="store.addMember(echo.id)"><img :src="echo.iconUrl" class="h-26px w-26px object-contain" loading="lazy" /><span class="min-w-0 text-10px leading-relaxed">{{ echo.name }}<span class="block text-9px text-[#789788]">C{{ echo.cost }} ＋</span></span></button></WuScrollArea>
          </div>
        </div>

        <div v-else class="mt-8px rounded-8px border border-[var(--line)] p-9px">
          <div class="text-11px text-[#91ae9e]">名称<WuInput class="mt-4px" :model-value="draft.name" :disabled="busy" @update:model-value="store.setName" /></div>
          <button type="button" class="mt-7px min-h-42px w-full flex items-center justify-between rounded-6px border border-[var(--line)] bg-[#10241b] px-9px text-left" @click="navigationExpanded = !navigationExpanded"><span><span class="block text-10px text-[#789788]">定位设置</span><span class="mt-2px block text-12px text-[#c8ddd2]">{{ navigationSummary }}</span></span><span class="text-11px text-[#83b69e]">{{ navigationExpanded ? '收起' : '修改' }}</span></button>
          <div v-if="navigationExpanded" class="mt-7px grid grid-cols-2 gap-7px"><div><div class="mb-4px text-10px text-[#91ae9e]">定位点类型</div><WuSelect :model-value="draft.navigationKind" :disabled="busy" @update:model-value="setNavigationKind"><WuOption v-for="(name, kind) in NAVIGATION_NAMES" :key="kind" :value="kind">{{ name }}</WuOption></WuSelect></div><div><div class="mb-4px text-10px text-[#91ae9e]">传送能力</div><WuSelect :model-value="draft.mode" :disabled="busy" @update:model-value="setMode"><WuOption v-for="(name, mode) in MODE_NAMES" :key="mode" :value="mode">{{ name }}</WuOption></WuSelect></div></div>
          <template v-if="draft.mode === 'fast-travel'"><button type="button" class="mt-7px border-0 bg-transparent p-0 text-11px text-[#83b69e]" @click="teleportExpanded = !teleportExpanded">{{ teleportExpanded ? '收起传送落点' : '＋ 添加实际传送落点' }}</button><div v-if="teleportExpanded" class="mt-6px"><div class="flex gap-5px"><WuInput :model-value="teleportCoordinateText" :disabled="busy" placeholder="粘贴落点 XYZ" @update:model-value="store.setTeleportCoordinateText" @confirm="store.applyTeleportCoordinateText" /><button type="button" class="min-h-36px shrink-0 rounded-6px border border-[var(--line)] bg-[#173328] px-9px text-12px text-[#c7dfd2]" :disabled="busy" @click="store.applyTeleportCoordinateText">应用</button></div><div class="mt-6px grid grid-cols-3 gap-6px"><div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="text-10px text-[#789788]">{{ axis.toUpperCase() }}<WuInput class="mt-2px font-mono" size="sm" inputmode="numeric" :model-value="draft.teleportCoordinate?.[axis] ?? ''" :disabled="busy" @update:model-value="store.setTeleportCoordinate(axis, $event)" /></div></div></div></template>
        </div>

        <button v-if="!noteExpanded && !draft.note" type="button" class="mt-8px min-h-34px border border-dashed border-[var(--line)] rounded-6px bg-transparent text-11px text-[#83a996]" @click="noteExpanded = true">＋ 添加备注</button>
        <div v-else class="mt-8px rounded-7px border border-[var(--line)] p-9px"><div class="mb-4px flex items-center justify-between text-11px text-[#91ae9e]"><span>备注</span><button v-if="!draft.note" type="button" class="border-0 bg-transparent p-0 text-10px text-[#789788]" @click="noteExpanded = false">收起</button></div><WuInput :model-value="draft.note" :disabled="busy" placeholder="入口、地形、核验说明…" @update:model-value="store.setNote" /></div>

        <div class="sticky bottom-0 mt-10px flex gap-6px border-t border-[var(--line)] bg-[#0d1e16] py-10px">
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
    <div v-else class="flex flex-1 items-center justify-center p-40px text-14px text-[#91ae9e]">{{ busy ? '正在载入录入系统…' : '请通过本机开发服务打开录入系统，然后重新载入。' }}</div>
  </WuScrollArea>
</template>
