<script setup lang="ts">
import WuSidebar from './base/WuSidebar.vue'
import WuSidebarItem from './base/WuSidebarItem.vue'
import WuSidebarDivider from './base/WuSidebarDivider.vue'
import { computed } from 'vue'
import { useNavigationIconLibraryStore } from '../stores/navigation-icon-library.ts'
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'
import { iconDisplayName } from '../domain/navigation-icon-library.ts'
import NavigationIconDialog from './NavigationIconDialog.vue'
import NavigationArtwork from './NavigationArtwork.vue'
import WuButton from './base/WuButton.vue'
import WuScrollArea from './base/WuScrollArea.vue'
import WuEllipsis from './base/WuEllipsis.vue'
import NavigationAddIconsDialog from './NavigationAddIconsDialog.vue'
import { builtInNavigationIconCategories, builtInIconType, categoryPointType, getNavigationPointType } from '../domain/navigation-point-types.ts'

const development = import.meta.env.DEV
const library = useNavigationIconLibraryStore()
const store = useNavigationIconManagerStore()
const allCategories = computed(() => {
  const icons = new Map(library.pool.map(icon => [icon.id, icon]))
  const groups = [
    ...builtInNavigationIconCategories,
    ...library.categories.map(category => ({ id: category.id, ...getNavigationPointType(categoryPointType(category.id), library.pointTypes) })),
  ]
  return groups.toSorted((a, b) => Number(a.id === 'unclassified') - Number(b.id === 'unclassified')).map(category => ({ ...category, members: category.icons.flatMap(id => {
    const icon = icons.get(id)
    const type = builtInIconType(id)
    return icon ? [{ ...icon, displayName: type?.icons.length === 1 ? type.name : iconDisplayName(icon) }] : []
  }) }))
})
const showingAll = computed(() => store.filters.category === 'all')
const visibleCategories = computed(() => showingAll.value ? allCategories.value : allCategories.value.filter(category => category.id === store.filters.category))
</script>

<template>
  <div class="relative flex min-h-0 flex-1">
    <WuSidebar>
      <WuSidebarItem text="全部" :count="allCategories.reduce((total, category) => total + category.members.length, 0)" :selected="showingAll" @click="store.setCategory('all')" />
      <WuSidebarDivider />
      <WuSidebarItem v-for="category in allCategories" :key="category.id" :text="category.name" :count="category.members.length" :selected="store.filters.category === category.id" @click="store.setCategory(category.id)" />
    </WuSidebar>
    <div class="flex min-w-0 flex-1 flex-col">
      <WuScrollArea class="min-h-0 flex-1" content-class="p-[20px] pr-[26px]">
        <div v-if="!store.loaded && !store.error" class="py-[80px] text-center text-[13px] text-[#8d9c94]">加载中…</div>
        <div v-else-if="!store.loaded" class="flex flex-col items-center gap-[12px] py-[80px] text-[13px] text-[#8d9c94]">
          <span>图标加载失败</span>
          <WuButton size="sm" @click="store.load">重新加载</WuButton>
        </div>
        <template v-else>
          <div v-for="category in visibleCategories" :key="category.id" class="relative flex flex-col gap-[16px] py-[20px] first:pt-0">
            <div v-if="showingAll" class="absolute inset-x-0 bottom-0 h-px bg-white/5" />
            <div class="flex min-h-[32px] items-center justify-between gap-[12px]">
              <button v-if="category.name" type="button" class="flex shrink-0 items-start gap-[8px] text-left text-[13px] text-[#b4e5cc]" @click="store.setCategory(category.id)"><span class="min-w-0 break-words">{{ category.name }}</span><span class="text-[11px] tabular-nums text-[#8d9c94]">{{ category.members.length }}</span></button>
              <WuButton v-if="development && !showingAll && store.activeCategory" size="sm" :disabled="!store.editable || store.busy || store.saving" @click="store.openAddIcons">添加图标</WuButton>
            </div>
            <div class="min-w-0 flex-1">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-[8px]">
                <button v-for="icon in category.members" :key="icon.id" type="button" class="flex h-[124px] min-w-0 flex-col items-center justify-center gap-[10px] rounded-[8px] bg-[#171f1a] px-[10px] hover:bg-[#222e26]" @click="store.openCategoryIcon(icon.id, category.id)">
                  <NavigationArtwork :url="icon.url" class="h-[64px] w-[64px] shrink-0" />
                  <WuEllipsis :text="icon.displayName" class="h-[18px] w-full text-center text-[12px] leading-[18px]" />
                </button>
              </div>
              <div v-if="!category.members.length" class="py-[24px] text-[12px] text-[#68786e]">暂无图标</div>
            </div>
          </div>
          <div v-if="!allCategories.length" class="py-[80px] text-center text-[13px] text-[#8d9c94]">暂无分类</div>
        </template>
      </WuScrollArea>
    </div>
    <NavigationIconDialog />
    <NavigationAddIconsDialog />
  </div>
</template>
