<script setup lang="ts">
import EchoFilterControls from './EchoFilterControls.vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuScrollArea from '../base/WuScrollArea.vue'
import WuCheckBox from '../base/WuCheckBox.vue'
import WuSvg from '../base/WuSvg.vue'
import WuTooltip from '../base/WuTooltip.vue'
import { echoLocationCoverage } from '../../route/route-groups.ts'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { supportsGravity, selectedGravity } = storeToRefs(store)
const { dataset, allEchoLocations, candidateEchoes, echoCostFilters, echoSearch, filteredEchoes, selectedEchoIds, selectedStateId, sonataFilterIds } = storeToRefs(store)

const selectedEchoIdSet = computed(() => new Set(selectedEchoIds.value))
const selectedEchoes = computed(() => {
  const echoesById = new Map(dataset.value?.echoes.map((echo) => [echo.id, echo]) ?? [])
  return selectedEchoIds.value.flatMap((id) => {
    const echo = echoesById.get(id)
    return echo ? [echo] : []
  })
})
const currentSelectedCount = computed(() => candidateEchoes.value.filter(({ id }) => selectedEchoIdSet.value.has(id)).length)
const allCurrentSelected = computed(() => candidateEchoes.value.length > 0 && currentSelectedCount.value === candidateEchoes.value.length)
const someCurrentSelected = computed(() => currentSelectedCount.value > 0 && !allCurrentSelected.value)
function setCurrentSelection(selected: boolean): void {
  if (selected) store.selectCandidateEchoes()
  else store.deselectCandidateEchoes()
}

const locationCoverageByEcho = computed(() => dataset.value ? echoLocationCoverage(
  allEchoLocations.value, selectedStateId.value, selectedGravity.value, dataset.value,
) : new Map())
</script>

<template>
  <div id="echo-filters" class="relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[var(--line)] p-[18px]">
    <EchoFilterControls :sonatas="dataset?.sonatas ?? []" :sonata-ids="sonataFilterIds" :costs="echoCostFilters" :search="echoSearch" :compact="compact" @sonatas-changed="store.setSonataFilters" @costs-changed="store.setEchoCostFilters" @search-changed="store.setEchoSearch">
      <WuCheckBox
        class="flex shrink-0 items-center gap-[6px] text-[12px] min-[1024px]:text-[9px] text-[#8fa69d]"
        :model-value="allCurrentSelected"
        :indeterminate="someCurrentSelected"
        :disabled="candidateEchoes.length === 0"
        @update:model-value="setCurrentSelection"
      >{{ currentSelectedCount }} / {{ candidateEchoes.length }}</WuCheckBox>
    </EchoFilterControls>
    <WuScrollArea
      class="h-[290px]"
      content-class="flex flex-col gap-[4px] pr-[2px]"
    >
      <div
        v-if="echoSearch.trim() !== '' && filteredEchoes.length === 0"
        class="h-[290px] flex items-center justify-center px-[16px] text-center text-[12px] text-[var(--muted)]"
      >未找到匹配的声骸</div>
      <button
        v-for="echo in filteredEchoes"
        :key="echo.id"
        class="grid min-h-[48px] w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_20px] items-center rounded-[6px] outline -outline-offset-1 px-[8px] py-[4px] pl-[4px] text-left [font-family:inherit]"
        :class="selectedEchoIds.includes(echo.id)
          ? 'outline-[rgba(101,241,194,0.34)] bg-[rgba(34,65,55,0.66)]'
          : 'outline-transparent bg-[rgba(25,43,38,0.48)] hover:outline-[rgba(101,241,194,0.34)] hover:bg-[rgba(34,65,55,0.66)]'"
        type="button"
        @click="store.toggleEcho(echo.id)"
      >
        <img loading="lazy" decoding="async" class="h-[38px] w-[38px] object-contain" :src="echo.iconUrl" />
        <span class="flex overflow-hidden flex-col items-start gap-[3px]">
          <span class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[14px] min-[1024px]:text-[11px] text-[#dce9e3] font-[560]">{{ echo.name }}</span>
          <span
            class="text-[12px] min-[1024px]:text-[9px]"
            :class="(locationCoverageByEcho.get(echo.id)?.current ?? 0) === 0 && (locationCoverageByEcho.get(echo.id)?.total ?? 0) > 0 ? 'text-[#d3b680]' : 'text-[#70877e]'"
          >COST {{ echo.cost }} · 当前 {{ locationCoverageByEcho.get(echo.id)?.current ?? 0 }} / 全部 {{ locationCoverageByEcho.get(echo.id)?.total ?? 0 }} 处<span v-if="(locationCoverageByEcho.get(echo.id)?.stateCount ?? 0) > 1"> · {{ locationCoverageByEcho.get(echo.id)?.stateCount }} 图</span></span>
        </span>
        <WuSvg :name="selectedEchoIds.includes(echo.id) ? 'check' : 'plus'" class="text-[var(--accent)] [--wu-svg-h:14px]" />
      </button>
    </WuScrollArea>
    <div v-if="selectedEchoes.length" class="mt-[10px] min-w-0 relative after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-[var(--line)] pt-[10px]">
      <div class="min-w-0 overflow-x-auto overscroll-x-contain pb-[2px]">
        <div class="w-max flex gap-[5px]">
          <WuTooltip v-for="echo in selectedEchoes" :key="echo.id" :content="echo.name" placement="top" :gap="6" class="shrink-0">
            <button type="button" class="h-[36px] w-[36px] shrink-0 flex cursor-pointer items-center justify-center rounded-[6px] outline -outline-offset-1 outline-[rgba(101,241,194,0.34)] bg-[rgba(34,65,55,0.66)] p-[2px] hover:outline-[rgba(101,241,194,0.72)] hover:bg-[#264b3c]" @click="store.toggleEcho(echo.id)">
              <img class="h-[30px] w-[30px] object-contain" :src="echo.iconUrl" />
            </button>
          </WuTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
