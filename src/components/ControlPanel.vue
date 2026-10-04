<script setup lang="ts">
import { buttonClasses } from './base/button-styles.ts'
import WuButton from './base/WuButton.vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import WuScrollArea from './base/WuScrollArea.vue'
import WuSvg from './base/WuSvg.vue'
import { useExplorerStore } from '../stores/explorer.ts'
import EchoFilter from './filters/EchoFilter.vue'
import RoutePanel from './RoutePanel.vue'

defineProps<{ compact: boolean }>()
defineEmits<{ editRequested: [] }>()

const store = useExplorerStore()
const { dataset } = storeToRefs(store)
</script>

<template>
  <div class="min-h-0 flex flex-1 flex-col">
    <WuScrollArea class="min-h-0 flex-1" content-class="pb-[16px]">
      <div v-if="dataset && !compact" class="border-b border-[var(--line)] p-[18px]">
        <div class="flex items-center justify-between gap-[12px]">
          <div class="flex min-w-0 items-center gap-[11px]">
            <WuSvg name="brand" class="shrink-0 text-[var(--accent)] [--wu-svg-h:34px]" />
            <div class="min-w-0 leading-none">
              <span class="block font-serif text-[21px] text-[#f1faf5] font-medium tracking-[0.12em]">声巡</span>
              <span class="mt-[6px] block truncate text-[7px] text-[#789087] font-bold tracking-[0.15em]">WUTHERING ECHO ROUTE</span>
            </div>
          </div>
          <span
            class="shrink-0 text-right text-[12px] min-[1024px]:text-[8px] text-[#71877e] leading-[1.45]"
            :data-datetime="dataset.source.generatedAt"
          >
            <span class="block">数据</span>
            <span class="block">{{ new Date(dataset.source.generatedAt).toLocaleDateString('zh-CN') }}</span>
          </span>
        </div>
      </div>

      <div class="border-b border-[var(--line)] p-[16px]">
        <div class="min-w-0 flex items-center gap-[4px] whitespace-nowrap">
          <WuButton variant="ghost" tone="accent" :size="compact ? 'lg' : 'xs'" @click="$emit('editRequested')">点位录入</WuButton>
          <RouterLink to="/assets" target="_blank" rel="noopener" :class="buttonClasses({ variant: 'ghost', tone: 'accent', size: compact ? 'lg' : 'xs' })">资产浏览</RouterLink>
        </div>
      </div>
      <EchoFilter :compact="compact" />
      <RoutePanel />
    </WuScrollArea>
  </div>
</template>
