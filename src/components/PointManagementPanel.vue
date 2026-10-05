<script setup lang="ts">
import { vTooltip } from './base/tooltip.ts'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEventListener, useMediaQuery, useResizeObserver } from '@vueuse/core'
import { useRouteQuery } from '@vueuse/router'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { usePointManagementStore } from '../stores/point-management.ts'
import type { PointManagementAction } from '../stores/point-management.ts'
import type { AuthoredPoint, LocalPointOperation, LocalPointStatus, PointManagementRow } from '../domain/types.ts'
import { localPointOperationSchema, localPointStatusSchema } from '../domain/schema.ts'
import { pointTitle, MODE_NAMES, NAVIGATION_NAMES } from '../domain/point-library.ts'
import { navigationPointTypes } from '../domain/navigation-point-types.ts'
import { pointRegionPath, pointRegionResolver } from '../domain/point-region.ts'
import type { PointRegion } from '../domain/point-region.ts'
import { gameToMapCoordinate } from '../map/projection.ts'
import { mapStateName } from '../route/route-groups.ts'
import { downloadJson } from '../utils/download-json.ts'
import { virtualListWindow } from '../utils/virtual-list.ts'
import { pointMapFilterCounts, pointMapFilterOptions, pointMapFilterSelection, pointMapScopeValues } from './point-map-options.ts'
import WuButton from './base/WuButton.vue'
import WuInput from './base/WuInput.vue'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import WuCascader from './base/WuCascader.vue'

