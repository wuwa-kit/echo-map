<script setup lang="ts">
import { computed, nextTick, shallowRef, useAttrs, useId, useTemplateRef, watch } from 'vue'
import { produce } from 'immer'
import WuScrollArea from './WuScrollArea.vue'
import WuSvg from './WuSvg.vue'
import WuPopover from './WuPopover.vue'
import { useProvideWuSelectContext } from './select-context.ts'
import type { WuSelectOptionRecord, WuSelectValue } from './select-context.ts'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  native?: boolean
}>(), {
  disabled: false,
  invalid: false,
  placeholder: '请选择',
  native: false,
})

const model = defineModel<WuSelectValue>({ required: true })
const attrs = useAttrs()
const componentId = useId()
const triggerId = typeof attrs.id === 'string' && attrs.id.length > 0
  ? attrs.id
  : `wu-select-trigger-${componentId}`
const popoverId = `wu-select-popover-${componentId}`
const trigger = useTemplateRef<HTMLButtonElement>('triggerRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const options = shallowRef<readonly WuSelectOptionRecord[]>([])
const activeOptionId = shallowRef<string>()
const isOpen = shallowRef(false)
const useNative = computed(() => props.native
  || !('showPopover' in HTMLElement.prototype))

watch(useNative, (native) => {
  if (native) popover.value?.hide()
})

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
  if (activeOptionId.value === id) {
    activeOptionId.value = undefined
  }
}

function setActiveOption(id: string): void {
  activeOptionId.value = id
}

function isSelectedValue(value: WuSelectValue): boolean {
  return Object.is(model.value, value)
}

function isActiveOption(id: string): boolean {
  return activeOptionId.value === id
}

function focusOption(id: string): void {
  activeOptionId.value = id
  void nextTick(() => {
    document.getElementById(id)?.focus()
  })
}

function enabledOptions(): readonly WuSelectOptionRecord[] {
  return options.value.filter(({ disabled }) => !disabled)
}

function focusInitialOption(): void {
  const availableOptions = enabledOptions()
  if (availableOptions.length === 0) {
    return
  }
  const selected = availableOptions.find(({ value }) => Object.is(value, model.value))
  const initialOption = selected ?? availableOptions[0]
  if (initialOption) {
    focusOption(initialOption.id)
  }
}

function showPopover(): void {
  if (props.disabled || useNative.value) {
    return
  }
  popover.value?.show()
}

function chooseOption(option: WuSelectOptionRecord): void {
  if (props.disabled || option.disabled) {
    return
  }
  model.value = option.value
  if (!useNative.value) {
    popover.value?.hide()
  }
  void nextTick(() => {
    trigger.value?.focus()
  })
}

function onNativeChange(event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) {
    return
  }
  const value = event.target.value
  const option = options.value.find(({ id }) => id === value)
  if (option) {
    chooseOption(option)
  }
}

function moveActiveOption(offset: -1 | 1): void {
  const availableOptions = enabledOptions()
  if (availableOptions.length === 0) {
    return
  }
  const currentIndex = availableOptions.findIndex(({ id }) => id === activeOptionId.value)
  const nextIndex = currentIndex < 0
    ? (offset > 0 ? 0 : availableOptions.length - 1)
    : (currentIndex + offset + availableOptions.length) % availableOptions.length
  const nextOption = availableOptions[nextIndex]
  if (nextOption) {
    focusOption(nextOption.id)
  }
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return
  }
  event.preventDefault()
  showPopover()
  if (event.key === 'Home') {
    const first = enabledOptions()[0]
    if (first) {
      focusOption(first.id)
    }
    return
  }
  if (event.key === 'End') {
    const last = enabledOptions().at(-1)
    if (last) {
      focusOption(last.id)
    }
    return
  }
  focusInitialOption()
}

function onPopoverKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveOption(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const availableOptions = enabledOptions()
    const option = event.key === 'Home' ? availableOptions[0] : availableOptions.at(-1)
    if (option) {
      focusOption(option.id)
    }
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const activeOption = options.value.find(({ id }) => id === activeOptionId.value)
    if (activeOption) {
      chooseOption(activeOption)
    }
  }
}

function onPopoverOpened(): void {
  isOpen.value = true
  const active = enabledOptions().find(({ id }) => id === activeOptionId.value)
  if (active) focusOption(active.id)
  else focusInitialOption()
}

function onPopoverClosed(): void {
  isOpen.value = false
  activeOptionId.value = undefined
}

useProvideWuSelectContext({
  chooseOption,
  isActiveOption,
  isSelectedValue,
  registerOption,
  setActiveOption,
  unregisterOption,
  updateOption,
})
</script>

<template>
  <div class="group relative grid w-full min-w-0">
    <select
      v-if="useNative"
      v-bind="attrs"
      :id="triggerId"
      :value="selectedOption?.id ?? ''"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      class="h-44px w-full min-w-0 appearance-none rounded-7px border border-[var(--line)] bg-[#152b24] pl-11px pr-34px text-16px text-[#dce9e3] font-inherit outline-none focus-visible:border-[var(--accent)] disabled:opacity-50"
      @change="onNativeChange"
    >
      <option v-if="!selectedOption" value="" disabled>{{ placeholder }}</option>
      <option v-for="option in options" :key="option.id" :value="option.id" :disabled="option.disabled">{{ option.label }}</option>
    </select>
    <button
      v-else
      v-bind="attrs"
      :id="triggerId"
      ref="triggerRef"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-controls="popoverId"
      :aria-expanded="isOpen"
      :class="invalid
        ? 'border-[#ff8d7e] focus-visible:border-[#ffad9f] focus-visible:shadow-[0_0_0_2px_rgba(255,141,126,0.13)]'
        : 'border-[var(--line)] hover:border-[rgba(101,241,194,0.36)] focus-visible:border-[rgba(101,241,194,0.68)] focus-visible:shadow-[0_0_0_2px_rgba(101,241,194,0.1)]'"
      class="h-38px w-full min-w-0 cursor-pointer flex items-center rounded-7px border bg-[#152b24] pl-11px pr-34px text-left text-11px text-[#dce9e3] font-inherit shadow-[inset_0_1px_rgba(255,255,255,0.025),0_5px_16px_rgba(0,0,0,0.1)] outline-none transition-[border-color,box-shadow,background-color] duration-180 disabled:cursor-not-allowed disabled:border-[rgba(169,207,192,0.1)] disabled:bg-[#101c19] disabled:text-[#60746d]"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :popovertarget="popoverId"
      @keydown="onTriggerKeydown"
    >
      <span class="block min-w-0 truncate">{{ selectedLabel }}</span>
    </button>
    <WuSvg
      name="chevron-down"
      class="pointer-events-none absolute right-10px top-1/2 [--wu-svg-h:15px] translate-y-[-50%] text-[#78998d] transition-[color,transform] duration-180 group-focus-within:text-[var(--accent)] group-hover:text-[#a9cfc0]"
      :class="isOpen ? 'rotate-180 text-[var(--accent)]' : ''"
    />
    <WuPopover
      v-show="!useNative"
      :id="popoverId"
      ref="popoverRef"
      :anchor="trigger"
      :disabled="disabled || useNative"
      width="trigger"
      :max-height="320"
      :gap="6"
      role="listbox"
      :aria-labelledby="triggerId"
      class="border border-[rgba(169,207,192,0.18)] rounded-9px bg-[rgba(8,20,17,0.98)] p-4px text-[#dce9e3] shadow-[0_18px_48px_rgba(0,0,0,0.42),inset_0_1px_rgba(255,255,255,0.035)]"
      @keydown="onPopoverKeydown"
      @opened="onPopoverOpened"
      @closed="onPopoverClosed"
    >
      <WuScrollArea size="sm">
        <slot />
      </WuScrollArea>
    </WuPopover>
  </div>
</template>
