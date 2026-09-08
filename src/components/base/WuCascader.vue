<script setup lang="ts">
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
  placeholder?: string
  title?: string
  rootLabel?: string
  emptyText?: string
  disabled?: boolean
  showHeader?: boolean
  showPath?: boolean
}>(), {
  placeholder: '请选择',
  rootLabel: '全部',
  emptyText: '暂无选项',
  disabled: false,
  showHeader: true,
  showPath: true,
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
const panelWidth = computed(() => narrow.value ? 'viewport' : Math.max(220, columns.value.length * 210))

function onOpened(): void {
  expandedValues.value = []
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
      class="h-[var(--wu-cascader-height,44px)] w-full min-w-0 flex cursor-pointer items-center justify-center gap-[var(--wu-cascader-gap,10px)] border border-[var(--line)] rounded-8px bg-[#152b24] px-[var(--wu-cascader-padding,14px)] text-14px text-[#eaf4ef] shadow-lg hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      :popovertarget="panelId"
    >
      <span class="min-w-0 truncate">{{ placeholder }}</span>
      <WuSvg name="chevron-right" class="shrink-0 text-[var(--accent)] [--wu-svg-h:14px]" :class="isOpen ? 'rotate-90' : ''" />
    </button>
    <WuPopover
      :id="panelId" ref="popoverRef" :anchor="trigger" :disabled="disabled" :width="panelWidth"
      class="border border-[var(--line)] rounded-12px bg-[#101f1a] text-[#dce9e3] shadow-2xl"
      @opened="onOpened" @closed="onClosed"
    >
      <div v-if="showHeader" class="flex shrink-0 items-center justify-between gap-10px border-b border-[var(--line)] px-12px py-5px">
        <span class="min-w-0 text-14px font-600">{{ title ?? placeholder }}</span>
        <button type="button" class="min-h-44px cursor-pointer border-0 rounded-5px bg-transparent px-8px text-12px text-[#91ab9d] hover:text-[var(--accent)]" @click="close()">关闭</button>
      </div>
      <div v-if="narrow && showPath" class="flex shrink-0 flex-wrap items-center gap-x-5px border-b border-[var(--line)] px-12px py-4px text-13px">
        <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent px-0 text-[var(--accent)]" @click="browseTo(0)">{{ rootLabel }}</button>
        <template v-for="(ancestor, index) in path" :key="ancestor.value">
          <WuSvg name="chevron-right" class="text-[#627e70] [--wu-svg-h:12px]" />
          <button type="button" class="min-h-44px cursor-pointer border-0 bg-transparent px-0 text-[var(--accent)]" @click="browseTo(index + 1)">{{ ancestor.label }}</button>
        </template>
      </div>
      <div class="min-h-0 flex overflow-x-auto overscroll-contain">
        <div v-for="column in visibleColumns" :key="column.depth" class="min-h-0 min-w-0 flex flex-col" :class="narrow ? 'w-full' : 'w-210px shrink-0 border-r border-[var(--line)] last:border-r-0'">
          <span v-if="!narrow && showPath" class="shrink-0 px-12px pb-5px pt-10px text-12px text-[#91ab9d]">{{ column.parent?.label ?? rootLabel }}</span>
          <WuScrollArea size="sm" class="min-h-0 flex-1" content-class="p-5px">
            <div class="flex flex-col gap-3px">
              <button
                v-for="option in column.options" :key="option.value"
                type="button" :disabled="option.disabled"
                :class="path[column.depth]?.value === option.value ? 'bg-[#244b39] text-[#eafff2]' : 'bg-transparent text-[#dce9e3] hover:bg-[#1c372b]'"
                class="min-h-48px w-full min-w-0 flex cursor-pointer items-center justify-between gap-8px border-0 rounded-7px px-10px py-8px text-left disabled:cursor-not-allowed disabled:opacity-40"
                @click="choose(column.depth, option.value)"
              >
                <span class="min-w-0">
                  <span class="block break-words text-14px">{{ option.label }}</span>
                  <span v-if="option.description" class="mt-3px block break-words text-12px text-[#91ab9d]">{{ option.description }}</span>
                </span>
                <WuSvg v-if="option.children?.length" name="chevron-right" class="shrink-0 text-[#76a58c] [--wu-svg-h:14px]" />
              </button>
              <div v-if="column.options.length === 0" class="px-10px py-20px text-13px text-[#91ab9d]">{{ emptyText }}</div>
            </div>
          </WuScrollArea>
        </div>
      </div>
      <button v-if="narrow && path.length" type="button" class="min-h-44px shrink-0 flex cursor-pointer items-center gap-6px border-0 border-t border-solid border-[var(--line)] bg-transparent px-12px text-13px text-[var(--accent)]" @click="browseTo(path.length - 1)">
        <WuSvg name="chevron-right" class="rotate-180 [--wu-svg-h:12px]" />返回上一级
      </button>
    </WuPopover>
  </div>
</template>
