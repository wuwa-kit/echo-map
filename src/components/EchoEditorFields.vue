<script setup lang="ts">
import WuButton from './base/WuButton.vue'
import { computed, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuInput from './base/WuInput.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const store = usePointEditorStore()
const { dataset, draft, busy, monsterSearch, inputErrors } = storeToRefs(store)
const adding = shallowRef(false)
const echoes = computed(() => dataset.value?.echoes.filter((echo) => echo.name.includes(monsterSearch.value.trim())) ?? [])
const echoById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo])))
function add(echoId: string): void {
  store.addMember(echoId)
  store.setMonsterSearch('')
  adding.value = false
}
</script>

<template>
  <div v-if="draft?.kind === 'echo'" class="mt-24px">
    <div class="mb-10px text-13px font-600">声骸与数量</div>
    <div v-for="member in draft.members" :key="member.echoId" class="mb-8px">
      <div class="flex items-center gap-8px rounded-8px bg-[#152c22] p-8px">
        <img :src="echoById.get(member.echoId)?.iconUrl" class="h-32px w-32px object-contain" />
        <span class="min-w-0 flex-1 text-12px">{{ echoById.get(member.echoId)?.name }}</span>
        <div class="flex shrink-0 items-center gap-2px">
          <WuButton size="sm" icon="minus" icon-only :tooltip="member.count === 1 ? '移除此声骸' : '减少数量'" :disabled="busy" @click="store.adjustMemberCount(member.echoId, -1)"></WuButton>
          <span class="min-w-30px text-center text-13px tabular-nums">{{ member.count }}</span>
          <WuButton size="sm" icon="plus" icon-only tooltip="增加数量" :disabled="busy || member.count >= 999" @click="store.adjustMemberCount(member.echoId, 1)"></WuButton>
        </div>
      </div>
    </div>
    <div v-if="inputErrors.members" class="mb-8px text-12px text-[#ffad9f]">{{ inputErrors.members }}</div>
    <WuButton class="w-full" tone="accent" :icon="adding ? 'chevron-down' : 'plus'" :disabled="busy" @click="adding = !adding">{{ adding ? '收起' : '添加声骸' }}</WuButton>
    <div v-if="adding" class="mt-8px">
      <WuInput :model-value="monsterSearch" type="search" placeholder="搜索声骸" @update:model-value="store.setMonsterSearch" />
      <WuScrollArea class="mt-6px max-h-240px" content-class="grid grid-cols-2 gap-5px">
        <button v-for="echo in echoes" :key="echo.id" type="button" class="flex min-h-44px items-center gap-6px border border-[var(--line)] rounded-6px bg-[#10251b] p-6px text-left text-11px text-[#c7dfd2]" :disabled="busy" @click="add(echo.id)">
          <img :src="echo.iconUrl" class="h-28px w-28px object-contain" loading="lazy" /><span>{{ echo.name }}</span>
        </button>
        <div v-if="!echoes.length" class="p-8px text-12px text-[#789788]">没有匹配的声骸</div>
      </WuScrollArea>
    </div>
  </div>
</template>