const emit = defineEmits<{ closeRequested: []; editRequested: [id: string]; locateRequested: [point: AuthoredPoint]; changed: [] }>()
const editor = usePointEditorStore()
const manager = usePointManagementStore()
const { managedPoints, workspace, dataset, storage, busy, hasUnsavedChanges, error, notice, operation } = storeToRefs(editor)
const { search, selected, detailId, pending } = storeToRefs(manager)
const details = useTemplateRef<HTMLElement>('detailsRef')
const scrollArea = useTemplateRef<InstanceType<typeof WuScrollArea>>('scrollAreaRef')
const rows = useTemplateRef<HTMLElement>('rowsRef')
const viewport = computed(() => scrollArea.value?.viewport ?? null)
const desktop = useMediaQuery('(min-width: 768px)')
const rowHeight = computed(() => desktop.value ? 72 : storage.value === 'browser' ? 192 : 168)
const metrics = shallowRef({ top: 0, height: 0 })
const kindQuery = useRouteQuery<string>('pointsKind', 'navigation', { mode: 'replace' })
const mapQuery = useRouteQuery<string>('pointsMap', '', { mode: 'replace' })
const statusQuery = useRouteQuery<string>('pointsStatus', 'all', { mode: 'replace' })
const operationQuery = useRouteQuery<string>('pointsOperation', 'all', { mode: 'replace' })
const duplicateQuery = useRouteQuery<string>('pointsDuplicate', '0', { mode: 'replace' })
const kind = computed(() => kindQuery.value === 'echo' ? 'echo' : 'navigation')
const regions = computed(() => {
  const reference = dataset.value
  if (!reference) return new Map<string, PointRegion | null>()
  const resolve = pointRegionResolver(reference)
  return new Map(managedPoints.value.map(({ point }) => [point.id, resolve(point.stateId, gameToMapCoordinate(point.coordinate.x ?? 0, point.coordinate.y ?? 0, reference.source.tileWidth))]))
})
const operations: Record<LocalPointOperation, string> = { added: '新增点位', modified: '修改官方点位', deleted: '删除官方点位' }
const statuses: Record<LocalPointStatus, string> = { pending: '待收录', adopted: '已收录', conflict: '存在冲突', review: '待确认' }
const status = computed(() => localPointStatusSchema.safeParse(statusQuery.value).data ?? 'all')
const operationFilter = computed(() => localPointOperationSchema.safeParse(operationQuery.value).data ?? 'all')
const duplicatesOnly = computed(() => duplicateQuery.value === '1')
const statusLabel = (row: PointManagementRow) => row.status === 'published' ? '项目点位' : statuses[row.status]
const stateNames = computed(() => new Map(dataset.value?.states.map(state => [state.id, state.name]) ?? []))
const mapNames = computed(() => {
  const reference = dataset.value
  return new Map(reference?.states.map(state => [state.id, mapStateName(reference, state.id)]) ?? [])
})
const floorNames = computed(() => new Map(dataset.value?.states.flatMap(state => state.layeredMaps.flatMap(map => map.floors.map(floor => [floor.id, floor.name] as const))) ?? []))
const title = (point: AuthoredPoint) => dataset.value ? pointTitle(point, dataset.value) : point.id
const regionName = (point: AuthoredPoint) => pointRegionPath(regions.value.get(point.id) ?? null, point.stateId, mapNames.value.get(point.stateId) ?? String(point.stateId))
const floor = (point: AuthoredPoint) => point.levelId ? floorNames.value.get(point.levelId) ?? point.levelId : '主地图'
const coordinates = (point: AuthoredPoint) => `${point.coordinate.x}, ${point.coordinate.y}, ${point.coordinate.z}`
const availableRows = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return managedPoints.value.filter(row => row.point.kind === kind.value
    && (storage.value === 'project' || operationFilter.value === 'all' || row.operation === operationFilter.value)
    && (storage.value === 'project' || status.value === 'all' || row.status === status.value)
    && (storage.value === 'project' || !duplicatesOnly.value || row.duplicateIds.length > 0)
    && (!query || `${title(row.point)} ${regionName(row.point)} ${row.id} ${coordinates(row.point)} ${row.point.note ?? ''}`.toLocaleLowerCase().includes(query)))
})
const mapCounts = computed(() => pointMapFilterCounts(availableRows.value.map(row => row.point), regions.value))
const mapOptions = computed(() => dataset.value ? pointMapFilterOptions(dataset.value, mapCounts.value) : [])
const mapSelection = computed(() => pointMapFilterSelection(mapOptions.value, mapQuery.value))
const filtered = computed(() => availableRows.value.filter(row => pointMapScopeValues(row.point.stateId, regions.value.get(row.id) ?? null).includes(mapSelection.value.value)))
const listWindow = computed(() => virtualListWindow(filtered.value.length, rowHeight.value, metrics.value.top, metrics.value.height))
const visible = computed(() => filtered.value.slice(listWindow.value.start, listWindow.value.end))
const selectedIds = computed(() => new Set(selected.value))
const selectedRows = computed(() => filtered.value.filter(row => selectedIds.value.has(row.id)))
const allChecked = computed(() => filtered.value.length > 0 && selectedRows.value.length === filtered.value.length)
const partlyChecked = computed(() => !allChecked.value && selectedRows.value.length > 0)
const detail = computed(() => managedPoints.value.find(row => row.id === detailId.value))
const duplicatePoints = computed(() => {
  const ids = new Set(detail.value?.duplicateIds ?? [])
  return workspace.value?.published.points.filter(point => ids.has(point.id)) ?? []
})
const emptyMessage = computed(() => storage.value === 'browser'
  ? managedPoints.value.length ? '当前筛选下没有本地修改记录' : '还没有本地修改。可在地图上新增、编辑或删除点位。'
  : '当前范围没有点位')
