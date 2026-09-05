<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useExplorerStore } from '../../stores/explorer.ts'
import WuScrollArea from '../base/WuScrollArea.vue'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { dataset, selectedSonataIds } = storeToRefs(store)
</script>

<template>
  <div id="sonata-filters" tabindex="-1" class="border-b border-[var(--line)] p-18px">
    <div class="mb-13px flex items-center justify-between gap-12px">
      <div>
        <span class="block text-12px min-[1024px]:text-8px text-[#608176] font-800 tracking-[0.18em]">SONATA EFFECT</span>
        <div class="mt-4px text-14px text-[#e7f1ec] font-[650]">按合鸣效果筛选</div>
      </div>
      <button class="min-h-44px min-[1024px]:min-h-0 cursor-pointer border-0 bg-transparent p-2px text-14px min-[1024px]:text-10px text-[#789087] font-inherit" type="button" @click="store.clearSonataFilters">清除</button>
    </div>
    <WuScrollArea :unbounded="compact"
      class="min-[1024px]:max-h-148px"
      :content-class="compact ? 'grid grid-flow-col auto-cols-88px gap-8px overflow-x-auto py-2px' : 'grid grid-cols-4 gap-6px pr-2px'"
    >
      <button
        v-for="sonata in dataset?.sonatas"
        :key="sonata.id"
        class="flex h-88px min-[1024px]:h-64px min-w-0 cursor-pointer flex-col items-center rounded-6px border px-3px pb-4px pt-6px font-inherit"
        :class="selectedSonataIds.includes(sonata.id)
          ? 'border-[rgba(101,241,194,0.5)] bg-[rgba(39,78,66,0.66)]'
          : 'border-transparent bg-[rgba(29,50,44,0.62)] hover:border-[rgba(101,241,194,0.5)] hover:bg-[rgba(39,78,66,0.66)]'"
        :title="sonata.name"
        :aria-pressed="selectedSonataIds.includes(sonata.id)"
        type="button"
        @click="store.toggleSonata(sonata.id)"
      >
        <img loading="lazy" decoding="async" v-if="sonata.iconUrl" class="h-36px w-36px object-contain" :src="sonata.iconUrl" alt="" />
        <span class="w-full whitespace-normal break-words text-12px leading-tight min-[1024px]:overflow-hidden min-[1024px]:text-ellipsis min-[1024px]:whitespace-nowrap min-[1024px]:text-8px text-[#b9c9c2]">{{ sonata.name }}</span>
      </button>
    </WuScrollArea>
  </div>
</template>
