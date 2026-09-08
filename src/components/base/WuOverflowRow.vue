<script setup lang="ts" generic="T">
import { useResizeObserver } from '@vueuse/core'
import {
  computed,
  nextTick,
  onMounted,
  onScopeDispose,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    align?: 'start' | 'end'
    gap?: number
    itemGap?: number
    items: readonly T[]
  }>(),
  {
    align: 'start',
    gap: 0,
    itemGap: 0,
  },
)

const container = useTemplateRef<HTMLDivElement>('containerRef')
const itemList = useTemplateRef<HTMLDivElement>('itemListRef')
const suffixList = useTemplateRef<HTMLDivElement>('suffixListRef')
const visibleCount = shallowRef(props.items.length)

const resolvedVisibleCount = computed(() => Math.min(props.items.length, visibleCount.value))
const visibleItems = computed(() => props.items.slice(0, resolvedVisibleCount.value))
const hiddenCount = computed(() => props.items.length - resolvedVisibleCount.value)

let animationFrame: number | undefined
let measurementVersion = 0
let measuring = false
let measuredGeometry = ''

function getGeometry(): string {
  if (!container.value || !itemList.value || !suffixList.value) return ''

  return [
    container.value.clientWidth,
    itemList.value.clientHeight,
    itemList.value.scrollHeight,
    suffixList.value.getBoundingClientRect().width,
  ].join(':')
}

function isItemListWrapped(): boolean {
  const children = Array.from(itemList.value?.children ?? [])
  const firstItem = children[0]
  if (!(firstItem instanceof HTMLElement)) return false

  return children.some(
    child => child instanceof HTMLElement && child.offsetTop !== firstItem.offsetTop,
  )
}

function isOverflowing(): boolean {
  if (!container.value || !suffixList.value) return false

  const tolerance = 0.5
  const containerRect = container.value.getBoundingClientRect()
  const suffixRect = suffixList.value.getBoundingClientRect()
  const hasVisibleSuffix = suffixRect.width > tolerance || suffixRect.height > tolerance

  return (
    container.value.scrollWidth > container.value.clientWidth + tolerance
    || (hasVisibleSuffix && suffixRect.left < containerRect.left - tolerance)
    || (hasVisibleSuffix && suffixRect.right > containerRect.right + tolerance)
    || isItemListWrapped()
  )
}

async function fitItems(version: number): Promise<void> {
  measuring = true
  visibleCount.value = props.items.length
  await nextTick()

  while (
    version === measurementVersion
    && visibleCount.value > 0
    && isOverflowing()
  ) {
    visibleCount.value -= 1
    await nextTick()
  }

  if (version === measurementVersion) measuredGeometry = getGeometry()
  measuring = false
}

function scheduleMeasurement(): void {
  measurementVersion += 1
  const version = measurementVersion

  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
  animationFrame = requestAnimationFrame(() => {
    animationFrame = undefined
    void fitItems(version)
  })
}

useResizeObserver([container, itemList, suffixList], () => {
  if (!measuring && getGeometry() !== measuredGeometry) scheduleMeasurement()
})

watch(
  [() => props.items, () => props.items.length],
  scheduleMeasurement,
  { flush: 'post' },
)

onMounted(scheduleMeasurement)

onScopeDispose(() => {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <div
    v-bind="$attrs"
    ref="containerRef"
    class="min-w-0 flex flex-nowrap items-center overflow-hidden"
    :style="{ columnGap: `${gap}px` }"
  >
    <div
      ref="itemListRef"
      class="min-w-0 flex flex-1 flex-wrap items-center overflow-hidden"
      :class="align === 'end' ? 'justify-end' : 'justify-start'"
      :style="{ gap: `${itemGap}px` }"
    >
      <div
        v-for="(item, index) in visibleItems"
        :key="index"
        class="shrink-0"
      >
        <slot
          name="item"
          :index="index"
          :item="item"
        />
      </div>
    </div>

    <div
      ref="suffixListRef"
      class="min-w-0 shrink-0 flex flex-nowrap items-center empty:hidden"
    >
      <slot
        name="suffix"
        :hidden-count="hiddenCount"
        :total-count="items.length"
        :visible-count="resolvedVisibleCount"
      />
    </div>
  </div>
</template>
