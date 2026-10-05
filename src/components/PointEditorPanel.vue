<script setup lang="ts">
import WuButton from './base/WuButton.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteQuery } from '@vueuse/router'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { isOfficialPoint, pointTitle } from '../domain/point-library.ts'
import type { AuthoredPoint } from '../domain/types.ts'
import { floorSelectOptions } from './floor-label.ts'
import EchoEditorFields from './EchoEditorFields.vue'
import NavigationEditorFields from './NavigationEditorFields.vue'
import PointCoordinateFields from './PointCoordinateFields.vue'
import PointEditorDataPanel from './PointEditorDataPanel.vue'
import PointDuplicateNotice from './PointDuplicateNotice.vue'
import PointManagementPanel from './PointManagementPanel.vue'
import { usePointManagementStore } from '../stores/point-management.ts'
import WuDialog from './base/WuDialog.vue'
import WuMessage from './base/WuMessage.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import { downloadJson } from '../utils/download-json.ts'

const props = defineProps<{
  locatePosition: (coordinate: [number, number]) => boolean
  isPositionInView: (coordinate: [number, number]) => boolean
}>()
const emit = defineEmits<{ returned: [], locateRequested: [coordinate?: [number, number]], managedLocateRequested: [point: AuthoredPoint] }>()
const explorer = useExplorerStore()
const store = usePointEditorStore()
const manager = usePointManagementStore()
const router = useRouter()
const managerQuery = useRouteQuery<string>('pointsManager', '', { mode: 'replace' })
const managerKind = useRouteQuery<string>('pointsKind', 'navigation', { mode: 'replace' })
const exportOpen = shallowRef(false)
const tabQuery = useRouteQuery<string>('editorTab', 'navigation', { mode: 'replace' })
let active = true
onBeforeUnmount(() => { active = false; store.resetPositionConfirmation() })
const { dataset, draft, library, importPreview, allPoints, editorMode, hasUnsavedChanges, editing, dirty, busy, operation, error, notice, continueAdding, canContinueAdding, availableFloors, pointLevelId } = storeToRefs(store)
const floorOptions = computed(() => floorSelectOptions(
  dataset.value?.states.find(({ id }) => id === draft.value?.stateId)?.layeredMaps ?? [],
  availableFloors.value,
))
const importFile = useTemplateRef<HTMLInputElement>('importFileRef')
const positionFields = useTemplateRef<InstanceType<typeof PointCoordinateFields>>('positionFieldsRef')
const candidates = shallowRef<string[]>([])
const pending = shallowRef<(() => void) | null>(null)
let resolveLeave: ((result: boolean) => void) | null = null
const existing = computed(() => library.value.points.some(({ id }) => id === draft.value?.id))
const candidatePoints = computed(() => allPoints.value.filter(({ id }) => candidates.value.includes(id)))
function returnToExplorer(): void {
  if (busy.value) return
  managerQuery.value = ''
  store.resetSession()
  emit('returned')
}
function syncLibrary(): void {
  explorer.setPointLibrary(store.library)
}
function exportJson(): void {
  const file = store.createPointExport(editorMode.value)
  downloadJson(file)
  if (file) exportOpen.value = false
}
function openManagement(): void {
  manager.reset()
  managerKind.value = editorMode.value
  managerQuery.value = 'open'
}
function editManagedPoint(id: string): void {
  managerQuery.value = ''
  selectPoint(id)
}
async function locateManagedPoint(point: AuthoredPoint): Promise<void> {
  await router.replace({ query: { ...router.currentRoute.value.query, pointsManager: undefined } })
  emit('managedLocateRequested', point)
}
async function importJson(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return
  const file = event.target.files?.[0]
  if (file) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('导入文件超过 10 MB')
      store.previewImport(await file.text())
    } catch (failure) { store.reportError(failure instanceof Error ? failure.message : String(failure)) }
  }
  event.target.value = ''
}

