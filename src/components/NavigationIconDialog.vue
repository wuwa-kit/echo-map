<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import WuDialog from './base/WuDialog.vue'
import WuButton from './base/WuButton.vue'
import WuInput from './base/WuInput.vue'
import WuSelect from './base/WuSelect.vue'
import WuOption from './base/WuOption.vue'
import { useNavigationIconLibraryStore } from '../stores/navigation-icon-library.ts'
import NavigationArtwork from './NavigationArtwork.vue'
import NavigationIconStrip from './NavigationIconStrip.vue'
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'
import { iconDisplayName, iconPosition } from '../domain/navigation-icon-library.ts'
import { iconSources } from '../domain/navigation-icon-pool.ts'
import { builtInIconType } from '../domain/navigation-point-types.ts'

const library = useNavigationIconLibraryStore()
const store = useNavigationIconManagerStore()
const { selected, filtered, saving } = storeToRefs(store)
const editable = computed(() => store.editable && selected.value?.source !== 'placeholder')
const position = computed(() => selected.value?.source === 'unpacked' ? iconPosition(selected.value.id) : null)
const builtInType = computed(() => builtInIconType(selected.value?.id))
function edit(action: () => void): void { store.edit(action) }
</script>

<template>
<WuDialog :open="!!selected" :title="editable ? '编辑图标' : '图标详情'" size="md" :padded="false" @dismiss-requested="store.closeDetails">
  <div class="px-[24px] pb-[20px]">
    <template v-if="selected">
      <div class="mt-[20px] flex items-start gap-[20px]">
        <div class="flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-[8px] bg-[#101713] sm:h-[152px] sm:w-[152px]"><NavigationArtwork :url="selected.url" class="h-[88px] w-[88px] sm:h-[104px] sm:w-[104px]" /></div>
        <div class="min-w-0 flex-1 space-y-[12px] py-[4px] text-[12px] text-[#8d9c94]">
          <div><div class="mb-[4px]">来源</div><div class="text-[#e4ebe7]">{{ iconSources.find(source => source.id === selected?.source)?.name }}</div></div>
          <div><div class="mb-[4px]">固定 ID</div><div class="break-all font-mono text-[#e4ebe7]">{{ selected.id }}</div></div>
          <div v-if="position">图集 {{ position.atlas }} · 第 {{ position.column }} 列 · 第 {{ position.row }} 行</div>
          <div v-if="builtInType">用于内置类型：{{ builtInType.name }}</div>
        </div>
      </div>
      <div class="mb-[8px] mt-[24px] text-[12px] text-[#8d9c94]">名称</div>
      <WuInput v-if="editable" :disabled="saving" :model-value="selected.name" :maxlength="200" :placeholder="selected.id" @update:model-value="edit(() => store.rename($event))" />
      <div v-else class="break-words text-[14px]">{{ iconDisplayName(selected) }}</div>
      <div class="mb-[8px] mt-[20px] text-[12px] text-[#8d9c94]">分类</div>
      <WuSelect v-if="editable && !(builtInType && builtInType.icons.length > 1)" placeholder="未设置" :disabled="saving" :muted="store.selectedIconCategoryId === null" :model-value="store.selectedIconCategoryId" @update:model-value="store.setSelectedIconCategory">
        <WuOption :value="null"><span class="font-normal text-[#8d9c94]">未设置</span></WuOption>
        <div class="relative h-[9px]"><div class="pointer-events-none absolute inset-x-[9px] top-1/2 h-px bg-white/10" /></div>
        <WuOption v-if="library.categories.some(item => item.id === 'unclassified')" value="unclassified">未分类</WuOption>
        <WuOption v-for="item in library.categories.filter(item => item.id !== 'unclassified')" :key="item.id" :value="item.id">{{ item.name }}</WuOption>
      </WuSelect>
      <div v-else class="text-[14px]">{{ builtInType && builtInType.icons.length > 1 ? `内置类型 · ${builtInType.name}` : library.categories.find(item => item.id === store.selectedIconCategoryId)?.name ?? '未设置' }}</div>
    </template>
  </div>
  <template #strip><NavigationIconStrip :icons="filtered" :selected-id="selected?.id" @selected="store.select" /></template>
  <template v-if="editable" #footer>
    <WuButton variant="solid" tone="accent" :disabled="saving || !store.selectedIconDirty" :loading="saving" @click="store.saveSelectedIcon">保存</WuButton>
  </template>
</WuDialog>
</template>
