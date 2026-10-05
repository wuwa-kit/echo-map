<script setup lang="ts">
import { usePointEditorStore } from '../stores/point-editor.ts'
import { isOfficialPoint, pointTitle } from '../domain/point-library.ts'
import { navigationPointIconUrl } from '../domain/navigation-icons.ts'
import type { AuthoredPoint } from '../domain/types.ts'
import EchoPointIcon from './EchoPointIcon.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import WuSvg from './base/WuSvg.vue'

const store = usePointEditorStore()
function coordinates(point: AuthoredPoint): string {
  const { x, y, z } = point.coordinate
  return `${x ?? '—'}, ${y ?? '—'}, ${isOfficialPoint(point) ? '0（官方占位）' : z ?? '—'}`
}
</script>

<template>
  <WuScrollArea class="min-h-0 max-h-[280px]" content-class="p-[4px]">
    <div v-for="candidate in store.duplicateCandidates" :key="candidate.point.id" class="flex items-center gap-[10px] px-[10px] py-[8px] text-[12px]">
      <div class="flex h-[40px] w-[40px] shrink-0 items-center justify-center">
        <EchoPointIcon v-if="candidate.point.kind === 'echo'" class="!h-[40px] !w-[40px]" :members="candidate.point.members" :echoes="store.dataset?.echoes ?? []" />
        <img v-else-if="navigationPointIconUrl(candidate.point)" :src="navigationPointIconUrl(candidate.point)" class="h-[36px] w-[36px] object-contain" />
        <WuSvg v-else name="map-pin" class="h-[24px] w-[24px] text-[#91ae9e]" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate font-semibold text-[#c7dfd2]">{{ store.dataset ? pointTitle(candidate.point, store.dataset) : candidate.point.id }}</div>
        <div class="mt-[3px] truncate text-[#91ae9e]" :title="`距离 ${candidate.distance.toFixed(1)} · ${coordinates(candidate.point)}`">距离 {{ candidate.distance.toFixed(1) }} · {{ coordinates(candidate.point) }}</div>
      </div>
    </div>
  </WuScrollArea>
</template>
