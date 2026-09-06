<script setup lang="ts">
import { computed, nextTick, shallowRef, useAttrs, useId, useTemplateRef } from 'vue'
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
  leafActionLabel?: string
  emptyText?: string
  disabled?: boolean
  showHeader?: boolean
  showPath?: boolean
}>(), {
  placeholder: '请选择',
  rootLabel: '全部',
  leafActionLabel: '选择',
  emptyText: '暂无选项',
  disabled: false,
  showHeader: true,
  showPath: true,
})
const emit = defineEmits<{ select: [value: string, path: readonly string[]] }>()
const attrs = useAttrs()
const componentId = useId()
const triggerId = computed(() => typeof attrs.id === 'string' ? attrs.id : `wu-cascader-trigger-${componentId}`)
const panelId = `wu-cascader-panel-${componentId}`
const titleId = `wu-cascader-title-${componentId}`
const trigger = useTemplateRef<HTMLButtonElement>('triggerRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const isOpen = shallowRef(false)
const expandedValues = shallowRef<readonly string[]>([])
let openAtEnd = false
const narrow = useMediaQuery('(max-width: 639px)')
const path = computed(() => resolveCascaderPath(props.options, expandedValues.value))
const columns = computed(() => cascaderColumns(props.options, expandedValues.value))
const visibleColumns = computed(() => narrow.value ? columns.value.slice(-1) : columns.value)
const panelWidth = computed(() => narrow.value ? 'viewport' : Math.max(220, columns.value.length * 210))

function optionButtonId(depth: number, index: number): string {
  return `wu-cascader-option-${componentId}-${depth}-${index}`
}

async function focusOption(depth: number, value?: string, last = false): Promise<void> {
  await nextTick()
  if (!isOpen.value) return
  const column = columns.value[depth]
  const enabled = column?.options.flatMap((option, index) => option.disabled ? [] : [{ option, index }]) ?? []
  const target = enabled.find(({ option }) => option.value === value) ?? (last ? enabled.at(-1) : enabled[0])
  if (target) {
    const element = document.getElementById(optionButtonId(depth, target.index))
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  } else {
    const element = document.getElementById(panelId)
    const fallback = element?.querySelector<HTMLButtonElement>('[data-cascader-close]') ?? element
    fallback?.focus({ preventScroll: true })
  }
}

function onOpened(): void {
  expandedValues.value = []
  isOpen.value = true
  void focusOption(0, undefined, openAtEnd)
  openAtEnd = false
}

function onClosed(): void {
  isOpen.value = false
  expandedValues.value = []
  openAtEnd = false
}

function close(): void {
  popover.value?.hide()
  void nextTick(() => trigger.value?.focus({ preventScroll: true }))
}

function choose(depth: number, value: string, expandOnly = false): void {
  if (props.disabled) return
  const choice = resolveCascaderChoice(props.options, expandedValues.value, depth, value)
  if (!choice) return
  if (choice.kind === 'expand') {
    expandedValues.value = choice.path
    void focusOption(depth + 1)
  } else if (!expandOnly) {
    emit('select', choice.option.value, choice.path)
    close()
  }
}

function browseTo(depth: number): void {
  const previous = path.value[depth]?.value
  expandedValues.value = path.value.slice(0, depth).map(({ value }) => value)
  void focusOption(depth, previous)
}

function onOptionKeydown(event: KeyboardEvent, depth: number, index: number): void {
  const column = columns.value[depth]
  const option = column?.options[index]
  if (!column || !option) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    choose(depth, option.value, true)
  } else if (event.key === 'ArrowLeft' && depth > 0) {
    event.preventDefault()
    browseTo(depth - 1)
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const enabled = column.options.filter((item) => !item.disabled)
    const activeIndex = enabled.findIndex((item) => item.value === option.value)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
    void focusOption(depth, enabled[nextIndex]?.value)
  }
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (props.disabled || isOpen.value) return
    openAtEnd = event.key === 'ArrowUp'
    popover.value?.show()
  }
}
</script>

