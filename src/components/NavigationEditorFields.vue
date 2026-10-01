<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { authoredPointMapDisplay, MODE_NAMES, NAVIGATION_NAMES } from '../domain/point-library.ts'
import { navigationKindSchema, navigationModeSchema } from '../domain/schema.ts'
import WuInput from './base/WuInput.vue'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import type { WuSelectValue } from './base/select-context.ts'
const store = usePointEditorStore()
const { dataset, draft, busy, teleportCoordinateText } = storeToRefs(store)
const iconUrl = computed(() => draft.value && dataset.value ? authoredPointMapDisplay(draft.value, dataset.value)?.location.iconUrl : '')
const teleportExpanded = shallowRef(false)
function setNavigationKind(value: WuSelectValue): void {
  const parsed = navigationKindSchema.safeParse(value)
  if (parsed.success) store.setNavigationKind(parsed.data)
}
function setMode(value: WuSelectValue): void {
  const parsed = navigationModeSchema.safeParse(value)
  if (parsed.success) store.setMode(parsed.data)
}
</script>

<template>
  <div v-if="draft?.kind === 'navigation'" class="mt-8px rounded-8px border border-[var(--line)] p-9px">
    <img v-if="iconUrl" :src="iconUrl" class="mb-8px h-36px w-36px object-contain" />
    <div class="text-11px text-[#91ae9e]">名称<WuInput class="mt-4px" :model-value="draft.name" :disabled="busy" @update:model-value="store.setName" /></div>
    <div class="mt-7px grid grid-cols-2 gap-7px"><div><div class="mb-4px text-10px text-[#91ae9e]">定位点类型</div><WuSelect :model-value="draft.navigationKind" :disabled="busy" @update:model-value="setNavigationKind"><WuOption v-for="(name, kind) in NAVIGATION_NAMES" :key="kind" :value="kind">{{ name }}</WuOption></WuSelect></div><div><div class="mb-4px text-10px text-[#91ae9e]">传送能力</div><WuSelect :model-value="draft.mode" :disabled="busy || ['boss', 'domain', 'challenge'].includes(draft.navigationKind)" @update:model-value="setMode"><WuOption v-for="(name, mode) in MODE_NAMES" :key="mode" :value="mode">{{ name }}</WuOption></WuSelect></div></div>
    <template v-if="draft.mode === 'fast-travel'"><div class="mt-8px text-11px text-[#91ae9e]">{{ draft.teleportCoordinate ? '青色空心圆为传送落点；完整核验后用于路线' : '未录入实测落点，路线从图标坐标起算' }}</div><button type="button" class="mt-7px border-0 bg-transparent p-0 text-11px text-[#83b69e]" @click="teleportExpanded = !teleportExpanded">{{ teleportExpanded || draft.teleportCoordinate ? '实际传送落点 XYZ（可选）' : '＋ 添加实际传送落点' }}</button><div v-if="teleportExpanded || draft.teleportCoordinate" class="mt-6px"><div class="flex gap-5px"><WuInput :model-value="teleportCoordinateText" :disabled="busy" placeholder="粘贴落点 XYZ" @update:model-value="store.setTeleportCoordinateText" @confirm="store.applyTeleportCoordinateText" /><button type="button" class="min-h-36px shrink-0 rounded-6px border border-[var(--line)] bg-[#173328] px-9px text-12px text-[#c7dfd2]" :disabled="busy" @click="store.applyTeleportCoordinateText">应用</button></div><div class="mt-6px grid grid-cols-3 gap-6px"><div v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="text-10px text-[#789788]">{{ axis.toUpperCase() }}<WuInput class="mt-2px font-mono" size="sm" inputmode="numeric" :model-value="draft.teleportCoordinate?.[axis] ?? ''" :disabled="busy" @update:model-value="store.setTeleportCoordinate(axis, $event)" /></div></div></div></template>
    <div class="mt-10px border-t border-[var(--line)] pt-8px text-11px text-[#91ae9e]">{{ draft.mode !== 'fast-travel' ? '此点不作为直接传送起点' : draft.status === 'verified' ? '已核验，可作为路线起点' : '完成 XYZ 与传送能力核验后，可作为路线起点' }}</div>
    <div v-if="draft.replacesOfficialIds?.length" class="mt-6px break-all text-10px text-[#789788]">官方来源：{{ draft.replacesOfficialIds.join('、') }}</div>
  </div>

</template>
