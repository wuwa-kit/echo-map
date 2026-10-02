<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteQuery } from '@vueuse/router'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { pointTitle } from '../domain/point-library.ts'
import type { AuthoredPoint } from '../domain/types.ts'
import EchoEditorFields from './EchoEditorFields.vue'
import NavigationEditorFields from './NavigationEditorFields.vue'
import PointCoordinateFields from './PointCoordinateFields.vue'
import PointEditorDataPanel from './PointEditorDataPanel.vue'
import WuDialog from './base/WuDialog.vue'
import WuMessage from './base/WuMessage.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import { useExplorerStore } from '../stores/explorer.ts'

const emit = defineEmits<{ returned: [], locateRequested: [] }>()
const explorer = useExplorerStore()
const store = usePointEditorStore()
const tabQuery = useRouteQuery<string>('editorTab', 'navigation', { mode: 'replace' })
let active = true
onBeforeUnmount(() => { active = false })
const { dataset, draft, library, importPreview, allPoints, editorMode, hasUnsavedChanges, editing, dirty, busy, error, notice, recovery, deleted } = storeToRefs(store)
const { start: expireUndo } = useTimeoutFn(store.dismissDeleted, 8000, { immediate: false })
const importFile = useTemplateRef<HTMLInputElement>('importFileRef')
const candidates = shallowRef<string[]>([])
const pending = shallowRef<(() => void) | null>(null)
let resolveLeave: ((result: boolean) => void) | null = null
const existing = computed(() => library.value.points.some(({ id }) => id === draft.value?.id))
const candidatePoints = computed(() => allPoints.value.filter(({ id }) => candidates.value.includes(id)))
const buttonClass = 'min-h-38px rounded-7px border border-[var(--line)] bg-[#142a22] px-12px text-12px text-[#c7dfd2] disabled:opacity-40'
const primaryClass = 'min-h-40px rounded-7px border-0 bg-[#65f1c2] px-16px text-13px text-[#092519] font-600 disabled:opacity-40'
function returnToExplorer(): void {
  if (busy.value) return
  store.resetSession()
  emit('returned')
}
function syncLibrary(): void {
  explorer.setPointLibrary(store.library)
}
function exportJson(): void {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(library.value, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'echo-map-points.json'
  link.click()
  URL.revokeObjectURL(url)
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
  if (save && !await (resolveLeave ? store.saveAllForms() : store.savePoint())) {
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
  if (point.status === 'imported') {
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
  tabQuery.value = editorMode.value
}
async function save(): Promise<void> {
  if (await store.savePoint()) {
    syncLibrary()
    }
}
function undoDelete(): void {
  if (!deleted.value) return
  switchTab(deleted.value.kind)
  requestAction(() => { void store.undoDelete().then(syncLibrary) })
}
async function deletePoint(): Promise<void> {
  await store.deletePoint()
  if (!error.value) {
    syncLibrary()
    expireUndo()
  }
}
function addPointAt(request: { kind: AuthoredPoint['kind'], coordinate: [number, number] }): void {
  if (busy.value) return
  switchTab(request.kind)
  requestAction(() => {
    store.newPoint(request.kind)
    store.initializeMapContext({ stateId: explorer.selectedStateId, countryId: explorer.selectedCountryId ?? undefined, levelId: explorer.selectedLevelId ?? undefined, gravityType: explorer.supportsGravity ? explorer.selectedGravity : undefined })
    store.setCoordinate('x', String(request.coordinate[0]))
    store.setCoordinate('y', String(request.coordinate[1]))
  })
}
defineExpose({ selectMapPoints, addPointAt })
onMounted(async () => {
  await store.load()
  if (!active || store.error) return
  switchTab(tabQuery.value === 'echo' ? 'echo' : 'navigation')
  store.initializeMapContext({ stateId: explorer.selectedStateId, countryId: explorer.selectedCountryId ?? undefined, levelId: explorer.selectedLevelId ?? undefined, gravityType: explorer.supportsGravity ? explorer.selectedGravity : undefined })
})
onBeforeRouteUpdate((to) => {
  if (to.query.editorTab === tabQuery.value || !store.dataset || store.busy) return
  store.switchEditorTab(to.query.editorTab === 'echo' ? 'echo' : 'navigation')
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
    <WuMessage v-if="error" :message="error" type="error" :duration="0" @close="store.dismissMessage" />
    <WuMessage v-else-if="notice" :message="notice" @close="store.dismissMessage" />
    <div class="flex shrink-0 items-center justify-between gap-10px border-b border-[var(--line)] px-16px py-10px">
      <div class="flex items-center gap-14px"><button type="button" class="border-0 bg-transparent p-0 text-12px text-[#8eae9d]" :disabled="busy" @click="returnToExplorer">← 返回</button></div>
      <div class="flex items-center gap-14px">
        <button type="button" class="border-0 bg-transparent p-0 text-12px text-[#9cceba] disabled:opacity-40" :disabled="busy || !dataset || hasUnsavedChanges" :title="hasUnsavedChanges ? '请先保存录入内容' : '导入点位'" @click="importFile?.click()">导入</button>
        <button type="button" class="border-0 bg-transparent p-0 text-12px text-[#9cceba] disabled:opacity-40" :disabled="busy || !dataset" title="导出已保存的点位" @click="exportJson">导出</button>
      </div>
    </div>
    <input ref="importFileRef" type="file" accept="application/json,.json" class="hidden" @change="importJson" />
    <div v-if="deleted" class="flex shrink-0 items-center gap-10px px-16px py-6px text-12px"><span>点位已删除</span><button :class="buttonClass" :disabled="busy" @click="undoDelete">撤销</button></div>
    <div v-if="dataset && draft" class="min-h-0 flex flex-1 flex-col">
        <div class="flex shrink-0 gap-6px border-b border-[var(--line)] p-12px">
          <button v-for="tab in (['navigation', 'echo'] as const)" :key="tab" type="button" class="min-h-40px flex-1 rounded-7px border-0 text-13px" :class="editorMode === tab ? 'bg-[#204b3b] text-[#8fffd4] font-600' : 'bg-transparent text-[#91ae9e]'" :disabled="busy" @click="switchTab(tab)">{{ tab === 'navigation' ? '定位点' : '声骸点位' }}</button>
        </div>
        <div class="flex shrink-0 items-center justify-between px-18px py-14px"><span class="text-14px font-600">{{ existing || draft.replacesOfficialIds?.length ? '编辑' : '新增' }}{{ draft.kind === 'echo' ? '声骸点位' : '定位点' }}</span></div>
        <WuScrollArea class="min-h-0 flex-1" content-class="px-18px pb-18px">
          <div class="mb-8px flex items-center justify-between"><span class="text-13px font-600">位置</span><div class="flex gap-10px"><button type="button" class="border-0 bg-transparent p-0 text-12px text-[#9cceba]" @click="emit('locateRequested')">定位</button></div></div>
          <PointCoordinateFields :key="draft.id" />
          <EchoEditorFields v-if="draft.kind === 'echo'" :key="draft.id" />
          <NavigationEditorFields v-else :key="draft.id" />
        </WuScrollArea>
        <div class="flex shrink-0 items-center gap-10px border-t border-[var(--line)] p-14px">
          <button v-if="existing" type="button" class="min-h-40px border-0 bg-transparent px-5px text-12px text-[#d6a99a]" :disabled="busy" @click="deletePoint">删除</button>
          <span class="flex-1 text-11px text-[#789788]">{{ dirty ? '未保存' : existing ? '已保存' : '' }}</span>
          <button type="button" :class="primaryClass" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存' }}</button>
        </div>
    </div>
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-12px text-13px text-[#91ae9e]"><span>{{ busy ? '正在加载…' : '加载失败' }}</span><button v-if="!busy" :class="buttonClass" @click="store.load">重试</button></div>
    <WuDialog :open="importPreview !== null" :dismissible="!busy" @dismiss-requested="closeDataManagement">
      <PointEditorDataPanel @close-requested="closeDataManagement" />
    </WuDialog>
    <WuDialog :open="pending !== null" :dismissible="!busy" @dismiss-requested="cancelPending"><div class="p-20px"><div class="mb-16px text-14px">当前修改尚未保存</div><div class="flex flex-wrap justify-end gap-8px"><button :class="buttonClass" :disabled="busy" @click="cancelPending">继续编辑</button><button :class="buttonClass" :disabled="busy" @click="continuePending(false)">不保存</button><button :class="primaryClass" :disabled="busy" @click="continuePending(true)">保存并继续</button></div></div></WuDialog>
    <WuDialog :open="recovery !== null" @dismiss-requested="store.dismissRecovery"><div class="p-20px"><div class="mb-16px text-14px">发现上次未保存的编辑</div><div class="flex justify-end gap-8px"><button :class="buttonClass" @click="store.dismissRecovery">忽略</button><button :class="primaryClass" @click="store.recoverDraft">继续编辑</button></div></div></WuDialog>
    <WuDialog :open="candidates.length > 1" @dismiss-requested="candidates = []"><div class="p-16px"><div class="mb-12px text-14px">选择此处点位</div><WuScrollArea class="max-h-320px"><button v-for="point in candidatePoints" :key="point.id" :class="buttonClass" class="mb-6px w-full text-left" @click="selectPoint(point.id)">{{ dataset ? pointTitle(point, dataset) : '' }}{{ point.status === 'imported' ? ' · 官方只读' : '' }}</button></WuScrollArea></div></WuDialog>
  </div>
</template>