<template>
  <div class="relative min-w-0">
    <button
      v-bind="attrs" :id="triggerId" ref="triggerRef" type="button" :disabled="disabled"
      aria-haspopup="dialog" :aria-controls="panelId" :aria-expanded="isOpen"
      class="h-[var(--wu-cascader-height,44px)] w-full min-w-0 flex cursor-pointer items-center justify-center gap-[var(--wu-cascader-gap,10px)] border border-[var(--line)] rounded-8px bg-[#152b24] px-[var(--wu-cascader-padding,14px)] text-14px text-[#eaf4ef] shadow-lg hover:border-[var(--accent)] focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      :popovertarget="panelId" @keydown="onTriggerKeydown"
    >
      <span class="min-w-0 truncate">{{ placeholder }}</span>
      <WuSvg name="chevron-right" class="shrink-0 text-[var(--accent)] [--wu-svg-h:14px]" :class="isOpen ? 'rotate-90' : ''" />
    </button>
    <WuPopover
      :id="panelId" ref="popoverRef" :anchor="trigger" :disabled="disabled" :width="panelWidth"
      role="dialog" tabindex="-1" :aria-labelledby="showHeader ? titleId : undefined" :aria-label="showHeader ? undefined : title ?? placeholder"
      class="border border-[var(--line)] rounded-12px bg-[#101f1a] text-[#dce9e3] shadow-2xl"
      @opened="onOpened" @closed="onClosed"
    >
      <div v-if="showHeader" class="flex shrink-0 items-center justify-between gap-10px border-b border-[var(--line)] px-12px py-5px">
        <span :id="titleId" class="min-w-0 text-14px font-600">{{ title ?? placeholder }}</span>
        <button data-cascader-close type="button" aria-label="关闭" class="min-h-44px cursor-pointer border-0 rounded-5px bg-transparent px-8px text-12px text-[#91ab9d] hover:text-[var(--accent)] focus-visible:outline-[var(--accent)]" @click="close()">关闭</button>
      </div>
      <div v-if="narrow && showPath" class="flex shrink-0 flex-wrap items-center gap-x-5px border-b border-[var(--line)] px-12px py-4px text-13px" aria-label="选择路径">
        <button type="button" :aria-current="path.length === 0 ? 'step' : undefined" class="min-h-44px cursor-pointer border-0 bg-transparent px-0 text-[var(--accent)] focus-visible:outline-[var(--accent)]" @click="browseTo(0)">{{ rootLabel }}</button>
        <template v-for="(ancestor, index) in path" :key="ancestor.value">
          <WuSvg name="chevron-right" class="text-[#627e70] [--wu-svg-h:12px]" />
          <button type="button" :aria-current="index === path.length - 1 ? 'step' : undefined" class="min-h-44px cursor-pointer border-0 bg-transparent px-0 text-[var(--accent)] focus-visible:outline-[var(--accent)]" @click="browseTo(index + 1)">{{ ancestor.label }}</button>
        </template>
      </div>
      <div class="min-h-0 flex overflow-x-auto overscroll-contain">
        <div v-for="column in visibleColumns" :key="column.depth" class="min-h-0 min-w-0 flex flex-col" :class="narrow ? 'w-full' : 'w-210px shrink-0 border-r border-[var(--line)] last:border-r-0'">
          <span v-if="!narrow && showPath" class="shrink-0 px-12px pb-5px pt-10px text-12px text-[#91ab9d]">{{ column.parent?.label ?? rootLabel }}</span>
          <WuScrollArea size="sm" class="min-h-0 flex-1" content-class="p-5px">
            <div class="flex flex-col gap-3px" role="group" :aria-label="column.parent?.label ?? rootLabel">
              <button
                v-for="(option, index) in column.options" :id="optionButtonId(column.depth, index)" :key="option.value"
                type="button" :disabled="option.disabled" :aria-label="`${option.children?.length ? '打开' : leafActionLabel}${option.label}`"
                :aria-expanded="option.children?.length ? path[column.depth]?.value === option.value : undefined"
                :class="path[column.depth]?.value === option.value ? 'bg-[#244b39] text-[#eafff2]' : 'bg-transparent text-[#dce9e3] hover:bg-[#1c372b]'"
                class="min-h-48px w-full min-w-0 flex cursor-pointer items-center justify-between gap-8px border-0 rounded-7px px-10px py-8px text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                @click="choose(column.depth, option.value)" @keydown="onOptionKeydown($event, column.depth, index)"
              >
                <span class="min-w-0">
                  <span class="block break-words text-14px">{{ option.label }}</span>
                  <span v-if="option.description" class="mt-3px block break-words text-12px text-[#91ab9d]">{{ option.description }}</span>
                </span>
                <WuSvg v-if="option.children?.length" name="chevron-right" class="shrink-0 text-[#76a58c] [--wu-svg-h:14px]" />
              </button>
              <div v-if="column.options.length === 0" class="px-10px py-20px text-13px text-[#91ab9d]" role="status">{{ emptyText }}</div>
            </div>
          </WuScrollArea>
        </div>
      </div>
      <button v-if="narrow && path.length" type="button" class="min-h-44px shrink-0 flex cursor-pointer items-center gap-6px border-0 border-t border-solid border-[var(--line)] bg-transparent px-12px text-13px text-[var(--accent)] focus-visible:outline-[var(--accent)]" @click="browseTo(path.length - 1)">
        <WuSvg name="chevron-right" class="rotate-180 [--wu-svg-h:12px]" />返回上一级
      </button>
    </WuPopover>
  </div>
</template>