function closeDataManagement(): void {
  if (busy.value) return
  syncLibrary()
  store.cancelImport()
}
function requestAction(action: () => void): void {
  if (busy.value) return
  if (dirty.value) pending.value = action
  else action()
}
function cancelPending(): void {
  pending.value = null
  resolveLeave?.(false)
  resolveLeave = null
}
async function continuePending(save: boolean): Promise<void> {
  if (save && !await (resolveLeave ? store.saveAllForms() : store.savePoint({ continueAdding: false }))) {
    tabQuery.value = editorMode.value
    cancelPending()
    return
  }
  if (!save) {
    if (resolveLeave) store.discardAllForms()
    else store.discardChanges()
  }
  if (save) syncLibrary()
  const action = pending.value
  pending.value = null
  action?.()
}
function selectPoint(id: string): void {
  candidates.value = []
  if (editing.value && id === draft.value?.id) return
  const point = allPoints.value.find((point) => point.id === id)
  if (!point) return
  if (isOfficialPoint(point)) {
    store.selectPoint(id)
    return
  }
  switchTab(point.kind)
  requestAction(() => {
    store.selectPoint(id)
    })
}
function selectMapPoints(ids: string[]): void {
  if (ids.length === 1 && ids[0]) selectPoint(ids[0])
  else candidates.value = ids
}
function switchTab(kind: AuthoredPoint['kind']): void {
  store.switchEditorTab(kind)
  store.followMapState(explorer.selectedStateId)
  tabQuery.value = editorMode.value
}
async function save(): Promise<void> {
  if (await store.savePoint()) {
    syncLibrary()
  }
}
async function confirmPosition(coordinate: [number, number]): Promise<void> {
  if (busy.value || pending.value || importPreview.value) return
  const action = store.confirmPosition(props.isPositionInView(coordinate))
  if (action === 'locate') {
    props.locatePosition(coordinate)
  } else if (action === 'save') {
    await save()
    await nextTick()
    if (active) positionFields.value?.focus()
  }
}
async function deletePoint(): Promise<void> {
  await store.deletePoint()
  if (!error.value) {
    syncLibrary()
  }
}
function addPoint(kind: AuthoredPoint['kind'] = editorMode.value, coordinate?: [number, number]): void {
  if (busy.value) return
  switchTab(kind)
  requestAction(() => {
    store.newPoint(kind)
    store.initializeMapContext({ stateId: explorer.selectedStateId, levelId: explorer.selectedLevelId ?? undefined, gravityType: explorer.supportsGravity ? explorer.selectedGravity : undefined })
    if (coordinate) {
      store.setCoordinate('x', String(coordinate[0]))
      store.setCoordinate('y', String(coordinate[1]))
    }
  })
}
function addPointAt(request: { kind: AuthoredPoint['kind'], coordinate: [number, number] }): void {
  addPoint(request.kind, request.coordinate)
}
defineExpose({ selectMapPoints, addPointAt })
async function loadEditor(): Promise<void> {
  await store.load(tabQuery.value === 'echo' ? 'echo' : 'navigation')
  if (!active || store.error) return
  tabQuery.value = editorMode.value
  store.initializeMapContext({ stateId: explorer.selectedStateId, levelId: explorer.selectedLevelId ?? undefined, gravityType: explorer.supportsGravity ? explorer.selectedGravity : undefined })
}
onMounted(loadEditor)
onBeforeRouteUpdate((to) => {
  if (to.query.editorTab === tabQuery.value || !store.dataset || store.busy) return
  store.switchEditorTab(to.query.editorTab === 'echo' ? 'echo' : 'navigation')
  store.followMapState(explorer.selectedStateId)
})
onBeforeRouteLeave(() => {
  if (busy.value) return false
  if (!hasUnsavedChanges.value) return true
  return new Promise<boolean>((resolve) => {
    resolveLeave = resolve
    pending.value = () => { resolveLeave = null; resolve(true) }
  })
})
useEventListener(window, 'beforeunload', (event) => {
  if (hasUnsavedChanges.value) { event.preventDefault(); event.returnValue = '' }
})
</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col bg-[#0d1e16] text-[#d7eadf]">
    <WuMessage v-if="error" :message="error" type="error" @close="store.dismissMessage" />
    <WuMessage v-else-if="notice" :message="notice" @close="store.dismissMessage" />
    <div class="flex shrink-0 items-center justify-between gap-[10px] border-b border-[var(--line)] px-[16px] py-[10px]">
      <div class="flex items-center gap-[14px]"><WuButton variant="ghost" size="sm" icon="chevron-left" :disabled="busy" @click="returnToExplorer">返回</WuButton></div>
      <div class="flex items-center gap-[14px]">
        <WuButton variant="ghost" tone="accent" size="sm" :disabled="busy || !dataset" @click="openManagement">管理点位</WuButton>
        <WuButton variant="ghost" tone="accent" size="sm" :disabled="busy || !dataset || hasUnsavedChanges" :tooltip="hasUnsavedChanges ? '请先保存录入内容' : '导入点位'" @click="importFile?.click()">导入</WuButton>
        <WuButton variant="ghost" tone="accent" size="sm" :disabled="busy || !dataset" tooltip="导出修改或完整备份" @click="exportOpen = true">导出</WuButton>
      </div>
    </div>
    <input ref="importFileRef" type="file" accept="application/json,.json" class="hidden" @change="importJson" />
    <div v-if="dataset && draft" class="min-h-0 flex flex-1 flex-col">
        <div class="flex shrink-0 gap-[6px] border-b border-[var(--line)] p-[12px]">
          <WuButton v-for="tab in (['navigation', 'echo'] as const)" :key="tab" class="flex-1" :variant="editorMode === tab ? 'outline' : 'ghost'" :tone="editorMode === tab ? 'accent' : 'neutral'" :disabled="busy" @click="switchTab(tab)">{{ tab === 'navigation' ? '定位点' : '声骸点位' }}</WuButton>
        </div>
        <div class="flex shrink-0 items-center justify-between px-[18px] py-[14px]">
          <span class="text-[14px] font-semibold">{{ existing || draft.replacesOfficialIds?.length ? '编辑' : '新增' }}{{ draft.kind === 'echo' ? '声骸点位' : '定位点' }}</span>
          <WuButton variant="ghost" tone="accent" size="sm" :disabled="busy" @click="addPoint()">新增点位</WuButton>
        </div>
        <WuScrollArea class="min-h-0 flex-1" content-class="px-[18px] pb-[18px]">
          <div class="mb-[8px] flex items-center justify-between"><span class="text-[13px] font-semibold">位置</span><div class="flex gap-[10px]"><WuButton variant="ghost" tone="accent" size="sm" @click="emit('locateRequested')">定位</WuButton></div></div>
          <PointCoordinateFields :key="draft.id" ref="positionFieldsRef" @locate-requested="confirmPosition" />
          <WuSelect class="mt-[8px]" :model-value="pointLevelId" :disabled="busy || !availableFloors.length" @update:model-value="store.setLevel">
            <WuOption :value="null">主地图</WuOption>
            <WuOption v-for="floor in floorOptions" :key="floor.id" :value="floor.id">{{ floor.label }}</WuOption>
          </WuSelect>
          <EchoEditorFields v-if="draft.kind === 'echo'" :key="draft.id" />
          <NavigationEditorFields v-else :key="draft.id" />
        </WuScrollArea>
        <PointDuplicateNotice />
        <div class="flex shrink-0 items-center gap-[10px] border-t border-[var(--line)] p-[14px]">
          <WuButton v-if="existing" variant="ghost" tone="danger" :disabled="busy" :loading="operation === 'delete'" @click="deletePoint">删除</WuButton>
          <WuCheckBox v-if="canContinueAdding" class="flex min-h-[40px] items-center gap-[8px] text-[12px]" :model-value="continueAdding" :disabled="busy" @update:model-value="store.setContinueAdding">保存后继续新增</WuCheckBox>
          <WuButton class="ml-auto" variant="solid" tone="accent" :disabled="busy" :loading="operation === 'save' && !pending" @click="save">保存</WuButton>
        </div>
    </div>
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-[12px] text-[13px] text-[#91ae9e]"><span>{{ busy ? '正在加载…' : '加载失败' }}</span><WuButton v-if="!busy" @click="loadEditor">重试</WuButton></div>
    <WuDialog :open="managerQuery === 'open' && !!dataset" :dismissible="!busy" class="!w-[min(1100px,calc(100vw-32px))] max-sm:!m-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!max-w-none max-sm:!w-screen max-sm:!rounded-none" @dismiss-requested="managerQuery = ''">
      <PointManagementPanel v-if="managerQuery === 'open' && dataset" @close-requested="managerQuery = ''" @changed="syncLibrary" @edit-requested="editManagedPoint" @locate-requested="locateManagedPoint" />
    </WuDialog>
    <WuDialog :open="exportOpen" @dismiss-requested="exportOpen = false"><div class="p-[20px]">
      <div class="text-[16px] font-semibold">导出{{ editorMode === 'navigation' ? '定位点' : '声骸点位' }}</div>
      <div class="my-[12px] text-[13px] leading-6 text-[#91ae9e]">{{ store.storage === 'browser' ? '导出当前类别的本地修改，供维护方合并。完整备份包含两类点位的全部本地记录。' : '导出当前类别的已保存点位，或备份全部人工点位。' }}</div>
      <div v-if="hasUnsavedChanges" class="mb-[12px] text-[12px] text-[#dec594]">尚未保存的编辑不会导出。</div>
      <div v-if="error" class="mb-[12px] text-[12px] text-[#ffad9f]">{{ error }}</div>
      <div class="flex flex-wrap gap-[8px]"><WuButton tone="accent" variant="solid" @click="exportJson">{{ store.storage === 'browser' ? '导出修改' : '导出点位' }}</WuButton><WuButton @click="downloadJson(store.createPointExport(editorMode, undefined, true)); exportOpen = false">完整备份</WuButton><WuButton variant="ghost" @click="exportOpen = false">取消</WuButton></div>
    </div></WuDialog>
    <WuDialog :open="importPreview !== null" :dismissible="!busy" @dismiss-requested="closeDataManagement">
      <PointEditorDataPanel @close-requested="closeDataManagement" />
    </WuDialog>
    <WuDialog :open="pending !== null" :dismissible="!busy" @dismiss-requested="cancelPending"><div class="p-[20px]"><div class="mb-[16px] text-[14px]">当前修改尚未保存</div><div class="flex flex-wrap justify-end gap-[8px]"><WuButton :disabled="busy" @click="cancelPending">继续编辑</WuButton><WuButton :disabled="busy" @click="continuePending(false)">不保存</WuButton><WuButton variant="solid" tone="accent" :disabled="busy" :loading="operation === 'save'" @click="continuePending(true)">保存并继续</WuButton></div></div></WuDialog>
    <WuDialog :open="candidates.length > 1" @dismiss-requested="candidates = []"><div class="p-[16px]"><div class="mb-[12px] text-[14px]">选择此处点位</div><WuScrollArea class="max-h-[320px]"><button v-for="point in candidatePoints" :key="point.id" type="button" class="mb-[6px] min-h-[40px] w-full cursor-pointer rounded-[7px] border border-[var(--line)] bg-[#142a22] px-[12px] text-left text-[12px] text-[#c7dfd2] hover:bg-[#1c3b2d]" @click="selectPoint(point.id)">{{ dataset ? pointTitle(point, dataset) : '' }}{{ isOfficialPoint(point) ? ' · 官方只读' : '' }}</button></WuScrollArea></div></WuDialog>
  </div>
</template>
