<script setup lang="ts">
import { vTooltip } from './base/tooltip.ts'
import WuButton from './base/WuButton.vue'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { authoredPointMapDisplay } from '../domain/point-library.ts'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import { navigationPointTypeNames } from '../domain/navigation-point-types.ts'
import WuInput from './base/WuInput.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuPopover from './base/WuPopover.vue'
import { useAssetsStore } from '../stores/assets.ts'
import { navigationIconAssets } from '../domain/navigation-icons.ts'
import WuScrollArea from './base/WuScrollArea.vue'
import PointCoordinateFields from './PointCoordinateFields.vue'

const store = usePointEditorStore()
const { dataset, draft, busy, inputErrors } = storeToRefs(store)
const assetsStore = useAssetsStore()
const iconAnchor = useTemplateRef<InstanceType<typeof WuButton>>('iconAnchorRef')
const iconPopover = useTemplateRef<InstanceType<typeof WuPopover>>('iconPopoverRef')
const iconSearch = shallowRef('')
const filteredIcons = computed(() => navigationIconAssets(assetsStore.assets, iconSearch.value))
function openIcons(): void {
  iconPopover.value?.toggle()
  if (!assetsStore.assets.length && !assetsStore.loading) void assetsStore.load()
}
const iconUrl = computed(() => {
  const point = draft.value
  if (!point || point.kind !== 'navigation' || !dataset.value) return ''
  const chosen = dataset.value.navigationPoints.find(({ id }) => id === point.iconSourceId)
  return point.iconUrl || chosen?.iconUrl || authoredPointMapDisplay({ ...point, coordinate: { x: 0, y: 0, z: 0 } }, dataset.value)?.location.iconUrl || ''
})
const fixedTeleport = computed(() => draft.value?.kind === 'navigation' && ['boss', 'domain', 'challenge'].includes(draft.value.navigationKind))
function selectIcon(id: string): void {
  store.setAssetIcon(id)
  iconPopover.value?.hide()
}
</script>

<template>
  <div v-if="draft?.kind === 'navigation'" class="mt-24px">
    <div class="mb-6px text-13px font-600">类型</div>
    <WuSelect :model-value="draft.pointType ?? null" :disabled="busy" @update:model-value="store.setPointType">
      <WuOption :value="null">未设置</WuOption>
      <WuOption v-for="(name, value) in navigationPointTypeNames" :key="value" :value="value">{{ name }}</WuOption>
    </WuSelect>
    <div class="mb-6px mt-18px text-13px font-600">名称与图标</div>
    <div class="flex items-start gap-8px">
      <WuButton ref="iconAnchorRef" icon-only :tone="inputErrors.icon ? 'danger' : 'neutral'" :tooltip="iconUrl ? '更换图标' : '选择图标'" :disabled="busy" @click="openIcons">
        <template #icon><img v-if="iconUrl" :src="iconUrl" class="h-30px w-30px shrink-0 object-contain" /><span v-else class="shrink-0 text-10px">图标</span></template>
      </WuButton>
      <WuInput class="min-w-0 flex-1" :model-value="draft.name" :invalid="Boolean(inputErrors.name)" :disabled="busy" placeholder="输入定位点名称" @update:model-value="store.setName" />
    </div>
    <div v-if="inputErrors.name" class="mt-4px text-11px text-[#ffad9f]">{{ inputErrors.name }}</div>
    <div v-if="inputErrors.icon" class="mt-4px text-11px text-[#ffad9f]">{{ inputErrors.icon }}</div>
    <WuPopover ref="iconPopoverRef" :anchor="iconAnchor?.element ?? null" :disabled="busy" :width="360" :max-height="420" class="border border-[var(--line)] rounded-9px bg-[#102019] text-[#c7dfd2] shadow-xl">
      <div class="shrink-0 p-10px"><WuInput v-model="iconSearch" placeholder="搜索定位点、探索、挑战、NPC及服务点" /></div>
      <div v-if="assetsStore.loading" class="p-16px text-12px">正在加载图标…</div>
      <div v-else-if="assetsStore.error" class="p-12px text-12px">
        <div>{{ assetsStore.error }}</div><WuButton class="mt-8px" variant="ghost" tone="accent" size="sm" @click="assetsStore.load">重试</WuButton>
      </div>
      <WuScrollArea v-else class="min-h-0 flex-1" content-class="grid grid-cols-2 gap-6px p-10px pt-0">
        <button v-for="icon in filteredIcons" :key="icon.id" type="button" class="min-w-0 flex items-center gap-8px border border-[var(--line)] rounded-6px bg-[#12271f] p-8px text-left text-11px hover:bg-[#1c3b2d]" v-tooltip="icon.name" :disabled="busy" @click="selectIcon(icon.id)">
          <img :src="icon.url" class="h-32px w-32px shrink-0 object-contain" loading="lazy" /><span class="min-w-0 flex-1 truncate">{{ icon.name }}</span>
        </button>
        <div v-if="!filteredIcons.length" class="col-span-2 p-12px text-center text-12px text-[#91ae9e]">没有匹配的图标</div>
      </WuScrollArea>
    </WuPopover>
    <WuCheckBox class="mt-20px flex min-h-40px items-center gap-8px text-13px" :model-value="draft.mode === 'fast-travel'" :disabled="busy || fixedTeleport" @update:model-value="store.setMode($event ? 'fast-travel' : 'landmark')">可传送</WuCheckBox>
    <template v-if="draft.mode === 'fast-travel'">
      <div class="mt-16px">
        <div class="mb-8px flex items-center justify-between"><span class="text-13px">实际传送位置</span><WuButton variant="ghost" size="sm" :disabled="busy" @click="store.clearTeleportCoordinate">清除</WuButton></div>
        <PointCoordinateFields teleport />
      </div>
      <div class="mt-6px text-11px text-[#789788]">留空时使用点位位置</div>
    </template>
  </div>
</template>
