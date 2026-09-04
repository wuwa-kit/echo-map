<script setup lang="ts">
import { computed, useTemplateRef, watchEffect } from 'vue'
import { computedAsync } from '@vueuse/core'

const props = defineProps<{
  name: string
  label?: string
}>()

const svgElements = computedAsync(
  async () => (await import('../../utils/svg.ts')).default,
  {},
)
const sourceElement = computed(() => svgElements.value[props.name])
const svgAttributes = computed(() => {
  const element = sourceElement.value
  if (!element) {
    return {}
  }
  return Object.fromEntries(
    Array.from(element.attributes)
      .filter(({ name }) => !['xmlns', 'width', 'height'].includes(name))
      .map(({ name, value }) => [name, value]),
  )
})
const actualElement = useTemplateRef<SVGSVGElement>('actualElementRef')

watchEffect(() => {
  const source = sourceElement.value
  const actual = actualElement.value
  if (!source || !actual) {
    return
  }
  actual.replaceChildren(...source.cloneNode(true).childNodes)
})
</script>

<template>
  <svg
    v-if="sourceElement"
    v-bind="svgAttributes"
    ref="actualElementRef"
    class="block h-[var(--wu-svg-h,1em)] w-[var(--wu-svg-w,var(--wu-svg-h,1em))] overflow-hidden fill-current"
    :data-icon="name"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : true"
  />
</template>
