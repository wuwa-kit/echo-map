<script setup lang="ts">
import { vTooltip } from './base/tooltip.ts'
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
const { draft, busy, inputErrors, recentPointTypes } = storeToRefs(store)
const iconAnchor = useTemplateRef<InstanceType<typeof WuButton>>('iconAnchorRef')
const iconPopover = useTemplateRef<InstanceType<typeof WuPopover>>('iconPopoverRef')
const iconSearch = shallowRef('')
const selectedType = computed(() => draft.value?.kind === 'navigation' ? draft.value.pointType : undefined)
const rule = computed(() => selectedType.value ? navigationPointTypes[selectedType.value] : undefined)
const hiddenTypes = new Set([
  'tower-of-adversity', 'wind-marker', 'hidden-entrance',
  'challenge', 'service',
])
const typeGroups = computed(() => [
  { name: '最近使用', types: recentPointTypes.value.filter((id) => !hiddenTypes.has(id)) },
  { name: '常用点位', types: navigationPointTypeIds },
])
const icons = computed(() => navigationTypeIcons(selectedType.value))
const filteredIcons = computed(() => navigationTypeIcons(selectedType.value, iconSearch.value))
const iconUrl = computed(() => draft.value?.kind === 'navigation' ? navigationPointIconUrl(draft.value) : '')
const fixedIcon = computed(() => Boolean(rule.value?.icons.length) && icons.value.length === 1)
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
      <div v-for="group in typeGroups" v-show="group.types.length" :key="group.name">
        <div class="px-[9px] pb-[4px] pt-[10px] text-[10px] text-[#789788]">{{ group.name }}</div>
        <div class="grid grid-cols-2 gap-[4px]">
          <WuOption v-for="value in group.types" v-show="!hiddenTypes.has(value)" :key="value" :value="value" class="min-w-0">{{ navigationPointTypes[value].name }}</WuOption>
        </div>
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
    <div v-if="inputErrors.name" class="mt-[4px] text-[11px] text-[#ffad9f]">{{ inputErrors.name }}</div>
    <div v-if="inputErrors.icon" class="mt-[4px] text-[11px] text-[#ffad9f]">{{ inputErrors.icon }}</div>
    <WuPopover ref="iconPopoverRef" :anchor="iconAnchor?.element ?? null" :disabled="busy" :width="360" :max-height="420" class="border border-[var(--line)] rounded-[9px] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <div class="shrink-0 p-[10px]"><WuInput v-model="iconSearch" :placeholder="rule?.icons.length ? '搜索当前类型的图标' : '搜索图标库'" /></div>
      <WuScrollArea class="min-h-0 flex-1" content-class="grid grid-cols-2 gap-[6px] p-[10px] pt-0">
        <button v-for="icon in filteredIcons" :key="icon.id" type="button" class="min-w-0 flex items-center gap-[8px] border border-[var(--line)] rounded-[6px] bg-[#12271f] p-[8px] text-left text-[11px] hover:bg-[#1c3b2d]" v-tooltip="icon.name" :disabled="busy" @click="selectIcon(icon.id)">
          <img :src="icon.url" class="h-[32px] w-[32px] shrink-0 object-contain" loading="lazy" /><span class="min-w-0 flex-1 truncate">{{ icon.name }}</span>
        </button>
        <div v-if="!filteredIcons.length" class="col-span-2 p-[12px] text-center text-[12px] text-[#91ae9e]">没有匹配的图标</div>
      </WuScrollArea>
      <div v-if="!rule?.icons.length" class="shrink-0 p-[10px] pt-0"><WuInput :model-value="draft.iconUrl ?? ''" :invalid="Boolean(inputErrors.icon)" :disabled="busy" lazy placeholder="输入 HTTPS 图标地址，或从图标库选择" @update:model-value="store.setIconUrl" /></div>
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
