<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePointEditorStore } from '../stores/point-editor.ts'
import WuCoordinateInput from './base/WuCoordinateInput.vue'

const props = defineProps<{ teleport?: boolean }>()
const emit = defineEmits<{ locateRequested: [coordinate: [number, number]] }>()
const store = usePointEditorStore()
const coordinateInput = useTemplateRef<InstanceType<typeof WuCoordinateInput>>('coordinateInputRef')
defineExpose({ focus: () => coordinateInput.value?.focus() })
const { draft, busy, inputErrors, positionInput, arrivalInput } = storeToRefs(store)
const coordinate = computed(() => (props.teleport && draft.value?.kind === 'navigation' ? draft.value.teleportCoordinate : draft.value?.coordinate) ?? { x: null, y: null, z: null })
const invalid = computed(() => ['x', 'y', 'z'].some((axis) => Boolean(inputErrors.value[props.teleport ? `teleport:${axis}` : axis])))
</script>

<template>
  <WuCoordinateInput ref="coordinateInputRef" :model-value="coordinate" :state="teleport ? arrivalInput : positionInput" :allow-empty="Boolean(teleport)" :disabled="busy" :invalid="invalid" @changed="store.updateCoordinateInput(Boolean(teleport), $event)" @confirmed="emit('locateRequested', $event)" @confirmation-interrupted="store.resetPositionConfirmation" />
</template>
