<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef } from 'vue'
import { usePointEditorStore } from '../stores/point-editor.ts'
import PointDuplicateList from './PointDuplicateList.vue'
import WuPopover from './base/WuPopover.vue'
import WuDialog from './base/WuDialog.vue'
import WuButton from './base/WuButton.vue'

const store = usePointEditorStore()
const anchor = useTemplateRef<HTMLButtonElement>('anchorRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const count = computed(() => store.duplicateCandidates.filter(({ suspicious }) => suspicious).length)
const summary = computed(() => !store.duplicateTarget ? ''
  : count.value ? `疑似重复 · ${count.value}`
    : store.duplicateCandidates.length ? `附近点位 · ${store.duplicateCandidates.length}`
      : '')
function confirmWithEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat || event.isComposing || event.keyCode === 229 || !store.duplicateConfirmation) return
  store.confirmDuplicate(true)
}
onBeforeUnmount(() => store.confirmDuplicate(false))
</script>

<template>
  <button v-if="summary" ref="anchorRef" type="button" class="flex h-[36px] min-h-[36px] shrink-0 items-center justify-between gap-[8px] px-[14px] text-left text-[12px]" :class="count ? 'text-[#dec594]' : 'text-[#91ae9e]'" :disabled="!store.duplicateCandidates.length || store.busy" @click="popover?.toggle()">
    <span class="truncate">{{ summary }}</span><span v-if="store.duplicateCandidates.length" class="shrink-0">›</span>
  </button>
  <WuPopover ref="popoverRef" :anchor="anchor" placement="top-start" width="trigger" :max-height="280" :disabled="!store.duplicateCandidates.length || store.duplicateConfirmation" class="rounded-[8px] outline -outline-offset-1 outline-[var(--line)] bg-[#102019] text-[#c7dfd2] shadow-xl">
    <PointDuplicateList :candidates="store.duplicateCandidates" />
  </WuPopover>
  <WuDialog title="疑似重复，仍要保存？" :open="store.duplicateConfirmation" @keydown.capture="confirmWithEnter" @dismiss-requested="store.confirmDuplicate(false)">
      <PointDuplicateList :candidates="store.duplicateCandidates" />
      <template #footer>
        <WuButton tone="accent" variant="solid" @click="store.confirmDuplicate(true)">仍然保存</WuButton>
      </template>
  </WuDialog>
</template>
