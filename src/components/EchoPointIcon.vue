<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { createEchoMarkerStyles } from '../map/echo-marker.ts'
import type { CompositionMember } from '../map/echo-composition.ts'
import type { EchoDefinition } from '../domain/types.ts'

const props = defineProps<{
  members: readonly CompositionMember[]
  echoes: readonly EchoDefinition[]
}>()
const icon = useTemplateRef<HTMLCanvasElement>('iconRef')
const renderer = createEchoMarkerStyles(draw)
function draw(): void {
  const target = icon.value
  if (!target) return
  const source = renderer.get(props.members, props.echoes, { showText: true }).canvas
  target.width = source.width
  target.height = source.height
  target.getContext('2d')?.drawImage(source, 0, 0)
}
onMounted(draw)
watch([() => props.members, () => props.echoes], draw)
onBeforeUnmount(renderer.dispose)
</script>

<template>
  <canvas ref="iconRef" class="h-54px w-54px shrink-0" aria-hidden="true" />
</template>
