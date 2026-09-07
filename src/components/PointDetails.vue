<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../stores/explorer.ts'
import { echoMembers, MODE_NAMES, navigationRouteCoordinate } from '../domain/point-library.ts'
import { describeEchoPoint } from '../domain/point-details.ts'
import EchoPointIcon from './EchoPointIcon.vue'
import { gravityName } from '../domain/gravity.ts'

const store = useExplorerStore()
const { selectedEchoLocation, selectedNavigationPoint, pointCandidates, activeEchoIds, dataset } = storeToRefs(store)
const location = computed(() => selectedEchoLocation.value ?? selectedNavigationPoint.value)
const details = computed(() => selectedEchoLocation.value ? describeEchoPoint(selectedEchoLocation.value, dataset.value?.echoes ?? []) : null)
const candidates = computed(() => pointCandidates.value.map((point) => ({ point, ...describeEchoPoint(point, dataset.value?.echoes ?? []) })))
const routeCoordinate = computed(() => selectedNavigationPoint.value ? navigationRouteCoordinate(selectedNavigationPoint.value) : null)
</script>

<template>
  <div v-if="location || pointCandidates.length" class="absolute left-12px top-64px z-70 max-h-[55%] w-[min(320px,calc(100%_-_24px))] overflow-y-auto rounded-12px border border-[var(--line)] bg-[#0b1b16f5] p-16px text-14px shadow-xl" aria-label="点位详情">
    <div class="mb-12px flex items-center justify-between gap-8px"><span class="text-[#e7f4ee]">{{ pointCandidates.length ? `${pointCandidates.length} 处相邻点位` : '点位详情' }}</span><button class="min-h-36px border-0 bg-transparent text-[#99b8a9]" type="button" @click="store.selectPoint(null)">关闭</button></div>
    <button v-for="candidate in candidates" :key="candidate.point.id" type="button" class="mb-8px w-full rounded-8px border border-[var(--line)] bg-[#142a21] p-10px text-left text-[#c4e5d5]" @click="store.selectPoint(candidate.point.id)">
      <span class="block">{{ candidate.title }}</span>
      <span class="mt-4px block text-12px text-[#99b8a9]">{{ candidate.summary }}</span>
      <span class="mt-4px block font-mono text-12px">{{ candidate.point.gameCoordinate ? Object.values(candidate.point.gameCoordinate).join(', ') : '临时 XY' }}</span>
    </button>
    <template v-if="location">
      <div v-if="details" class="flex items-center gap-12px">
        <EchoPointIcon v-if="selectedEchoLocation && dataset" :members="echoMembers(selectedEchoLocation)" :echoes="dataset.echoes" />
        <div class="min-w-0">
          <div class="text-14px text-[#e7f4ee]">{{ details.summary }}</div>
          <div v-if="details.compositionLabel" class="mt-4px text-12px text-[#9cb3a7]">{{ details.compositionLabel }}</div>
        </div>
      </div>
      <div v-for="member in details?.members ?? []" :key="member.echoId" class="mt-10px flex items-center gap-8px" :class="activeEchoIds.has(member.echoId) ? 'text-[#71ecc0]' : 'text-[#91ab9e]'">
        <img v-if="member.iconUrl" :src="member.iconUrl" alt="" class="h-32px w-32px shrink-0 object-contain" />
        <span class="min-w-0 flex-1">{{ member.name }}</span>
        <span v-if="member.count !== null" class="shrink-0 tabular-nums">{{ member.count }}只</span>
        <span v-if="activeEchoIds.has(member.echoId)" class="shrink-0 rounded-4px bg-[#153b2d] px-5px py-2px text-11px">目标</span>
      </div>
      <div v-if="selectedNavigationPoint" class="text-[#cde8dc]">{{ selectedNavigationPoint.typeName }} · {{ MODE_NAMES[selectedNavigationPoint.mode] }}</div>
      <div v-if="selectedNavigationPoint" class="mt-14px font-mono text-12px text-[#a0baac]">{{ selectedNavigationPoint.gameCoordinate ? `图标 XYZ ${Object.values(selectedNavigationPoint.gameCoordinate).join(', ')}` : '图标点位未录入 XYZ' }}</div>
      <div v-else class="mt-14px font-mono text-12px text-[#a0baac]">{{ location.gameCoordinate ? `XYZ ${Object.values(location.gameCoordinate).join(', ')}` : '官方测试点，未录入 XYZ' }}</div>
      <div v-if="selectedNavigationPoint?.mode === 'fast-travel'" class="mt-6px font-mono text-12px text-[#78dcb9]">{{ selectedNavigationPoint.teleportCoordinate ? `传送落点 ${Object.values(selectedNavigationPoint.teleportCoordinate).join(', ')}` : routeCoordinate ? `传送落点未单独录入，按图标 XYZ ${Object.values(routeCoordinate).join(', ')}` : '传送落点未录入' }}</div>
      <div v-if="location.quality === 'official-provisional'" class="mt-8px text-12px text-[#e5bd7c]">官方导入 · Z=0 为占位值</div>
      <div v-if="store.supportsGravity" class="mt-8px text-12px text-[#a0baac]">{{ gravityName(location.gravityType) }}</div>
      <div v-if="selectedEchoLocation && selectedEchoLocation.quality !== 'official-provisional' && 'note' in selectedEchoLocation" class="mt-8px whitespace-pre-wrap text-12px text-[#9cb3a7]">{{ selectedEchoLocation.note }}</div>
    </template>
  </div>
</template>
