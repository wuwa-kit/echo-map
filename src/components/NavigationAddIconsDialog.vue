<script setup lang="ts">
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'
import { iconSources } from '../domain/navigation-icon-pool.ts'
import { iconDisplayName } from '../domain/navigation-icon-library.ts'
import NavigationArtwork from './NavigationArtwork.vue'
import WuDialog from './base/WuDialog.vue'
import WuButton from './base/WuButton.vue'
import WuInput from './base/WuInput.vue'
import WuEllipsis from './base/WuEllipsis.vue'
import WuScrollArea from './base/WuScrollArea.vue'

const store = useNavigationIconManagerStore()
const sources = [{ id: 'all', name: '全部' } as const, ...iconSources.filter(source => source.id !== 'placeholder')]
</script>

<template>
  <WuDialog :open="!!store.addingCategory" title="添加图标" size="lg" layout="panel" mobile-fullscreen :padded="false" :dismissible="!store.saving" @dismiss-requested="store.closeAddIcons">
    <template #heading-extra><WuEllipsis :text="store.addingCategory?.name ?? ''" class="text-[12px] text-[#8d9c94]" /></template>
    <div class="flex shrink-0 flex-wrap items-center gap-[12px] p-[16px] sm:px-[24px]">
      <WuInput class="w-[240px] max-w-full" :model-value="store.memberSearch" :disabled="store.saving" placeholder="搜索名称或 ID" @update:model-value="store.setMemberSearch" />
      <div class="flex gap-[4px]">
        <button v-for="source in sources" :key="source.id" type="button" class="h-[34px] rounded-[6px] px-[12px] text-[12px]" :class="store.addingSource === source.id ? 'bg-[#25392e] text-[#b4e5cc]' : 'text-[#99a79f] hover:bg-white/5'" :disabled="store.saving" @click="store.setAddingSource(source.id)">{{ source.name }}</button>
      </div>
    </div>
    <WuScrollArea class="min-h-0 flex-1" content-class="px-[16px] pb-[24px] sm:px-[24px]">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-[8px]">
        <button v-for="icon in store.addingIcons" :key="icon.id" type="button" class="relative flex h-[124px] min-w-0 flex-col items-center justify-center gap-[10px] rounded-[8px] px-[10px] outline -outline-offset-1" :class="store.addingMemberIds.has(icon.id) ? 'bg-[#171f1a] opacity-45 outline-transparent' : store.addingIds.includes(icon.id) ? 'bg-[#233b2d] outline-[#79c9a1]' : 'bg-[#171f1a] outline-transparent hover:bg-[#222e26]'" :disabled="store.saving || store.addingMemberIds.has(icon.id)" @click="store.toggleAddingIcon(icon.id)">
          <span v-if="store.addingMemberIds.has(icon.id)" class="absolute right-[6px] top-[5px] text-[10px] text-[#99a79f]">已归类</span>
          <span v-else-if="store.addingIds.includes(icon.id)" class="absolute right-[8px] top-[5px] text-[#79c9a1]">✓</span>
          <NavigationArtwork :url="icon.url" class="h-[64px] w-[64px] shrink-0" />
          <WuEllipsis :text="iconDisplayName(icon)" class="w-full text-center text-[12px]" />
        </button>
      </div>
      <div v-if="!store.addingIcons.length" class="py-[80px] text-center text-[13px] text-[#8d9c94]">没有匹配的图标</div>
    </WuScrollArea>
    <template #footer>
      <div class="mr-auto flex items-center gap-[12px]"><span class="text-[12px] text-[#99a79f]">已选 {{ store.addingIds.length }} 个</span><WuButton size="sm" variant="ghost" :disabled="store.saving || !store.addingIds.length" @click="store.clearAddingSelection">清空选择</WuButton></div>
      <WuButton variant="ghost" :disabled="store.saving" @click="store.closeAddIcons">取消</WuButton>
      <WuButton variant="solid" tone="accent" :disabled="store.saving || !store.addingIds.length" :loading="store.saving" @click="store.confirmAddIcons">添加 {{ store.addingIds.length }} 个图标</WuButton>
    </template>
  </WuDialog>
</template>
