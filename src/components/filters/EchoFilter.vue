<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuScrollArea from '../base/WuScrollArea.vue'
import WuInput from '../base/WuInput.vue'
import { echoMembers } from '../../domain/point-library.ts'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { dataset, allEchoLocations, echoSearch, echoesMatchingSonata, selectedEchoIds, selectedStateId, visibleEchoLocations, pointSource, matchingMonsterCount } = storeToRefs(store)

const locationCountByEcho = computed(() => {
  const counts = new Map<string, number>()
  for (const location of allEchoLocations.value) {
    if (location.stateId === selectedStateId.value) {
      for (const { echoId } of echoMembers(location)) counts.set(echoId, (counts.get(echoId) ?? 0) + 1)
    }
  }
  return counts
})
</script>

<template>
  <div id="echo-filters" tabindex="-1" class="border-b border-[var(--line)] p-18px">
    <div class="mb-13px flex items-center justify-between gap-12px">
      <div>
        <span class="block text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">ECHO TARGETS</span>
        <div class="mt-4px text-14px text-[#e7f1ec] font-[650]">选择声骸</div>
      </div>
      <span class="text-14px min-[1024px]:text-10px text-[var(--accent)] font-600">{{ visibleEchoLocations.length }} 处<span v-if="pointSource === 'manual'"> · {{ matchingMonsterCount }} 只</span></span>
    </div>
    <div class="mb-10px flex h-44px w-full min-[1024px]:h-34px items-center gap-7px border border-[var(--line)] rounded-7px bg-[rgba(21,40,35,0.78)] px-10px text-[#6f887f] focus-within:border-[rgba(101,241,194,0.55)]">
      <span>⌕</span>
      <WuInput aria-label="搜索声骸" variant="plain" size="sm" :model-value="echoSearch" type="search" :placeholder="`搜索 ${dataset?.echoes.length ?? 0} 个 C1/C3 声骸`" @update:model-value="store.setEchoSearch" />
    </div>
    <WuScrollArea :unbounded="compact"
      class="min-[1024px]:max-h-290px"
      content-class="flex flex-col gap-4px pr-2px"
    >
      <button
        v-for="echo in echoesMatchingSonata"
        :key="echo.id"
        :aria-pressed="selectedEchoIds.includes(echo.id)"
        class="grid min-h-48px w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_20px] items-center rounded-6px border px-8px py-4px pl-4px text-left font-inherit"
        :class="selectedEchoIds.includes(echo.id)
          ? 'border-[rgba(101,241,194,0.34)] bg-[rgba(34,65,55,0.66)]'
          : 'border-transparent bg-[rgba(25,43,38,0.48)] hover:border-[rgba(101,241,194,0.34)] hover:bg-[rgba(34,65,55,0.66)]'"
        type="button"
        @click="store.toggleEcho(echo.id)"
      >
        <img loading="lazy" decoding="async" class="h-38px w-38px object-contain" :src="echo.iconUrl" alt="" />
        <span class="flex overflow-hidden flex-col items-start gap-3px">
          <span class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-14px min-[1024px]:text-11px text-[#dce9e3] font-[560]">{{ echo.name }}</span>
          <span class="text-12px min-[1024px]:text-9px text-[#70877e]">COST {{ echo.cost }} · {{ locationCountByEcho.get(echo.id) ?? 0 }} 处</span>
        </span>
        <span class="text-center text-13px text-[var(--accent)]">{{ selectedEchoIds.includes(echo.id) ? '✓' : '+' }}</span>
      </button>
    </WuScrollArea>
    <div v-if="echoesMatchingSonata.length === 0" class="py-18px text-center text-14px text-[var(--muted)]" role="status">没有匹配的声骸，试试其他名称或合鸣效果。</div>
    <button class="min-h-44px min-[1024px]:min-h-0 mt-10px w-full cursor-pointer border border-[var(--line)] rounded-6px bg-transparent p-8px text-14px min-[1024px]:text-10px text-[#8fa49c] font-inherit" type="button" @click="store.clearFilters">重置声骸与合鸣筛选</button>
  </div>
</template>
