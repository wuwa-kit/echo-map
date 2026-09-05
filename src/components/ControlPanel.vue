<script setup lang="ts">
import { storeToRefs } from 'pinia'
import WuCheckBox from './base/WuCheckBox.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import MapScopeFilter from './filters/MapScopeFilter.vue'
import SonataFilter from './filters/SonataFilter.vue'
import EchoFilter from './filters/EchoFilter.vue'
import NavigationPointFilter from './filters/NavigationPointFilter.vue'

defineProps<{ compact: boolean }>()

const store = useExplorerStore()
const { dataset, showProvisional } = storeToRefs(store)

function scrollToSection(id: string): void {
  const target = document.getElementById(id)
  target?.scrollIntoView({ block: 'start' })
  target?.focus({ preventScroll: true })
}
</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col">
    <div v-if="compact" class="grid shrink-0 grid-cols-3 gap-6px border-b border-[var(--line)] px-12px" role="group" aria-label="筛选分类导航">
      <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent text-14px text-[var(--accent)]" @click="scrollToSection('echo-filters')">声骸</button>
      <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent text-14px text-[var(--accent)]" @click="scrollToSection('sonata-filters')">合鸣</button>
      <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent text-14px text-[var(--accent)]" @click="scrollToSection('point-filters')">定位点</button>
    </div>
    <WuScrollArea class="min-h-0 flex-1" content-class="pb-16px">
      <div v-if="dataset && !compact" class="border-b border-[var(--line)] p-18px" role="banner">
        <div class="flex items-center justify-between gap-12px">
          <div class="flex min-w-0 items-center gap-11px">
            <span
              class="relative h-31px w-31px shrink-0 border border-[rgba(101,241,194,0.58)] rounded-full shadow-[inset_0_0_14px_rgba(101,241,194,0.12),0_0_20px_rgba(101,241,194,0.09)]"
              aria-hidden="true"
            >
              <span class="absolute left-9px top-7px h-15px w-1px origin-bottom rotate-[-28deg] bg-[var(--accent)]" />
              <span class="absolute left-15px top-4px h-19px w-1px origin-bottom bg-[var(--accent)]" />
              <span class="absolute right-9px top-7px h-15px w-1px origin-bottom rotate-[28deg] bg-[var(--accent)]" />
            </span>
            <div class="min-w-0 leading-none">
              <span class="block font-serif text-21px text-[#f1faf5] font-500 tracking-[0.12em]">声巡</span>
              <span class="mt-6px block truncate text-7px text-[#789087] font-700 tracking-[0.15em]">WUTHERING ECHO ROUTE</span>
            </div>
          </div>
          <span
            class="shrink-0 text-right text-12px min-[1024px]:text-8px text-[#71877e] leading-[1.45]"
            :data-datetime="dataset.source.generatedAt"
          >
            <span class="block">数据</span>
            <span class="block">{{ new Date(dataset.source.generatedAt).toLocaleDateString('zh-CN') }}</span>
          </span>
        </div>
        <div class="mt-14px grid grid-cols-3 gap-6px">
          <div class="min-w-0 border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.56)] px-8px py-7px">
            <span class="block truncate text-14px text-[#d8eee5] font-600">{{ dataset.report.includedEchoCount }}</span>
            <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#71877e]">C1/C3 声骸</span>
          </div>
          <div class="min-w-0 border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.56)] px-8px py-7px">
            <span class="block truncate text-14px text-[#d8eee5] font-600">{{ dataset.echoLocations.length.toLocaleString('zh-CN') }}</span>
            <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#71877e]">声骸点</span>
          </div>
          <div class="min-w-0 border border-[var(--line)] rounded-6px bg-[rgba(24,43,37,0.56)] px-8px py-7px">
            <span class="block truncate text-14px text-[#d8eee5] font-600">{{ dataset.navigationPoints.length.toLocaleString('zh-CN') }}</span>
            <span class="mt-2px block text-12px min-[1024px]:text-8px text-[#71877e]">定位点</span>
          </div>
        </div>
      </div>

      <MapScopeFilter :compact="compact" />

      <SonataFilter :compact="compact" />

      <EchoFilter :compact="compact" />

      <NavigationPointFilter :compact="compact" />

      <div class="flex flex-wrap gap-x-15px gap-y-8px border-b border-[var(--line)] px-18px py-13px">
        <WuCheckBox
          class="flex min-h-44px items-center gap-8px text-14px min-[1024px]:text-10px text-[#a7b8b1]"
          :model-value="showProvisional"
          @update:model-value="store.setProvisionalVisible"
        >
          待补 XYZ 声骸
        </WuCheckBox>
      </div>

    </WuScrollArea>
  </div>
</template>
