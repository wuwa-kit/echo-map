<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuCoordinateInput from './base/WuCoordinateInput.vue'

const props = defineProps<{ teleport?: boolean }>()
const store = usePointEditorStore()
const { draft, busy, inputErrors, positionInput, arrivalInput } = storeToRefs(store)
const coordinate = computed(() => (props.teleport && draft.value?.kind === 'navigation' ? draft.value.teleportCoordinate : draft.value?.coordinate) ?? { x: null, y: null, z: null })
const invalid = computed(() => ['x', 'y', 'z'].some((axis) => Boolean(inputErrors.value[props.teleport ? `teleport:${axis}` : axis])))
</script>

<template>
  <WuCoordinateInput :model-value="coordinate" :state="teleport ? arrivalInput : positionInput" :disabled="busy" :invalid="invalid" @changed="store.updateCoordinateInput(Boolean(teleport), $event)" />
</template>