const canChange = computed(() => !busy.value && !hasUnsavedChanges.value)
function measure(): void {
  if (!viewport.value || !rows.value) return
  metrics.value = {
    top: viewport.value.getBoundingClientRect().top - rows.value.getBoundingClientRect().top,
    height: viewport.value.clientHeight,
  }
}
useEventListener(viewport, 'scroll', measure, { passive: true })
useResizeObserver([viewport, rows, details], measure)
watch([filtered, desktop], async () => {
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = 0
  measure()
}, { flush: 'post' })
async function showDetail(id: string): Promise<void> {
  manager.showDetail(id)
  await nextTick()
  details.value?.scrollIntoView({ block: 'start' })
  measure()
}
const actionLabels: Record<PointManagementAction, string> = { delete: '删除所选点位', published: '撤销本地修改，使用网站版本', local: '确认保留本地版本', cleanup: '清理已收录的本地副本' }
const actionNotes: Record<PointManagementAction, string> = {
  delete: '本地新增点将被移除；已发布点会记为本地删除。网站数据不会被修改。',
  published: '所选记录的本地修改将被移除；网站没有的本地新增点也会被移除。',
  local: '以网站当前内容作为新的对比基准，保留你的版本。之后可以导出这些修改。',
  cleanup: '仅移除与网站版本完全一致的本地修改记录，点位继续使用网站数据。',
}
const comparison = computed(() => {
  if (!detail.value) return []
  const values = (point: AuthoredPoint | null): Record<string, string> => point ? {
    '点位': title(point), '类型': point.kind === 'navigation' ? point.pointType ? navigationPointTypes[point.pointType].name : NAVIGATION_NAMES[point.navigationKind] : '声骸点位',
    '地图': stateNames.value.get(point.stateId) ?? String(point.stateId), '楼层': floor(point),
    '坐标 XYZ': coordinates(point), '重力': point.gravityType === 2 ? '反重力' : point.gravityType === 1 ? '正常重力' : '未标记',
    '传送模式': point.kind === 'navigation' ? MODE_NAMES[point.mode] : '—',
    '传送落点': point.kind === 'navigation' && point.teleportCoordinate ? Object.values(point.teleportCoordinate).join(', ') : '—',
    '图标': point.kind === 'navigation' ? point.iconId ?? '—' : '—',
    '声骸清单': point.kind === 'echo' ? point.compositionStatus === 'complete' ? '完整' : '部分' : '—',
    '替代官方点': point.replacesOfficialIds?.join(', ') ?? '—',
    '备注': point.note || '—',
  } : { '点位': '无此点位 / 已删除' }
  const versions = [values(detail.value.status === 'published' ? detail.value.published : detail.value.before), values(detail.value.local), values(detail.value.published)]
  return [...new Set(versions.flatMap(value => Object.keys(value)))].map(label => ({ label, values: versions.map(value => value[label] ?? '—') }))
})
function filter(field: 'kind' | 'map' | 'status' | 'operation' | 'duplicate', value: string | number | null): void {
  if (field === 'kind') kindQuery.value = value === 'echo' ? 'echo' : 'navigation'
  else if (field === 'map') mapQuery.value = String(value ?? '')
  else if (field === 'operation') operationQuery.value = String(value ?? 'all')
  else if (field === 'duplicate') duplicateQuery.value = value === '1' ? '1' : '0'
  else statusQuery.value = String(value ?? 'all')
  manager.resetSelection()
}
function request(action: PointManagementAction, ids = selectedRows.value.map(row => row.id)): void {
  if (canChange.value && ids.length) manager.requestAction(action, ids)
}
async function confirm(): Promise<void> {
  if (!pending.value) return
  if (await editor.managePoints(pending.value.ids, pending.value.action)) {
    manager.resetSelection()
    emit('changed')
  }
}
async function refresh(): Promise<void> {
  if (await editor.refreshPublishedPoints()) { manager.resetSelection(); emit('changed') }
}
function exportChanges(): void {
  downloadJson(editor.createPointExport(kind.value, (selectedRows.value.length ? selectedRows.value : filtered.value).map(row => row.id)))
}
</script>

