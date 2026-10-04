<script setup lang="ts">
import WuButton from './base/WuButton.vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuScrollArea from './base/WuScrollArea.vue'

const emit = defineEmits<{ closeRequested: [] }>()
const store = usePointEditorStore()
const { library, importPreview, importLabel, busy, operation, error, notice, storage, hasUnsavedChanges } = storeToRefs(store)
const summary = computed(() => {
  if (!importPreview.value) return null
  const current = new Map(library.value.points.map((point) => [point.id, point]))
  const incoming = new Set(importPreview.value.points.map(({ id }) => id))
  return {
    added: importPreview.value.points.filter(({ id }) => !current.has(id)).length,
    removed: library.value.points.filter(({ id }) => !incoming.has(id)).length,
    changed: importPreview.value.points.filter((point) => current.has(point.id) && JSON.stringify(current.get(point.id)) !== JSON.stringify(point)).length,
  }
})
async function confirmImport(): Promise<void> {
  await store.applyImport()
  if (!store.importPreview) emit('closeRequested')
}
</script>

<template>
  <WuScrollArea class="max-h-[calc(100dvh-64px)]" content-class="p-[20px]">
    <div class="mb-[16px] flex items-center justify-between gap-[12px]">
      <span class="text-[16px] font-semibold">导入点位</span>
      <WuButton variant="ghost" size="sm" :disabled="busy" @click="emit('closeRequested')">关闭</WuButton>
    </div>
    <div class="text-[13px] leading-7 text-[#91ae9e]">{{ storage === 'browser' ? '点位保存在当前浏览器，可导出备份或传回项目。' : '点位保存在本机项目文件中。' }}{{ importLabel }}，官方数据不受影响。</div>
    <div v-if="hasUnsavedChanges" class="mt-[10px] text-[12px] text-[#b29e79]">导出仅包含已保存点位；导入前请先保存两个表单中的修改。</div>
    <div v-if="error" class="mt-[12px] text-[12px] text-[#ffad9f]">{{ error }}</div>
    <div v-else-if="notice" class="mt-[12px] text-[12px] text-[#91ae9e]">{{ notice }}</div>
    <div v-if="summary" class="mt-[20px] rounded-[8px] border border-[#745f38] bg-[#261f14] p-[16px]">
      <div class="text-[13px]">新增 {{ summary.added }} · 修改 {{ summary.changed }} · 删除 {{ summary.removed }}</div>
      <div class="mt-[8px] text-[12px] text-[#b29e79]">{{ importLabel }}。请核对上述变化，可先导出备份。</div>
      <div class="mt-[16px] flex gap-[8px]"><WuButton variant="solid" tone="danger" :disabled="busy || hasUnsavedChanges" :loading="operation === 'import'" @click="confirmImport">确认导入</WuButton><WuButton :disabled="busy" @click="emit('closeRequested')">取消</WuButton></div>
    </div>
  </WuScrollArea>
</template>
