<script setup lang="ts">
import { buttonClasses } from './base/button-styles.ts'
import { vTooltip } from './base/tooltip.ts'
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
const lastCommitTime = __LAST_COMMIT_TIME__
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
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-[8px] text-[#71877e]">
            <span
              class="text-right text-[12px] min-[1024px]:text-[8px] leading-[1.45]"
              :data-datetime="lastCommitTime"
              v-tooltip="'最新提交时间'"
            >
              {{ new Date(lastCommitTime).toLocaleString('zh-CN', { hour12: false }) }}
            </span>
            <a
              href="https://github.com/wuwa-kit/echo-map"
              target="_blank"
              rel="noopener noreferrer"
              v-tooltip="'查看 GitHub 仓库'"
              class="shrink-0 transition-colors hover:text-[#f1faf5]"
            >
              <WuSvg name="github" class="[--wu-svg-h:16px]" />
            </a>
          </div>
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
