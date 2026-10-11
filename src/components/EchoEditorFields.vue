<script setup lang="ts">
import WuButton from './base/WuButton.vue'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { searchEchoes } from '../domain/echo-search.ts'
import EchoFilterControls from './filters/EchoFilterControls.vue'
import { useEditorEchoFiltersStore } from '../stores/editor-echo-filters.ts'
import { selectEchoDefinitions } from '../domain/explorer-selectors.ts'
import WuScrollArea from './base/WuScrollArea.vue'
import echoNotesJson from '../../data/config/echo-notes.json?raw'
import { echoNotesSchema } from '../domain/schema.ts'

const echoNotes = echoNotesSchema.parse(JSON.parse(echoNotesJson))

const store = usePointEditorStore()
const filters = useEditorEchoFiltersStore()
const { dataset, draft, busy, monsterSearch, inputErrors } = storeToRefs(store)
const echoes = computed(() => searchEchoes(selectEchoDefinitions(dataset.value?.echoes ?? [], filters.sonataIds, filters.costs, ''), monsterSearch.value))
const echoById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo])))
const counts = computed(() => new Map(draft.value?.kind === 'echo' ? draft.value.members.map(({ echoId, count }) => [echoId, count]) : []))
const echoList = useTemplateRef<InstanceType<typeof WuScrollArea>>('echoListRef')
const echoItems = useTemplateRef<HTMLElement[]>('echoItemsRef')
const highlightedId = shallowRef<string | null>(null)
const { start: clearHighlight, stop: cancelHighlight } = useTimeoutFn(() => { highlightedId.value = null }, 1500, { immediate: false })

function selectedEchoTooltip(echoId: string): string {
  const echo = echoById.value.get(echoId)
  return echo ? `C${echo.cost} · ${echo.name}` : ''
}

function add(echoId: string): void {
  if (!busy.value) store.addMember(echoId)
}

async function locateEcho(echoId: string): Promise<void> {
  if (!echoes.value.some(({ id }) => id === echoId)) {
    store.setMonsterSearch('')
    filters.setSonatas([])
    filters.setCosts([])
  }
  await nextTick()
  const viewport = echoList.value?.viewport
  const item = echoItems.value?.find((element) => element.dataset.echoId === echoId)
  if (!viewport || !item) return
  viewport.scrollTo({
    top: viewport.scrollTop + item.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (viewport.clientHeight - item.clientHeight) / 2,
    behavior: 'smooth',
  })
  cancelHighlight()
  highlightedId.value = echoId
  clearHighlight()
}
</script>

<template>
  <div v-if="draft?.kind === 'echo'" class="mt-[24px]">
    <div class="mb-[10px] text-[13px] font-semibold">声骸与数量</div>
    <EchoFilterControls :sonatas="dataset?.sonatas ?? []" :sonata-ids="filters.sonataIds" :costs="filters.costs" :search="monsterSearch" @sonatas-changed="filters.setSonatas" @costs-changed="filters.setCosts" @search-changed="store.setMonsterSearch" />
    <WuScrollArea ref="echoListRef" class="mt-[6px] max-h-[240px]" content-class="grid grid-cols-2 gap-[5px]">
      <div
        v-for="echo in echoes" :key="echo.id" ref="echoItemsRef" :data-echo-id="echo.id"
        v-tooltip="echoNotes[echo.name]"
        class="flex min-h-[48px] min-w-0 items-center gap-[2px] rounded-[6px] outline -outline-offset-1 p-[4px] transition-colors duration-150"
        :class="highlightedId === echo.id ? 'outline-[var(--accent)] bg-[#28533e]' : counts.has(echo.id) ? 'outline-[#377c60] bg-[#193329]' : 'outline-[var(--line)] bg-[#10251b]'"
      >
        <button type="button" class="flex min-w-0 flex-1 cursor-pointer items-center gap-[4px] text-left text-[11px] text-[#c7dfd2] disabled:cursor-not-allowed" :disabled="busy || (counts.get(echo.id) ?? 0) >= 999" @click="add(echo.id)">
          <img :src="echo.iconUrl" class="h-[24px] w-[24px] shrink-0 object-contain" loading="lazy" />
          <span class="min-w-0 break-all leading-[14px]">{{ echo.name }}</span>
        </button>
        <div class="flex shrink-0 items-center">
          <template v-if="counts.has(echo.id)">
            <WuButton size="xs" variant="ghost" icon="minus" icon-only :disabled="busy" @click="store.adjustMemberCount(echo.id, -1)" />
            <span class="min-w-[2ch] text-center text-[12px] text-[var(--accent)] tabular-nums">{{ counts.get(echo.id) }}</span>
          </template>
          <WuButton size="xs" variant="ghost" tone="accent" icon="plus" icon-only :disabled="busy || (counts.get(echo.id) ?? 0) >= 999" @click="add(echo.id)" />
        </div>
      </div>
      <div v-if="!echoes.length" class="col-span-2 p-[8px] text-[12px] text-[#789788]">没有匹配的声骸</div>
    </WuScrollArea>
    <div class="mt-[16px] grid min-h-[44px] grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-[5px]">
      <div v-if="inputErrors.members" class="col-span-full flex min-h-[44px] items-center text-[12px] text-[#ffad9f]">{{ inputErrors.members }}</div>
      <button v-for="member in draft.members" :key="member.echoId" v-tooltip="selectedEchoTooltip(member.echoId)" type="button" class="flex min-h-[44px] cursor-pointer items-center justify-center gap-[3px] rounded-[6px] outline -outline-offset-1 outline-[#377c60] bg-[#193329] p-[4px] hover:outline-[var(--accent)] hover:bg-[#28533e]" @click="locateEcho(member.echoId)">
        <img :src="echoById.get(member.echoId)?.iconUrl" class="h-[26px] w-[26px] object-contain" />
        <span class="text-[12px] text-[var(--accent)] tabular-nums">{{ member.count }}</span>
      </button>
    </div>
  </div>
</template>
