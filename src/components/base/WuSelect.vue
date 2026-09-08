<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { produce } from 'immer'
import WuScrollArea from './WuScrollArea.vue'
import WuSvg from './WuSvg.vue'
import WuPopover from './WuPopover.vue'
import { useProvideWuSelectContext } from './select-context.ts'
import type { WuSelectOptionRecord, WuSelectValue } from './select-context.ts'

const props = withDefaults(defineProps<{
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  invalid: false,
  placeholder: '请选择',
})

const model = defineModel<WuSelectValue>({ required: true })
const trigger = useTemplateRef<HTMLDivElement>('triggerRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const options = shallowRef<readonly WuSelectOptionRecord[]>([])
const isOpen = shallowRef(false)

const selectedOption = computed(() => options.value.find(({ value }) => Object.is(value, model.value)))
const selectedLabel = computed(() => selectedOption.value?.label || props.placeholder)

function registerOption(option: WuSelectOptionRecord): void {
  if (options.value.some(({ id }) => id === option.id)) {
    updateOption(option)
    return
  }
  options.value = produce(options.value, (draft) => {
    draft.push(option)
  })
}

function updateOption(option: WuSelectOptionRecord): void {
  const index = options.value.findIndex(({ id }) => id === option.id)
  if (index < 0) {
    registerOption(option)
    return
  }
  const previous = options.value[index]
  if (!previous) {
    return
  }
  if (
    previous.label === option.label
    && previous.disabled === option.disabled
    && Object.is(previous.value, option.value)
  ) {
    return
  }
  options.value = produce(options.value, (draft) => {
    draft[index] = option
  })
}

function unregisterOption(id: string): void {
  const index = options.value.findIndex((option) => option.id === id)
  if (index < 0) {
    return
  }
  options.value = produce(options.value, (draft) => {
    draft.splice(index, 1)
  })
}

function isSelectedValue(value: WuSelectValue): boolean {
  return Object.is(model.value, value)
}

function togglePopover(): void {
  if (props.disabled) {
    return
  }
  popover.value?.toggle()
}

function chooseOption(option: WuSelectOptionRecord): void {
  if (props.disabled || option.disabled) {
    return
  }
  model.value = option.value
  popover.value?.hide()
}

function onPopoverOpened(): void {
  isOpen.value = true
}

function onPopoverClosed(): void {
  isOpen.value = false
}

useProvideWuSelectContext({
  chooseOption,
  isSelectedValue,
  registerOption,
  unregisterOption,
  updateOption,
})
</script>

<template>
  <div class="group relative grid w-full min-w-0">
    <div
      ref="triggerRef"
      :class="[
        invalid
          ? 'border-[#ff8d7e]'
          : disabled
            ? 'border-[rgba(169,207,192,0.1)]'
            : 'border-[var(--line)] hover:border-[rgba(101,241,194,0.36)]',
        disabled
          ? 'cursor-not-allowed bg-[#101c19] text-[#60746d]'
          : 'cursor-pointer bg-[#152b24] text-[#dce9e3]',
      ]"
      class="h-38px w-full min-w-0 flex items-center rounded-7px border pl-11px pr-34px text-left text-11px font-inherit shadow-[inset_0_1px_rgba(255,255,255,0.025),0_5px_16px_rgba(0,0,0,0.1)] transition-[border-color,box-shadow,background-color] duration-180"
      @click="togglePopover"
    >
      <span class="block min-w-0 truncate">{{ selectedLabel }}</span>
    </div>
    <WuSvg
      name="chevron-down"
      class="pointer-events-none absolute right-10px top-1/2 [--wu-svg-h:15px] translate-y-[-50%] text-[#78998d] transition-[color,transform] duration-180 group-hover:text-[#a9cfc0]"
      :class="isOpen ? 'rotate-180 text-[var(--accent)]' : ''"
    />
    <WuPopover
      ref="popoverRef"
      :anchor="trigger"
      :disabled="disabled"
      width="trigger"
      :max-height="320"
      :gap="6"
      class="border border-[rgba(169,207,192,0.18)] rounded-9px bg-[rgba(8,20,17,0.98)] p-4px text-[#dce9e3] shadow-[0_18px_48px_rgba(0,0,0,0.42),inset_0_1px_rgba(255,255,255,0.035)]"
      @opened="onPopoverOpened"
      @closed="onPopoverClosed"
    >
      <WuScrollArea size="sm">
        <slot />
      </WuScrollArea>
    </WuPopover>
  </div>
</template>
