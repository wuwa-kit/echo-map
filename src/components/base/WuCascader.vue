<script setup lang="ts">
import { vTooltip } from './tooltip.ts'
import WuButton from './WuButton.vue'
import { computed, shallowRef, useAttrs, useId, useTemplateRef } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { cascaderColumns, resolveCascaderChoice, resolveCascaderPath } from './cascader.ts'
import type { WuCascaderOption } from './cascader.ts'
import WuScrollArea from './WuScrollArea.vue'
import WuSvg from './WuSvg.vue'
import WuPopover from './WuPopover.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  options: readonly WuCascaderOption[]
  initialExpandedValues?: readonly string[]
  selectedValue?: string | null
  placeholder?: string
  title?: string
  rootLabel?: string
  emptyText?: string
  disabled?: boolean
  showHeader?: boolean
  showPath?: boolean
  compact?: boolean
  popoverGap?: number
  popoverViewportMargin?: number
}>(), {
  placeholder: '请选择',
  initialExpandedValues: () => [],
  selectedValue: null,
  rootLabel: '全部',
  emptyText: '暂无选项',
  disabled: false,
  showHeader: true,
  showPath: true,
  compact: false,
  popoverGap: 8,
  popoverViewportMargin: 12,
})
const emit = defineEmits<{ select: [value: string, path: readonly string[]] }>()
const attrs = useAttrs()
const componentId = useId()
const panelId = `wu-cascader-panel-${componentId}`
const trigger = useTemplateRef<HTMLButtonElement>('triggerRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const isOpen = shallowRef(false)
const expandedValues = shallowRef<readonly string[]>([])
const narrow = useMediaQuery('(max-width: 639px)')
const path = computed(() => resolveCascaderPath(props.options, expandedValues.value))
const columns = computed(() => cascaderColumns(props.options, expandedValues.value))
const visibleColumns = computed(() => narrow.value ? columns.value.slice(-1) : columns.value)
const panelWidth = computed(() => narrow.value ? 'viewport' : props.compact ? 'content' : Math.max(220, columns.value.length * 210))

function onOpened(): void {
  expandedValues.value = props.initialExpandedValues
  isOpen.value = true
}

function onClosed(): void {
  isOpen.value = false
  expandedValues.value = []
}

function close(): void {
  popover.value?.hide()
}

function choose(depth: number, value: string): void {
  if (props.disabled) return
  const choice = resolveCascaderChoice(props.options, expandedValues.value, depth, value)
  if (!choice) return
  if (choice.kind === 'expand') {
    expandedValues.value = choice.path
  } else {
    emit('select', choice.option.value, choice.path)
    close()
  }
}

function browseTo(depth: number): void {
  expandedValues.value = path.value.slice(0, depth).map(({ value }) => value)
}
</script>

<template>
  <div class="relative min-w-0">
    <button
      v-bind="attrs" ref="triggerRef" type="button" :disabled="disabled"
      class="h-[var(--wu-cascader-height,44px)] w-full min-w-0 flex cursor-pointer items-center justify-center gap-[var(--wu-cascader-gap,10px)] border border-[var(--line)] rounded-[8px] bg-[#152b24] px-[var(--wu-cascader-padding,14px)] text-[14px] text-[#eaf4ef] shadow-lg hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      :popovertarget="panelId" v-tooltip="placeholder"
    >
      <span class="min-w-0 truncate">{{ placeholder }}</span>
      <WuSvg name="chevron-right" class="shrink-0 text-[var(--accent)] [--wu-svg-h:14px]" :class="isOpen ? 'rotate-90' : ''" />
    </button>
    <WuPopover
      :id="panelId" ref="popoverRef" :anchor="trigger" :disabled="disabled" :width="panelWidth"
      :gap="popoverGap" :viewport-margin="popoverViewportMargin"
      class="border border-[var(--line)] bg-[#101f1a] text-[#dce9e3] shadow-2xl"
      :class="compact ? 'rounded-[9px]' : 'rounded-[12px]'"
      @opened="onOpened" @closed="onClosed"
    >
      <slot v-if="showHeader" name="header" :close="close">
        <div class="flex shrink-0 items-center justify-between gap-[10px] border-b border-[var(--line)] px-[12px] py-[5px]">
          <span class="min-w-0 text-[14px] font-semibold">{{ title ?? placeholder }}</span>
          <WuButton variant="ghost" size="lg" @click="close()">关闭</WuButton>
        </div>
      </slot>
      <div v-if="narrow && showPath" class="flex shrink-0 flex-wrap items-center gap-x-[5px] border-b border-[var(--line)] px-[12px] py-[4px] text-[13px]">
        <WuButton variant="ghost" tone="accent" size="lg" @click="browseTo(0)">{{ rootLabel }}</WuButton>
        <template v-for="(ancestor, index) in path" :key="ancestor.value">
          <WuSvg name="chevron-right" class="text-[#627e70] [--wu-svg-h:12px]" />
          <WuButton variant="ghost" tone="accent" size="lg" @click="browseTo(index + 1)">{{ ancestor.label }}</WuButton>
        </template>
      </div>
      <div class="min-h-0 flex overflow-x-auto overscroll-contain">
        <div
          v-for="column in visibleColumns" :key="column.depth" class="min-h-0 min-w-0 flex flex-col"
          :class="narrow ? 'w-full' : compact ? 'w-max min-w-[112px] max-w-[180px] shrink-0 border-r border-[var(--line)] last:border-r-0' : 'w-[210px] shrink-0 border-r border-[var(--line)] last:border-r-0'"
        >
          <span
            v-if="!narrow && showPath" class="shrink-0 text-[12px] text-[#91ab9d]"
            :class="compact ? 'px-[8px] pb-[3px] pt-[7px]' : 'px-[12px] pb-[5px] pt-[10px]'"
          >{{ column.parent?.label ?? rootLabel }}</span>
          <WuScrollArea size="sm" class="min-h-0 flex-1" :content-class="compact ? 'p-[3px]' : 'p-[5px]'">
            <div class="flex flex-col" :class="compact ? 'gap-[1px]' : 'gap-[3px]'">
              <button
                v-for="option in column.options" :key="option.value"
                type="button" :disabled="option.disabled"
                class="w-full min-w-0 flex cursor-pointer items-center justify-between border-0 text-left disabled:cursor-not-allowed disabled:opacity-40"
                :class="[
                  path[column.depth]?.value === option.value || selectedValue === option.value ? 'bg-[#244b39] text-[#eafff2]' : option.count === 0 ? 'bg-transparent text-[#60746d] hover:bg-[#1c372b]' : 'bg-transparent text-[#dce9e3] hover:bg-[#1c372b]',
                  compact ? 'min-h-[40px] gap-[5px] rounded-[5px] px-[8px] py-[5px]' : 'min-h-[48px] gap-[8px] rounded-[7px] px-[10px] py-[8px]',
                ]"
                @click="choose(column.depth, option.value)"
              >
                <span class="min-w-0">
                  <span class="block wrap-break-word" :class="compact ? 'text-[13px]' : 'text-[14px]'">{{ option.label }}</span>
                  <span v-if="option.description" class="block wrap-break-word text-[#91ab9d]" :class="compact ? 'mt-[2px] text-[11px]' : 'mt-[3px] text-[12px]'">{{ option.description }}</span>
                </span>
                <span v-if="option.count !== undefined || option.children?.length || selectedValue === option.value" class="flex shrink-0 items-center gap-[6px]">
                  <span v-if="option.count !== undefined" class="text-[11px] tabular-nums text-[#91ab9d]">{{ option.count }}</span>
                  <WuSvg v-if="option.children?.length" name="chevron-right" class="text-[#76a58c] [--wu-svg-h:14px]" />
                  <WuSvg v-else-if="selectedValue === option.value" name="check" class="text-[var(--accent)] [--wu-svg-h:14px]" />
                </span>
              </button>
              <div v-if="column.options.length === 0" class="text-[13px] text-[#91ab9d]" :class="compact ? 'px-[8px] py-[12px]' : 'px-[10px] py-[20px]'">{{ emptyText }}</div>
            </div>
          </WuScrollArea>
        </div>
      </div>
      <WuButton v-if="narrow && path.length" variant="ghost" tone="accent" size="lg" icon="chevron-left" @click="browseTo(path.length - 1)">返回上一级</WuButton>
    </WuPopover>
  </div>
</template>
