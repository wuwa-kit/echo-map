<script setup lang="ts">
import NavigationArtwork from './NavigationArtwork.vue'
import NavigationIconGrid from './NavigationIconGrid.vue'
import WuEllipsis from './base/WuEllipsis.vue'
import WuButton from './base/WuButton.vue'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useEventListener } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import WuInput from './base/WuInput.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuPopover from './base/WuPopover.vue'
import { navigationPickerGroups, navigationPointIconUrl } from '../domain/navigation-icons.ts'
import WuScrollArea from './base/WuScrollArea.vue'
import PointCoordinateFields from './PointCoordinateFields.vue'
import { useNavigationIconLibraryStore } from '../stores/navigation-icon-library.ts'

defineProps<{ arrivalConfirmationHint?: string }>()
const emit = defineEmits<{ arrivalConfirmed: [coordinate: [number, number]] }>()
const store = usePointEditorStore()
const iconLibrary = useNavigationIconLibraryStore()
const typeOptions = computed(() => Object.entries(iconLibrary.pointTypes).map(([value, type]) => ({
  value,
  name: type.name,
  iconUrl: iconLibrary.catalog.find(icon => icon.id === type.icons[0])?.url,
})))
const { draft, busy, inputErrors, recentIconIds } = storeToRefs(store)
const iconAnchor = useTemplateRef<InstanceType<typeof WuButton>>('iconAnchorRef')
const iconPopover = useTemplateRef<InstanceType<typeof WuPopover>>('iconPopoverRef')
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
const rule = computed(() => selectedType.value ? iconLibrary.pointTypes[selectedType.value] : undefined)
const iconGroups = computed(() => navigationPickerGroups(iconLibrary.saved, iconLibrary.catalog, selectedType.value, '', recentIconIds.value))
const pickerIcons = computed(() => iconGroups.value.flatMap(group => group.icons))
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
    <div class="mt-[4px] h-[18px] truncate text-[11px] leading-[18px] text-[#ffad9f]">{{ inputErrors.pointType }}</div>
    <div class="mb-[6px] mt-[18px] text-[13px] font-semibold">名称与图标</div>
    <div class="flex items-start gap-[8px]">
      <WuButton ref="iconAnchorRef" icon-only :tone="inputErrors.icon ? 'danger' : 'neutral'" :tooltip="rule?.builtIn && rule.icons.length === 1 ? '图标由类型决定' : iconUrl ? '更换图标' : '选择图标'" :disabled="busy || (rule?.builtIn && rule.icons.length === 1)" :popovertarget="iconPopover?.id">
        <template #icon><NavigationArtwork v-if="iconUrl" :url="iconUrl" class="h-[30px] w-[30px] shrink-0 object-contain" /><span v-else class="shrink-0 text-[10px]">图标</span></template>
      </WuButton>
      <div ref="nameAnchorRef" class="min-w-0 flex-1">
        <WuInput :model-value="draft.name" :invalid="Boolean(inputErrors.name)" :disabled="busy || rule?.names.length === 1" :tooltip="rule?.names.length === 1 ? '名称由类型决定' : undefined" placeholder="输入定位点名称" @update:model-value="inputName" @pointerdown="startNamePointer" @focus="focusNameHistory" @click="openNameHistory" @blur="finishManualName" @confirm="finishManualName" />
      </div>
    </div>
    <div class="mt-[4px] h-[18px] truncate text-[12px] leading-[18px]" :class="inputErrors.name || inputErrors.icon ? 'text-[#ffad9f]' : 'text-[#91ae9e]'">{{ inputErrors.name || inputErrors.icon || nameAndIconHint }}</div>
    <WuPopover ref="namePopoverRef" :anchor="nameAnchor" :disabled="busy || rule?.names.length === 1" width="trigger" :max-height="320" class="outline -outline-offset-1 outline-[var(--line)] rounded-[9px] bg-[#102019] text-[#c7dfd2] shadow-xl">
      <WuScrollArea class="min-h-0 flex-1" content-class="p-[4px]">
        <div v-for="name in displayedNames" :key="name" class="flex items-center gap-[4px] rounded-[6px] hover:bg-[#1c3b2d]">
          <button type="button" class="min-w-0 flex-1 px-[6px] py-[8px] text-left text-[13px]" @click="selectName(name)"><WuEllipsis :text="name" /></button>
          <WuButton variant="ghost" size="sm" icon="close" icon-only tooltip="移除记录" @click="removeName(name)" />
        </div>
      </WuScrollArea>
    </WuPopover>
    <WuPopover v-if="!rule?.builtIn || rule.icons.length > 1" ref="iconPopoverRef" :anchor="iconAnchor?.element ?? null" :disabled="busy" :width="360" :max-height="360" :gap="6" class="rounded-[9px] bg-[#081411] p-[8px] text-[#dce9e3] outline -outline-offset-1 outline-[rgba(169,207,192,0.18)] shadow-xl">
      <NavigationIconGrid :icons="pickerIcons" :selected-id="draft.iconId" :active="iconPopover?.isOpen ?? false" :disabled="busy" @selected="selectIcon" />
    </WuPopover>
    <WuCheckBox class="mt-[20px] flex min-h-[40px] items-center gap-[8px] text-[13px]" :model-value="draft.mode === 'fast-travel'" :disabled="busy || rule?.teleportLocked" @update:model-value="store.setMode($event ? 'fast-travel' : 'landmark')">可传送<span v-if="rule?.teleportLocked" class="text-[11px] text-[#789788]">· 由类型决定</span></WuCheckBox>
    <template v-if="draft.mode === 'fast-travel'">
      <div class="mt-[16px]">
        <div class="mb-[8px] flex items-center justify-between"><span class="text-[13px]">实际传送位置(可不填)</span><WuButton variant="ghost" size="sm" :disabled="busy" @click="store.clearTeleportCoordinate">清除</WuButton></div>
        <PointCoordinateFields teleport :confirmation-hint="arrivalConfirmationHint" @locate-requested="emit('arrivalConfirmed', $event)" />
      </div>
    </template>
  </div>
</template>
