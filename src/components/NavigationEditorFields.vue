<script setup lang="ts">
import NavigationArtwork from './NavigationArtwork.vue'
import WuEllipsis from './base/WuEllipsis.vue'
import WuButton from './base/WuButton.vue'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useEventListener } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import { navigationPointTypeIds, navigationPointTypes } from '../domain/navigation-point-types.ts'
import WuInput from './base/WuInput.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuPopover from './base/WuPopover.vue'
import { navigationTypeIcons, navigationPickerGroups, navigationPointIconUrl } from '../domain/navigation-icons.ts'
import WuScrollArea from './base/WuScrollArea.vue'
import PointCoordinateFields from './PointCoordinateFields.vue'
import { RouterLink } from 'vue-router'
import { useNavigationIconLibraryStore } from '../stores/navigation-icon-library.ts'

defineProps<{ arrivalConfirmationHint?: string }>()
const emit = defineEmits<{ arrivalConfirmed: [coordinate: [number, number]] }>()
const store = usePointEditorStore()
const iconLibrary = useNavigationIconLibraryStore()
const typeOptions = navigationPointTypeIds.map((value) => ({
  value,
  name: navigationPointTypes[value].name,
  iconUrl: navigationTypeIcons(value)[0]?.url,
}))
const { draft, busy, inputErrors, recentIconIds } = storeToRefs(store)
const iconAnchor = useTemplateRef<InstanceType<typeof WuButton>>('iconAnchorRef')
const iconPopover = useTemplateRef<InstanceType<typeof WuPopover>>('iconPopoverRef')
const iconSearch = shallowRef('')
const nameAnchor = useTemplateRef<HTMLDivElement>('nameAnchorRef')
const namePopover = useTemplateRef<InstanceType<typeof WuPopover>>('namePopoverRef')
const displayedNames = shallowRef<readonly string[]>([])
const pendingManualName = shallowRef<string | null>(null)
let namePointerDown = false

useEventListener(window, ['pointerup', 'pointercancel'], () => { namePointerDown = false }, { capture: true })

function startNamePointer(): void {
  namePointerDown = true
}

function focusNameHistory(): void {
  // Pointer focus precedes native popover light-dismiss; open from click instead.
  if (!namePointerDown) openNameHistory()
}

function openNameHistory(): void {
  if (!store.recentNames.length) return
  if (!namePopover.value?.isOpen) displayedNames.value = store.recentNames
  // Native dismissal can precede the asynchronous toggle event that updates isOpen.
  namePopover.value?.show()
}

function inputName(value: string): void {
  store.setName(value)
  pendingManualName.value = value
}

function finishManualName(): void {
  if (pendingManualName.value === null) return
  store.recordManualName(pendingManualName.value)
  pendingManualName.value = null
}

function selectName(name: string): void {
  finishManualName()
  store.setName(name)
  store.recordManualName(name)
  namePopover.value?.hide()
}

function removeName(name: string): void {
  store.removeRecentName(name)
  displayedNames.value = displayedNames.value.filter(value => value !== name)
  if (!displayedNames.value.length) namePopover.value?.hide()
}

