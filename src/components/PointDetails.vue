<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../stores/explorer.ts'
import { MODE_NAMES } from '../domain/point-library.ts'
import { describeEchoPoint } from '../domain/point-details.ts'
import type { EchoDefinition, GameCoordinate } from '../domain/types.ts'
import { gravityName } from '../domain/gravity.ts'
import EchoPointMember from './EchoPointMember.vue'
import MapPointPopup from './MapPointPopup.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const store = useExplorerStore()
const {
  selectedEchoLocation,
  selectedNavigationPoint,
  pointCandidates,
  navigationPointCandidates,
  activeEchoIds,
  dataset,
} = storeToRefs(store)
const details = computed(() => selectedEchoLocation.value
  ? describeEchoPoint(selectedEchoLocation.value, dataset.value?.echoes ?? [])
  : null)
const candidates = computed(() => [
  ...pointCandidates.value.map((point) => ({
    point,
    ...describeEchoPoint(point, dataset.value?.echoes ?? []),
  })),
  ...navigationPointCandidates.value.map((point) => ({
    point,
    title: point.typeName,
    summary: MODE_NAMES[point.mode],
  })),
])
const candidateCount = computed(() => candidates.value.length)
const echoesById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo]) ?? []))

function coordinateTitle(coordinate: GameCoordinate | null): string {
  return coordinate ? `XYZ ${coordinate.x}, ${coordinate.y}, ${coordinate.z}` : 'XYZ 未录入'
}

function echoCost(echoId: string): EchoDefinition['cost'] | null {
  return echoesById.value.get(echoId)?.cost ?? null
}
</script>

<template>
  <MapPointPopup v-if="candidateCount && !selectedEchoLocation && !selectedNavigationPoint" @close="store.selectPoint(null)">
    <template #title>
      <span>{{ candidateCount }} 处相邻点位</span>
    </template>
    <WuScrollArea class="min-h-0 max-h-320px flex-1" content-class="p-12px pb-4px">
      <button v-for="candidate in candidates" :key="candidate.point.id" type="button" class="mb-8px w-full rounded-8px border border-[var(--line)] bg-[#142a21] p-10px text-left text-[#c4e5d5] hover:border-[#477b68] hover:bg-[#193329]" @click="store.selectPointCandidate(candidate.point.id)">
        <span class="block">{{ candidate.title }}</span>
        <span class="mt-4px block text-12px text-[#99b8a9]">{{ candidate.summary }}</span>
        <span class="mt-4px block font-mono text-12px">{{ coordinateTitle(candidate.point.gameCoordinate) }}</span>
      </button>
    </WuScrollArea>
  </MapPointPopup>

  <MapPointPopup v-else-if="selectedEchoLocation" :show-back="candidateCount > 0" @back="store.returnToPointCandidates()" @close="store.selectPoint(null)">
    <template #title>
      <span class="font-mono text-13px">{{ coordinateTitle(selectedEchoLocation.gameCoordinate) }}</span>
    </template>
    <WuScrollArea class="min-h-0 max-h-320px flex-1" content-class="grid gap-8px p-12px">
      <EchoPointMember
        v-for="member in details?.members ?? []"
        :key="member.echoId"
        :active="activeEchoIds.has(member.echoId)"
        :cost="echoCost(member.echoId)"
        :count="member.count"
        :icon-url="member.iconUrl"
        :name="member.name"
      />
      <div v-if="details?.members.length === 0" class="py-12px text-center text-12px text-[#8ea99c]">此处暂无声骸记录</div>
    </WuScrollArea>
  </MapPointPopup>

  <MapPointPopup v-else-if="selectedNavigationPoint" :show-back="candidateCount > 0" @back="store.returnToPointCandidates()" @close="store.selectPoint(null)">
    <template #title>
      <div class="truncate">{{ selectedNavigationPoint.typeName }}</div>
    </template>
    <WuScrollArea class="min-h-0 max-h-240px flex-1" content-class="grid gap-8px p-12px text-12px text-[#a9c4b7]">
      <div class="flex items-center gap-6px">
        <span class="font-mono">{{ coordinateTitle(selectedNavigationPoint.gameCoordinate) }}</span>
        <span v-if="selectedNavigationPoint.mode === 'fast-travel'" class="ml-auto shrink-0 rounded-4px bg-[#174332] px-6px py-2px text-10px text-[#7af0c3]">可传送</span>
      </div>
      <div v-if="selectedNavigationPoint.teleportCoordinate" class="flex items-center justify-between gap-12px">
        <span>传送落点</span>
        <span class="font-mono text-right text-[#78dcb9]">{{ coordinateTitle(selectedNavigationPoint.teleportCoordinate) }}</span>
      </div>
      <div v-if="store.supportsGravity" class="flex items-center justify-between gap-12px">
        <span>重力方向</span>
        <span class="text-[#d3e8de]">{{ gravityName(selectedNavigationPoint.gravityType) }}</span>
      </div>
    </WuScrollArea>
  </MapPointPopup>
</template>
