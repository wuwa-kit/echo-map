<script setup lang="ts">
import { computed, nextTick, shallowRef, useAttrs, useId, useTemplateRef } from 'vue'
import { produce } from 'immer'
import WuScrollArea from './WuScrollArea.vue'
import WuSvg from './WuSvg.vue'
import { useProvideWuSelectContext } from './select-context.ts'
import type { WuSelectOptionRecord, WuSelectValue } from './select-context.ts'

defineOptions({ inheritAttrs: false })

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
const attrs = useAttrs()
const componentId = useId()
const triggerId = typeof attrs.id === 'string' && attrs.id.length > 0
  ? attrs.id
  : `wu-select-trigger-${componentId}`
const popoverId = `wu-select-popover-${componentId}`
const trigger = useTemplateRef<HTMLButtonElement>('triggerRef')
const popover = useTemplateRef<HTMLDivElement>('popoverRef')
const options = shallowRef<readonly WuSelectOptionRecord[]>([])
const activeOptionId = shallowRef<string>()
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
  if (props.disabled || popover.value?.matches(':popover-open')) {
    return
  }
  popover.value?.showPopover()
}

function chooseOption(option: WuSelectOptionRecord): void {
  if (props.disabled || option.disabled) {
    return
  }
  model.value = option.value
  popover.value?.hidePopover()
  void nextTick(() => {
    trigger.value?.focus()
  })
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

function onPopoverToggle(): void {
  isOpen.value = popover.value?.matches(':popover-open') ?? false
  if (isOpen.value) {
    focusInitialOption()
  } else {
    activeOptionId.value = undefined
  }
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
    <button
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
      class="h-38px w-full min-w-0 cursor-pointer flex items-center rounded-7px border bg-[linear-gradient(180deg,rgba(25,47,41,0.96),rgba(15,31,27,0.96))] pl-11px pr-34px text-left text-11px text-[#dce9e3] font-inherit shadow-[inset_0_1px_rgba(255,255,255,0.025),0_5px_16px_rgba(0,0,0,0.1)] outline-none transition-[border-color,box-shadow,background-color] duration-180 disabled:cursor-not-allowed disabled:border-[rgba(169,207,192,0.1)] disabled:bg-[#101c19] disabled:text-[#60746d]"
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
    <div
      :id="popoverId"
      ref="popoverRef"
      popover="auto"
      role="listbox"
      :aria-labelledby="triggerId"
      class="m-0 max-h-[min(320px,calc(100vh-32px))] overflow-hidden border border-[rgba(169,207,192,0.18)] rounded-9px bg-[rgba(8,20,17,0.98)] p-4px text-[#dce9e3] shadow-[0_18px_48px_rgba(0,0,0,0.42),inset_0_1px_rgba(255,255,255,0.035)]"
      @keydown="onPopoverKeydown"
      @toggle="onPopoverToggle"
    >
      <WuScrollArea size="sm">
        <slot />
      </WuScrollArea>
    </div>
  </div>
</template>

<style scoped>
[popover] {
  position-area: block-end;
  position-try-fallbacks: flip-block;
  inline-size: anchor-size(width);
  margin-block: 6px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px) scale(0.985);
  transform-origin: top center;
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    overlay 140ms allow-discrete,
    display 140ms allow-discrete;
}

[popover]:popover-open {
  display: flex;
  flex-direction: column;
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

@starting-style {
  [popover]:popover-open {
    opacity: 0;
    transform: translateY(-4px) scale(0.985);
  }
}
</style>
