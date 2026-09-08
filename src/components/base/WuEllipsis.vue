<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import { useMutationObserver, useResizeObserver } from '@vueuse/core'
import { elementHasOverflow } from './ellipsis.ts'
import type { WuTooltipPlacement } from './tooltip-position.ts'
import WuTooltip from './WuTooltip.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  text?: string
  tooltip?: boolean
  tooltipText?: string
  placement?: WuTooltipPlacement
  delay?: number
}>(), {
  text: '',
  tooltip: true,
  tooltipText: '',
  placement: 'top',
  delay: 300,
})
const content = useTemplateRef<HTMLSpanElement>('contentRef')
const overflowing = shallowRef(false)
const renderedText = shallowRef('')
const resolvedTooltipText = computed(() => props.tooltipText.trim() || props.text.trim() || renderedText.value)
let resizeFrame: number | null = null

function measure(): void {
  resizeFrame = null
  const element = content.value
  if (!element) return
  const text = element.textContent?.trim() ?? ''
  if (text !== renderedText.value) renderedText.value = text
  overflowing.value = elementHasOverflow(element)
}

function scheduleMeasurement(): void {
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(measure)
}

useResizeObserver(content, scheduleMeasurement)
useMutationObserver(content, scheduleMeasurement, { childList: true, subtree: true, characterData: true })
watch(() => [props.text, props.tooltipText], scheduleMeasurement, { flush: 'post' })
onMounted(scheduleMeasurement)
onScopeDispose(() => {
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
})

defineExpose({ isOverflowing: overflowing })
</script>

<template>
  <WuTooltip
    v-if="tooltip" v-bind="$attrs" :content="resolvedTooltipText" :disabled="!overflowing"
    :placement="placement" :delay="delay" class="block min-w-0 max-w-full"
  >
    <span ref="contentRef" class="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"><slot>{{ text }}</slot></span>
  </WuTooltip>
  <span v-else v-bind="$attrs" ref="contentRef" class="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap"><slot>{{ text }}</slot></span>
</template>
