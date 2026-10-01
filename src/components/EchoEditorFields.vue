<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteQuery } from '@vueuse/router'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { compactWikiEchoId } from '../url/wiki-id.ts'
import type { WuSelectValue } from './base/select-context.ts'
import EchoPointIcon from './EchoPointIcon.vue'
import WuInput from './base/WuInput.vue'
import WuCheckBox from './base/WuCheckBox.vue'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const props = defineProps<{ section: 'tracking' | 'members' }>()
const store = usePointEditorStore()
const { dataset, draft, busy, trackingEchoId, monsterSearch, echoCost } = storeToRefs(store)
const costQuery = useRouteQuery<string | undefined>('cost', undefined, { mode: 'replace' })
onMounted(() => {
  if (props.section !== 'tracking') return
  const cost = costQuery.value === '1' ? 1 : costQuery.value === '3' ? 3 : 0
  store.setEchoCost(cost)
  costQuery.value = cost ? String(cost) : undefined
})
function setCost(cost: 0 | 1 | 3): void {
  store.setEchoCost(cost)
  costQuery.value = cost ? String(cost) : undefined
}
const membersExpanded = shallowRef(true)
const echoes = computed(() => dataset.value?.echoes.filter((echo) => echo.name.includes(monsterSearch.value.trim()) && (!echoCost.value || echo.cost === echoCost.value)) ?? [])
const echoById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo])))
const trackingQuery = useRouteQuery<string | undefined>('tracking', undefined, { mode: 'replace' })
const toolbarButtonClass = 'min-h-32px rounded-6px border border-[var(--line)] bg-[#142a22] px-10px text-12px text-[#c7dfd2] disabled:opacity-40'
function setTracking(value: WuSelectValue): void {
  store.setTrackingEcho(typeof value === 'string' ? value : '')
  trackingQuery.value = compactWikiEchoId(trackingEchoId.value)
}
</script>

<template>
  <div v-if="section === 'tracking' && draft?.kind === 'echo' && dataset" class="rounded-8px border border-[var(--line)] bg-[#142d22] p-9px">
    <div class="mb-5px text-12px text-[#a8cbb8]">追踪声骸</div>
    <WuInput :model-value="monsterSearch" placeholder="搜索声骸" @update:model-value="store.setMonsterSearch" />
    <div class="my-6px flex gap-5px"><button v-for="cost in ([0, 1, 3] as const)" :key="cost" :class="toolbarButtonClass" @click="setCost(cost)">{{ cost ? `C${cost}` : '全部' }}{{ echoCost === cost ? ' ✓' : '' }}</button></div>
    <WuSelect :model-value="trackingEchoId" :disabled="busy" @update:model-value="setTracking">
      <WuOption value="">未选择</WuOption>
      <WuOption v-if="trackingEchoId && !echoes.some(({ id }) => id === trackingEchoId)" :value="trackingEchoId">{{ echoById.get(trackingEchoId)?.name }}</WuOption>
      <WuOption v-for="echo in echoes" :key="echo.id" :value="echo.id">{{ echo.name }} · C{{ echo.cost }}</WuOption>
    </WuSelect>
    <button v-if="trackingEchoId && !draft.members.some(({ echoId }) => echoId === trackingEchoId)" type="button" class="mt-6px min-h-32px w-full rounded-5px border border-[var(--line)] bg-[#173328] text-11px text-[#bde2ce]" :disabled="busy" @click="store.addMember(trackingEchoId)">加入本次记录</button>
  </div>

  <div v-if="section === 'members' && draft?.kind === 'echo' && dataset" class="mt-8px rounded-8px border border-[var(--line)] p-9px">
    <button type="button" class="w-full flex items-center gap-9px border-0 bg-transparent p-0 text-left" @click="membersExpanded = !membersExpanded"><EchoPointIcon :members="draft.members" :echoes="dataset.echoes" /><span class="min-w-0 flex-1"><span class="block text-12px font-600">怪物清单</span><span class="mt-2px block text-11px text-[#789788]">{{ draft.members.length }} 种 · {{ draft.members.reduce((sum, member) => sum + member.count, 0) }} 只</span></span><span class="text-11px text-[#83b69e]">{{ membersExpanded ? '收起' : '管理' }}</span></button>
    <div v-if="membersExpanded" class="mt-9px border-t border-[var(--line)] pt-9px">
      <WuCheckBox :model-value="draft.compositionStatus === 'complete'" :disabled="busy" class="mb-8px flex min-h-32px items-center gap-7px text-11px text-[#a9c7b6]" @update:model-value="store.setCompositionComplete">怪物清单已补齐</WuCheckBox>
      <div v-for="member in draft.members" :key="member.echoId" class="mb-5px flex items-center gap-5px rounded-6px bg-[#152c22] px-7px py-5px"><img :src="echoById.get(member.echoId)?.iconUrl" class="h-28px w-28px object-contain" /><span class="min-w-0 flex-1 truncate text-11px">{{ echoById.get(member.echoId)?.name ?? member.echoId }}</span><div class="w-48px shrink-0"><WuInput size="sm" type="number" min="1" max="999" :model-value="member.count" :disabled="busy" @update:model-value="store.setMemberCount(member.echoId, Number($event))" /></div><button type="button" class="h-30px border-0 bg-transparent px-3px text-11px text-[#9dac9f]" :disabled="busy" @click="store.removeMember(member.echoId)">移除</button></div>
      <WuInput class="mt-6px" :model-value="monsterSearch" type="search" placeholder="搜索并添加怪物" @update:model-value="store.setMonsterSearch" />
      <WuScrollArea class="mt-6px max-h-180px" content-class="grid grid-cols-2 gap-5px"><button v-for="echo in echoes" :key="echo.id" type="button" class="flex min-h-40px items-center gap-5px rounded-5px border border-[var(--line)] bg-[#10251b] p-4px text-left" :disabled="busy" @click="store.addMember(echo.id)"><img :src="echo.iconUrl" class="h-26px w-26px object-contain" loading="lazy" /><span class="min-w-0 text-10px leading-relaxed">{{ echo.name }}<span class="block text-9px text-[#789788]">C{{ echo.cost }} ＋</span></span></button></WuScrollArea>
    </div>
  </div>

</template>
