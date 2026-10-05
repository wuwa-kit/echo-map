<script setup lang="ts">
import WuEllipsis from './base/WuEllipsis.vue'
import WuButton from './base/WuButton.vue'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import { navigationPointTypeIds, navigationPointTypes } from '../domain/navigation-point-types.ts'
import WuInput from './base/WuInput.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuPopover from './base/WuPopover.vue'
import { navigationTypeIcons, navigationPointIconUrl } from '../domain/navigation-icons.ts'
import WuScrollArea from './base/WuScrollArea.vue'
import PointCoordinateFields from './PointCoordinateFields.vue'

const store = usePointEditorStore()
const typeOptions = navigationPointTypeIds.map((value) => ({
  value,
  name: navigationPointTypes[value].name,
  iconUrl: navigationTypeIcons(value)[0]?.url,
}))
const { draft, busy, inputErrors, recentIconIds } = storeToRefs(store)
const iconAnchor = useTemplateRef<InstanceType<typeof WuButton>>('iconAnchorRef')
const iconPopover = useTemplateRef<InstanceType<typeof WuPopover>>('iconPopoverRef')
const iconSearch = shallowRef('')
const selectedType = computed(() => draft.value?.kind === 'navigation' ? draft.value.pointType : undefined)
const rule = computed(() => selectedType.value ? navigationPointTypes[selectedType.value] : undefined)
const icons = computed(() => navigationTypeIcons(selectedType.value))
const filteredIcons = computed(() => navigationTypeIcons(selectedType.value, iconSearch.value, recentIconIds.value))
const iconUrl = computed(() => draft.value?.kind === 'navigation' ? navigationPointIconUrl(draft.value) : '')
const fixedIcon = computed(() => Boolean(rule.value?.icons.length) && icons.value.length === 1)
const nameAndIconHint = computed(() => {
  const point = draft.value
  if (point?.kind !== 'navigation') return ''
  const missingName = !point.name.trim()
  const missingIcon = !point.iconId
  if (missingName && missingIcon) return '请选择图标和填写名称'
  if (missingIcon) return '请选择图标'
  if (missingName) return '请填写名称'
  return ''
})
function selectIcon(id: string): void {
  store.setIcon(id)
  iconPopover.value?.hide()
}
</script>

<template>
  <div v-if="draft?.kind === 'navigation'" class="mt-[24px]">
    <div class="mb-[6px] text-[13px] font-semibold">类型</div>
    <WuSelect :model-value="draft.pointType ?? null" :muted="!draft.pointType" :invalid="Boolean(inputErrors.pointType)" :disabled="busy" @update:model-value="store.setPointType">
      <WuOption :value="null"><span class="text-[#789788]">未设置</span></WuOption>
      <div class="grid grid-cols-2 gap-[4px]">
        <WuOption v-for="option in typeOptions" :key="option.value" :value="option.value" class="min-w-0">
          <span class="flex min-w-0 items-center gap-[6px]">
            <img v-if="option.iconUrl" :src="option.iconUrl" class="h-[24px] w-[24px] shrink-0 object-contain" loading="lazy" />
            <span class="truncate">{{ option.name }}</span>
          </span>
        </WuOption>
      </div>
    </WuSelect>
    <div v-if="inputErrors.pointType" class="mt-[4px] text-[11px] text-[#ffad9f]">{{ inputErrors.pointType }}</div>
    <div class="mb-[6px] mt-[18px] text-[13px] font-semibold">名称与图标</div>
    <div class="flex items-start gap-[8px]">
      <WuButton ref="iconAnchorRef" icon-only :tone="inputErrors.icon ? 'danger' : 'neutral'" :tooltip="fixedIcon ? '图标由类型决定' : iconUrl ? '更换图标' : '选择图标'" :disabled="busy || fixedIcon" :popovertarget="iconPopover?.id">
        <template #icon><img v-if="iconUrl" :src="iconUrl" class="h-[30px] w-[30px] shrink-0 object-contain" /><span v-else class="shrink-0 text-[10px]">图标</span></template>
      </WuButton>
      <WuInput class="min-w-0 flex-1" :model-value="draft.name" :invalid="Boolean(inputErrors.name)" :disabled="busy || rule?.names.length === 1" :tooltip="rule?.names.length === 1 ? '名称由类型决定' : undefined" placeholder="输入定位点名称" @update:model-value="store.setName" />
    </div>
    <div class="mt-[4px] h-[18px] text-[12px] leading-[18px]" :class="inputErrors.name || inputErrors.icon ? 'text-[#ffad9f]' : 'text-[#91ae9e]'">{{ nameAndIconHint }}</div>
    <WuPopover ref="iconPopoverRef" :anchor="iconAnchor?.element ?? null" :disabled="busy" :width="360" :max-height="280" class="border border-[var(--line)] rounded-[9px] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <div class="shrink-0 p-[10px]"><WuInput v-model="iconSearch" :placeholder="!selectedType ? '搜索未设置类型的图标' : rule?.icons.length ? '搜索当前类型的图标' : '搜索图标库'" /></div>
      <WuScrollArea class="min-h-0 flex-1" content-class="grid grid-cols-2 gap-[6px] p-[10px] pt-0">
        <button v-for="icon in filteredIcons" :key="icon.id" type="button" class="min-w-0 flex items-center gap-[8px] border border-[var(--line)] rounded-[6px] bg-[#12271f] p-[8px] text-left text-[11px] hover:bg-[#1c3b2d]" :disabled="busy" @click="selectIcon(icon.id)">
          <img :src="icon.url" class="h-[32px] w-[32px] shrink-0 object-contain" loading="lazy" /><WuEllipsis :text="icon.name" class="min-w-0 flex-1" />
        </button>
        <div v-if="!filteredIcons.length" class="col-span-2 p-[12px] text-center text-[12px] text-[#91ae9e]">没有匹配的图标</div>
      </WuScrollArea>
    </WuPopover>
    <WuCheckBox class="mt-[20px] flex min-h-[40px] items-center gap-[8px] text-[13px]" :model-value="draft.mode === 'fast-travel'" :disabled="busy || rule?.teleportLocked" @update:model-value="store.setMode($event ? 'fast-travel' : 'landmark')">可传送<span v-if="rule?.teleportLocked" class="text-[11px] text-[#789788]">· 由类型决定</span></WuCheckBox>
    <template v-if="draft.mode === 'fast-travel'">
      <div class="mt-[16px]">
        <div class="mb-[8px] flex items-center justify-between"><span class="text-[13px]">实际传送位置(可不填)</span><WuButton variant="ghost" size="sm" :disabled="busy" @click="store.clearTeleportCoordinate">清除</WuButton></div>
        <PointCoordinateFields teleport />
      </div>
    </template>
  </div>
</template>
