<script setup lang="ts">
import { computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import type { RoutePoint } from '../domain/types.ts'
import { routeLegDebugData } from '../map/route-layer.ts'
import type { RouteLegDetails } from '../map/route-layer.ts'

const props = defineProps<{
  details: RouteLegDetails
}>()

const emit = defineEmits<{
  close: []
}>()

const debugText = computed(() => JSON.stringify(routeLegDebugData(props.details), null, 2))
const routePosition = computed(() => props.details.type === 'walk'
  ? `第 ${props.details.pointIndex} → ${props.details.pointIndex + 1} 个目标`
  : `传送 → 第 ${props.details.pointIndex + 1} 个目标`)
const { copy, copied } = useClipboard({ legacy: true })

function coordinateText(point: RoutePoint): string {
  return Object.values(point.coordinate).join(', ')
}

function copyDebug(): void {
  void copy(debugText.value)
}
</script>

<template>
  <div class="absolute left-12px top-64px z-70 max-h-[min(520px,calc(100%_-_80px))] w-[min(340px,calc(100%_-_24px))] overflow-y-auto rounded-12px border border-[var(--line)] bg-[#0b1b16f5] p-14px text-13px shadow-xl">
    <div class="flex items-start gap-8px">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-6px">
          <span class="rounded-4px bg-[#174332] px-6px py-2px text-11px text-[#75efc3]">{{ details.type === 'teleport' ? '传送线路' : '步行线路' }}</span>
          <span class="text-12px text-[#9db8aa]">{{ routePosition }}</span>
        </div>
        <div class="mt-5px font-mono text-11px text-[#73988a] break-all">{{ details.debugId }}</div>
      </div>
      <button type="button" class="h-28px w-28px shrink-0 flex cursor-pointer items-center justify-center rounded-5px border-0 bg-transparent p-0 text-20px text-[#99b8a9] leading-none hover:bg-[#183128] hover:text-[#e7f4ee]" @click="emit('close')">×</button>
    </div>

    <div class="mt-12px grid grid-cols-[52px_1fr] gap-x-8px gap-y-4px">
      <span class="text-[#789789]">起点</span><span class="min-w-0 text-[#d7eee3] break-words">{{ details.from.name }}</span>
      <span class="text-[#789789]">XYZ</span><span class="font-mono text-[#a9cbb9]">{{ coordinateText(details.from) }}</span>
      <span class="text-[#789789]">终点</span><span class="min-w-0 text-[#d7eee3] break-words">{{ details.to.name }}</span>
      <span class="text-[#789789]">XYZ</span><span class="font-mono text-[#a9cbb9]">{{ coordinateText(details.to) }}</span>
      <span class="text-[#789789]">距离</span><span class="font-mono text-[#75efc3]">{{ details.distance.toFixed(2) }}</span>
    </div>

    <div v-if="details.type === 'teleport' && details.previous" class="mt-10px rounded-7px bg-[#152b23] p-9px text-11px text-[#9fb8ac]">
      <div>传送前目标：{{ details.previous.name }}</div>
      <div class="mt-3px font-mono">XYZ {{ coordinateText(details.previous) }}</div>
      <div v-if="details.previousDistance !== null" class="mt-3px">若直接前往当前目标：{{ details.previousDistance.toFixed(2) }}</div>
    </div>

    <div class="mt-12px flex items-center justify-between gap-8px">
      <span class="text-11px text-[#789789]">复制后可直接发给我排查</span>
      <button type="button" class="min-h-34px shrink-0 rounded-6px border border-[#39735b] bg-[#173a2d] px-10px text-11px text-[#9ff5d2]" @click="copyDebug">{{ copied ? '已复制' : '复制调试数据' }}</button>
    </div>
    <div class="mt-7px max-h-150px overflow-y-auto whitespace-pre-wrap break-all rounded-6px bg-[#07130f] p-8px font-mono text-10px text-[#77998a] select-text">{{ debugText }}</div>
  </div>
</template>
