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
const summary = computed(() => !store.duplicateTarget ? '待输入坐标'
  : count.value ? `疑似重复 · ${count.value}`
    : store.duplicateCandidates.length ? `附近点位 · ${store.duplicateCandidates.length}`
      : '')
onBeforeUnmount(() => store.confirmDuplicate(false))
</script>

<template>
  <button ref="anchorRef" type="button" class="flex h-[36px] min-h-[36px] shrink-0 items-center justify-between gap-[8px] px-[14px] text-left text-[12px]" :class="count ? 'text-[#dec594]' : 'text-[#91ae9e]'" :disabled="!store.duplicateCandidates.length || store.busy" @click="popover?.toggle()">
    <span class="truncate">{{ summary }}</span><span v-if="store.duplicateCandidates.length" class="shrink-0">›</span>
  </button>
  <WuPopover ref="popoverRef" :anchor="anchor" placement="top-start" width="trigger" :max-height="280" :disabled="!store.duplicateCandidates.length || store.duplicateConfirmation" class="rounded-[8px] border border-[var(--line)] bg-[#102019] text-[#c7dfd2] shadow-xl">
    <PointDuplicateList />
  </WuPopover>
  <WuDialog :open="store.duplicateConfirmation" @dismiss-requested="store.confirmDuplicate(false)">
    <div class="flex min-h-0 flex-col p-[16px]">
      <div class="mb-[8px] text-[16px] font-semibold">疑似重复，仍要保存？</div>
      <PointDuplicateList />
      <div class="mt-[12px] flex flex-wrap justify-end gap-[8px]">
        <WuButton @click="store.confirmDuplicate(false)">返回修改</WuButton>
        <WuButton tone="accent" variant="solid" @click="store.confirmDuplicate(true)">仍然保存</WuButton>
      </div>
    </div>
  </WuDialog>
</template>