onBeforeUnmount(finishManualName)
const selectedType = computed(() => draft.value?.kind === 'navigation' ? draft.value.pointType : undefined)
const rule = computed(() => selectedType.value ? navigationPointTypes[selectedType.value] : undefined)
const iconGroups = computed(() => navigationPickerGroups(iconLibrary.saved, iconLibrary.catalog, selectedType.value, iconSearch.value, recentIconIds.value))
const iconUrl = computed(() => draft.value?.kind === 'navigation' ? navigationPointIconUrl(draft.value) : '')
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
            <NavigationArtwork v-if="option.iconUrl" :url="option.iconUrl" class="h-[24px] w-[24px] shrink-0 object-contain" />
            <span class="truncate">{{ option.name }}</span>
          </span>
        </WuOption>
      </div>
    </WuSelect>
    <div v-if="inputErrors.pointType" class="mt-[4px] text-[11px] text-[#ffad9f]">{{ inputErrors.pointType }}</div>
    <div v-if="rule?.builtIn" class="mt-[12px] flex items-center gap-[8px] text-[12px] text-[#91ae9e]">
      <NavigationArtwork :url="iconUrl" class="h-[30px] w-[30px] shrink-0 object-contain" />
      <span>内置图标 · {{ draft.mode === 'fast-travel' ? '可直接传送' : '不可直接传送' }} · {{ selectedType === 'central-beacon' ? '始终显示' : draft.mode === 'fast-travel' ? '按传送点层级显示' : '按非传送点层级显示' }}</span>
    </div>
    <div v-if="!rule?.builtIn || !rule.names.length" class="mb-[6px] mt-[18px] text-[13px] font-semibold">{{ rule?.builtIn && rule.icons.length === 1 ? '名称' : '名称与图标' }}</div>
    <div v-if="!rule?.builtIn || !rule.names.length" class="flex items-start gap-[8px]">
      <WuButton v-if="!rule?.builtIn || rule.icons.length > 1" ref="iconAnchorRef" icon-only :tone="inputErrors.icon ? 'danger' : 'neutral'" :tooltip="iconUrl ? '更换图标' : '选择图标'" :disabled="busy" :popovertarget="iconPopover?.id">
        <template #icon><NavigationArtwork v-if="iconUrl" :url="iconUrl" class="h-[30px] w-[30px] shrink-0 object-contain" /><span v-else class="shrink-0 text-[10px]">图标</span></template>
      </WuButton>
      <div ref="nameAnchorRef" class="min-w-0 flex-1">
        <WuInput :model-value="draft.name" :invalid="Boolean(inputErrors.name)" :disabled="busy || rule?.names.length === 1" :tooltip="rule?.names.length === 1 ? '名称由类型决定' : undefined" placeholder="输入定位点名称" @update:model-value="inputName" @pointerdown="startNamePointer" @focus="focusNameHistory" @click="openNameHistory" @blur="finishManualName" @confirm="finishManualName" />
      </div>
    </div>
    <div v-if="!rule?.builtIn || nameAndIconHint || inputErrors.name || inputErrors.icon" class="mt-[4px] h-[18px] text-[12px] leading-[18px]" :class="inputErrors.name || inputErrors.icon ? 'text-[#ffad9f]' : 'text-[#91ae9e]'">{{ inputErrors.name || inputErrors.icon || nameAndIconHint }}</div>
    <WuPopover ref="namePopoverRef" :anchor="nameAnchor" :disabled="busy || rule?.names.length === 1" width="trigger" :max-height="320" class="outline -outline-offset-1 outline-[var(--line)] rounded-[9px] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <WuScrollArea class="min-h-0 flex-1" content-class="p-[4px]">
        <div v-for="name in displayedNames" :key="name" class="flex items-center gap-[4px] rounded-[6px] hover:bg-[#1c3b2d]">
          <button type="button" class="min-w-0 flex-1 px-[6px] py-[8px] text-left text-[13px]" @click="selectName(name)"><WuEllipsis :text="name" /></button>
          <WuButton variant="ghost" size="sm" icon="close" icon-only tooltip="移除记录" @click="removeName(name)" />
        </div>
      </WuScrollArea>
    </WuPopover>
    <WuPopover v-if="!rule?.builtIn || rule.icons.length > 1" ref="iconPopoverRef" :anchor="iconAnchor?.element ?? null" :disabled="busy" :width="360" :max-height="280" class="outline -outline-offset-1 outline-[var(--line)] rounded-[9px] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <div class="shrink-0 p-[10px]"><WuInput v-model="iconSearch" placeholder="搜索图标名称或编号" /><RouterLink to="/navigation-icons" target="_blank" rel="noopener" class="mt-[6px] block text-[12px] text-[#8ed4b0]">管理自建图标</RouterLink></div>
      <WuScrollArea class="min-h-0 flex-1" content-class="grid grid-cols-2 gap-[6px] p-[10px] pt-0">
        <template v-for="group in iconGroups" :key="group.id">
          <div v-if="group.icons.length" class="col-span-2 text-[11px] text-[#91ae9e]">{{ group.name }}</div>
          <button v-for="icon in group.icons" :key="icon.id" type="button" class="min-w-0 flex items-center gap-[8px] outline -outline-offset-1 outline-[var(--line)] rounded-[6px] bg-[#12271f] p-[8px] text-left text-[11px] hover:bg-[#1c3b2d]" :disabled="busy" @click="selectIcon(icon.id)">
            <NavigationArtwork :url="icon.url" class="h-[32px] w-[32px] shrink-0 object-contain" /><div class="min-w-0 flex-1"><WuEllipsis :text="icon.name" /><div class="mt-[3px] truncate text-[10px] text-[#91ae9e]">{{ icon.id }}</div></div>
          </button>
        </template>
        <div v-if="!iconGroups.length" class="col-span-2 p-[12px] text-center text-[12px] text-[#91ae9e]">没有匹配的图标</div>
      </WuScrollArea>
    </WuPopover>
    <WuCheckBox v-if="!rule?.builtIn || !rule.teleportLocked" class="mt-[20px] flex min-h-[40px] items-center gap-[8px] text-[13px]" :model-value="draft.mode === 'fast-travel'" :disabled="busy || rule?.teleportLocked" @update:model-value="store.setMode($event ? 'fast-travel' : 'landmark')">可传送<span v-if="rule?.teleportLocked" class="text-[11px] text-[#789788]">· 由类型决定</span></WuCheckBox>
    <template v-if="draft.mode === 'fast-travel'">
      <div class="mt-[16px]">
        <div class="mb-[8px] flex items-center justify-between"><span class="text-[13px]">实际传送位置(可不填)</span><WuButton variant="ghost" size="sm" :disabled="busy" @click="store.clearTeleportCoordinate">清除</WuButton></div>
        <PointCoordinateFields teleport :confirmation-hint="arrivalConfirmationHint" @locate-requested="emit('arrivalConfirmed', $event)" />
      </div>
    </template>
  </div>
</template>