<template>
  <div class="flex h-[min(820px,calc(100dvh-48px))] flex-col max-sm:h-dvh">
    <div class="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-[20px] py-[14px]">
      <div><div class="text-[18px] font-semibold">{{ storage === 'browser' ? '本地点位管理' : '项目点位管理' }}</div><div class="mt-[4px] text-[12px] text-[#91ae9e]">{{ storage === 'browser' ? '仅显示本地新增、修改和删除记录' : '管理当前项目已保存的人工点位' }}</div></div>
      <WuButton variant="ghost" :disabled="busy" @click="emit('closeRequested')">关闭</WuButton>
    </div>
    <div class="flex shrink-0 flex-wrap gap-[8px] p-[14px]">
      <WuSelect class="!w-[130px]" :model-value="kind" @update:model-value="filter('kind', $event)"><WuOption value="navigation">定位点</WuOption><WuOption value="echo">声骸点位</WuOption></WuSelect>
      <div class="min-w-0 w-[180px] grow sm:w-[220px]">
        <WuCascader
          :options="mapOptions" :selected-value="mapSelection.value" :initial-expanded-values="mapSelection.expandedValues"
          :placeholder="mapSelection.label" root-label="一级地区" compact :popover-gap="6"
          class="!justify-between !text-[11px] !shadow-none [--wu-cascader-height:38px] [--wu-cascader-padding:11px]"
          @select="filter('map', $event)"
        >
          <template #header="{ close }">
            <div class="flex shrink-0 items-center justify-between gap-[12px] border-b border-[var(--line)] px-[10px] py-[6px]">
              <span class="text-[12px] text-[#91ae9e]">地图 / 地区</span>
              <WuButton size="sm" variant="ghost" tone="accent" @click="filter('map', ''); close()">全部</WuButton>
            </div>
          </template>
        </WuCascader>
      </div>
      <WuSelect v-if="storage === 'browser'" class="!w-[140px]" :model-value="operationFilter" @update:model-value="filter('operation', $event)"><WuOption value="all">全部操作类型</WuOption><WuOption v-for="(label, value) in operations" :key="value" :value="value">{{ label }}</WuOption></WuSelect>
      <WuSelect v-if="storage === 'browser'" class="!w-[130px]" :model-value="status" @update:model-value="filter('status', $event)"><WuOption value="all">全部同步状态</WuOption><WuOption v-for="(label, value) in statuses" :key="value" :value="value">{{ label }}</WuOption></WuSelect>
      <WuInput class="min-w-[160px] flex-1" :model-value="search" placeholder="搜索名称、坐标或备注" @update:model-value="manager.setSearch" />
      <WuButton :disabled="!canChange" :loading="operation === 'load'" @click="refresh">检查更新</WuButton>
      <WuCheckBox v-if="storage === 'browser'" class="flex items-center gap-[6px] text-[12px] text-[#91ae9e]" :model-value="duplicatesOnly" @update:model-value="filter('duplicate', $event ? '1' : '0')">仅疑似重复</WuCheckBox>
    </div>
    <div v-if="hasUnsavedChanges" class="px-[16px] pb-[10px] text-[12px] text-[#dec594]">请先保存编辑表单；导出仅包含已保存内容。</div>
    <div v-if="error || notice" class="px-[16px] pb-[10px] text-[13px]" :class="error ? 'text-[#ffad9f]' : 'text-[#91ae9e]'">{{ error || notice }}</div>
    <WuScrollArea ref="scrollAreaRef" class="min-h-0 flex-1" content-class="flex flex-col px-[14px] pb-[14px] [overflow-anchor:none]">
      <template v-if="!desktop">
        <WuCheckBox class="mb-[10px] flex items-center gap-[8px] text-[12px] text-[#91ae9e]" :model-value="allChecked" :indeterminate="partlyChecked" @update:model-value="manager.selectMany(filtered.map(row => row.id), $event)">全选当前筛选结果</WuCheckBox>
        <div ref="rowsRef" class="relative shrink-0" :style="{ height: `${listWindow.height}px` }">
          <div class="absolute inset-x-0 top-0" :style="{ transform: `translateY(${listWindow.before}px)` }">
            <div v-for="row in visible" :key="row.id" :style="{ height: `${rowHeight}px` }" class="pb-[8px]">
              <div class="h-full overflow-hidden rounded-[8px] border border-[var(--line)] p-[12px]">
                <div class="flex items-center gap-[10px]"><WuCheckBox :model-value="selectedIds.has(row.id)" @update:model-value="manager.toggle(row.id, $event)" /><span class="min-w-0 flex-1 truncate text-[14px]" v-tooltip="title(row.point)">{{ title(row.point) }}</span><span class="shrink-0 text-[12px] text-[#dec594]">{{ statusLabel(row) }}</span></div>
                <div v-if="row.operation" class="mt-[8px] text-[12px] text-[#d7eadf]">{{ operations[row.operation] }}</div>
                <div class="mt-[8px] text-[12px] leading-6 text-[#91ae9e]"><div class="truncate" v-tooltip="`${regionName(row.point)} · ${floor(row.point)}`">{{ regionName(row.point) }} · {{ floor(row.point) }}</div><div class="flex gap-[10px]"><span class="min-w-0 truncate" v-tooltip="coordinates(row.point)">{{ coordinates(row.point) }}</span><span v-if="row.duplicateIds.length" class="shrink-0 text-[#dec594]">疑似重复 {{ row.duplicateIds.length }}</span></div></div>
                <div class="mt-[8px] flex gap-[8px]"><WuButton size="sm" @click="emit('locateRequested', row.point)">定位</WuButton><WuButton size="sm" :disabled="!row.local || busy" @click="emit('editRequested', row.id)">编辑</WuButton><WuButton size="sm" tone="accent" @click="showDetail(row.id)">详情</WuButton></div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="shrink-0 overflow-x-auto">
        <table class="w-full min-w-[860px] table-fixed border-collapse text-left text-[13px] leading-[18px]">
          <colgroup><col class="w-[36px]" /><col /><col class="w-[240px]" /><col v-if="storage === 'browser'" class="w-[112px]" /><col class="w-[120px]" /><col class="w-[174px]" /></colgroup>
          <thead class="text-[#91ae9e]"><tr class="border-b border-[var(--line)]"><th class="p-[10px]"><WuCheckBox v-tooltip="'全选当前筛选结果'" :model-value="allChecked" :indeterminate="partlyChecked" @update:model-value="manager.selectMany(filtered.map(row => row.id), $event)" /></th><th class="p-[10px]">点位 / 坐标</th><th class="p-[10px]">地图 / 楼层</th><th v-if="storage === 'browser'" class="p-[10px]">操作类型</th><th class="p-[10px]">{{ storage === 'browser' ? '同步状态' : '状态' }}</th><th class="p-[10px]">管理</th></tr></thead>
          <tbody ref="rowsRef">
            <tr v-if="listWindow.before"><td :colspan="storage === 'browser' ? 6 : 5" class="border-0 p-0" :style="{ height: `${listWindow.before}px` }" /></tr>
            <tr v-for="row in visible" :key="row.id" class="border-b border-[var(--line)]" :style="{ height: `${rowHeight}px` }" :class="detailId === row.id ? 'bg-[#1b392d]' : 'hover:bg-[#173025]'">
            <td class="p-[10px]"><WuCheckBox :model-value="selectedIds.has(row.id)" @update:model-value="manager.toggle(row.id, $event)" /></td>
            <td class="p-[10px]"><div class="truncate" v-tooltip="title(row.point)">{{ title(row.point) }}</div><div class="mt-[4px] truncate text-[12px] text-[#91ae9e]" v-tooltip="coordinates(row.point)">{{ coordinates(row.point) }}</div></td>
            <td class="p-[10px]"><div class="truncate" v-tooltip="regionName(row.point)">{{ regionName(row.point) }}</div><div class="mt-[4px] truncate text-[12px] text-[#91ae9e]" v-tooltip="floor(row.point)">{{ floor(row.point) }}</div></td>
            <td v-if="storage === 'browser'" class="whitespace-nowrap p-[10px]">{{ row.operation ? operations[row.operation] : '' }}</td>
            <td class="p-[10px]"><span :class="row.status === 'conflict' || row.status === 'review' ? 'text-[#dec594]' : 'text-[#91ae9e]'">{{ statusLabel(row) }}</span><div v-if="row.duplicateIds.length" class="mt-[4px] text-[12px] text-[#dec594]">疑似重复 {{ row.duplicateIds.length }}</div></td>
            <td class="p-[10px]"><div class="flex gap-[8px]"><WuButton size="sm" variant="ghost" @click="emit('locateRequested', row.point)">定位</WuButton><WuButton size="sm" variant="ghost" :disabled="!row.local || busy" @click="emit('editRequested', row.id)">编辑</WuButton><WuButton size="sm" variant="ghost" tone="accent" @click="showDetail(row.id)">详情</WuButton></div></td>
            </tr>
            <tr v-if="listWindow.after"><td :colspan="storage === 'browser' ? 6 : 5" class="border-0 p-0" :style="{ height: `${listWindow.after}px` }" /></tr>
          </tbody>
        </table>
      </div>
      <div v-if="!filtered.length" class="py-[60px] text-center text-[14px] text-[#91ae9e]">{{ emptyMessage }}</div>
      <div v-if="detail" ref="detailsRef" class="order-first mb-[18px] rounded-[8px] border border-[var(--line)] bg-[#0b1e17] p-[14px]">
        <div class="flex items-center justify-between gap-[8px]"><span class="font-semibold">{{ title(detail.point) }} · 版本对比</span><WuButton variant="ghost" size="sm" @click="manager.showDetail(null)">收起</WuButton></div>
        <div class="mt-[6px] break-all text-[11px] text-[#91ae9e]">{{ detail.id }}</div>
        <div v-if="detail.status === 'review'" class="mt-[10px] text-[12px] text-[#dec594]">旧快照缺少修改前的版本，请核对网站内容后选择保留哪一版。</div>
        <div class="mt-[12px] overflow-x-auto"><table class="w-full min-w-[650px] table-fixed text-left text-[12px]"><thead><tr><th class="w-[90px] p-[8px]">字段</th><th class="p-[8px]">{{ detail.status === 'review' ? '首次对比参考' : '修改前' }}</th><th class="p-[8px]">本地版本</th><th class="p-[8px]">网站版本</th></tr></thead><tbody><tr v-for="field in comparison" :key="field.label" class="border-t border-[var(--line)]"><td class="p-[8px] text-[#91ae9e]">{{ field.label }}</td><td v-for="(value, index) in field.values" :key="index" class="break-all p-[8px]" :class="field.values[1] !== field.values[2] && index > 0 ? 'text-[#dec594]' : ''">{{ value }}</td></tr></tbody></table></div>
        <div v-if="duplicatePoints.length" class="mt-[12px] text-[12px] text-[#dec594]">
          <div>附近的已发布点位，仅供核对：</div>
          <div v-for="point in duplicatePoints" :key="point.id" class="mt-[8px] flex flex-wrap items-center gap-[8px]"><span>{{ title(point) }} · {{ floor(point) }} · {{ coordinates(point) }}</span><WuButton size="sm" @click="emit('locateRequested', point)">定位</WuButton></div>
          <div class="mt-[8px]">距离接近仅作为提示，请核对后再移除本地新增点。</div>
        </div>
        <div v-if="storage === 'browser' && detail.status !== 'published'" class="mt-[14px] flex flex-wrap gap-[8px]">
          <WuButton v-if="detail.status === 'adopted'" :disabled="!canChange" @click="request('cleanup', [detail.id])">清理本地副本</WuButton>
          <WuButton v-else :disabled="!canChange" @click="request('published', [detail.id])">{{ detail.published ? '使用网站版本' : '移除本地记录' }}</WuButton>
          <WuButton v-if="detail.status === 'conflict' || detail.status === 'review'" :disabled="!canChange" tone="accent" @click="request('local', [detail.id])">保留本地版本</WuButton>
        </div>
      </div>
    </WuScrollArea>
    <div class="shrink-0 border-t border-[var(--line)] p-[14px]">
      <div v-if="pending" class="mb-[12px] rounded-[8px] border border-[#745f38] bg-[#261f14] p-[12px]"><div class="text-[13px]">{{ actionLabels[pending.action] }} · {{ pending.ids.length }} 条</div><div class="mt-[6px] text-[12px] text-[#dec594]">{{ storage === 'project' && pending.action === 'delete' ? '将从项目文件删除所选点位。' : actionNotes[pending.action] }}可先导出完整备份。</div><div class="mt-[10px] flex gap-[8px]"><WuButton :disabled="!canChange" tone="danger" @click="confirm">确认操作</WuButton><WuButton :disabled="busy" @click="manager.cancelAction">取消</WuButton></div></div>
      <div class="flex flex-wrap items-center gap-[8px] text-[12px] text-[#91ae9e]">
        <span>共 {{ filtered.length }} 条 · 已选 {{ selectedRows.length }} 条</span>
      </div>
      <div class="mt-[12px] flex flex-wrap gap-[8px]">
        <WuButton size="sm" tone="danger" :disabled="!canChange || !selectedRows.some(row => row.local)" @click="request('delete')">删除所选</WuButton>
        <WuButton v-if="storage === 'browser'" size="sm" :disabled="!canChange || !selectedRows.some(row => row.status !== 'published')" @click="request('published')">撤销所选修改</WuButton>
        <WuButton v-if="storage === 'browser'" size="sm" :disabled="!canChange || !selectedRows.some(row => row.status === 'adopted')" @click="request('cleanup')">清理已收录</WuButton>
        <WuButton class="sm:ml-auto" size="sm" :disabled="busy" @click="downloadJson(editor.createPointExport(kind, undefined, true))">完整备份</WuButton>
        <WuButton size="sm" variant="solid" tone="accent" :disabled="busy || !filtered.length" @click="exportChanges">{{ selectedRows.length ? '导出所选' : '导出当前范围' }}{{ storage === 'browser' ? '修改' : '点位' }}</WuButton>
      </div>
    </div>
  </div>
</template>
