<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useNavigationIconLibraryStore } from '../stores/navigation-icon-library.ts'
import NavigationArtwork from './NavigationArtwork.vue'
import NavigationIconGrid from './NavigationIconGrid.vue'
import WuPopover from './base/WuPopover.vue'
import WuSvg from './base/WuSvg.vue'

const props = defineProps<{
  modelValue: string | null
  options: readonly { id: string; name: string }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const library = useNavigationIconLibraryStore()
const trigger = useTemplateRef<HTMLButtonElement>('triggerRef')
const popover = useTemplateRef<InstanceType<typeof WuPopover>>('popoverRef')
const icons = computed(() => {
  const byId = new Map(library.pool.map(icon => [icon.id, icon]))
  return [{ id: 'icon-not-found', name: '图标未找到' }, ...props.options.filter(option => option.id !== 'icon-not-found')].map(option => ({ ...option, url: byId.get(option.id)?.url ?? '' }))
})
const selected = computed(() => icons.value.find(icon => icon.id === props.modelValue))
function choose(id: string): void {
  emit('update:modelValue', id)
  popover.value?.hide()
}
</script>

<template>
  <div class="min-w-0">
    <button ref="triggerRef" type="button" :popovertarget="popover?.id" class="flex h-[42px] w-full min-w-0 cursor-pointer items-center gap-[10px] rounded-[7px] bg-[#152b24] px-[11px] text-left text-[12px] outline -outline-offset-1 outline-[var(--line)] hover:outline-[rgba(101,241,194,0.36)]">
      <NavigationArtwork v-if="selected" :url="selected.url" class="h-[28px] w-[28px] shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ selected?.name ?? '选择替代图标' }}</span>
      <WuSvg name="chevron-down" class="shrink-0 text-[#78998d] [--wu-svg-h:15px]" :class="popover?.isOpen ? 'rotate-180' : ''" />
    </button>
    <WuPopover ref="popoverRef" :anchor="trigger" width="trigger" :max-height="360" :gap="6" class="rounded-[9px] bg-[#081411] p-[8px] text-[#dce9e3] outline -outline-offset-1 outline-[rgba(169,207,192,0.18)] shadow-xl">
      <NavigationIconGrid :icons="icons" :selected-id="modelValue" :active="popover?.isOpen ?? false" @selected="choose" />
    </WuPopover>
  </div>
</template>
