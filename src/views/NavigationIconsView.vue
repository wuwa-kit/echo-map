<script setup lang="ts">
import WuSidebar from '../components/base/WuSidebar.vue'
import WuSidebarItem from '../components/base/WuSidebarItem.vue'
import WuSidebarDivider from '../components/base/WuSidebarDivider.vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import WuButton from '../components/base/WuButton.vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useEventListener, useTitle } from '@vueuse/core'
import WuInput from '../components/base/WuInput.vue'
import WuCheckBox from '../components/base/WuCheckBox.vue'
import WuScrollArea from '../components/base/WuScrollArea.vue'
import WuEllipsis from '../components/base/WuEllipsis.vue'
import WuSvg from '../components/base/WuSvg.vue'
import NavigationCategoriesPanel from '../components/NavigationCategoriesPanel.vue'
import NavigationArtwork from '../components/NavigationArtwork.vue'
import LibraryPageNavigation from '../components/LibraryPageNavigation.vue'
import { useNavigationIconLibraryStore } from '../stores/navigation-icon-library.ts'
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'
import { useNavigationIconsRouteQuery } from '../composables/useNavigationIconsRouteQuery.ts'
import { compareIconPosition, iconDisplayName, iconPosition } from '../domain/navigation-icon-library.ts'
import { iconSources } from '../domain/navigation-icon-pool.ts'
import NavigationIconDialog from '../components/NavigationIconDialog.vue'

const library = useNavigationIconLibraryStore()
const store = useNavigationIconManagerStore()
const { filters, search, filtered, selected, editable, loaded, error } = storeToRefs(store)
useNavigationIconsRouteQuery()
const categoryByIcon = computed(() => new Map(library.categories.flatMap(category =>
  category.icons.map(member => [member.iconId, category.name] as const),
)))
const sourceRows = computed(() => [{ id: 'all', name: '全部', count: library.pool.length }, ...iconSources.map(source => ({ ...source, count: library.pool.filter(icon => icon.source === source.id).length }))])
const iconSections = computed(() => iconSources
  .filter(source => filters.value.source === 'all' || filters.value.source === source.id)
  .map(source => {
    const icons = filtered.value.filter(icon => icon.source === source.id)
    const groups = source.id === 'unpacked'
      ? [1, 2, 3, 4].map(atlas => ({
          id: String(atlas), name: `图集 ${atlas}`,
          icons: icons.filter(icon => iconPosition(icon.id).atlas === atlas).toSorted(compareIconPosition),
        })).filter(group => group.icons.length)
      : [{ id: source.id, name: '', icons }]
    return { ...source, groups, count: icons.length }
  }).filter(source => source.count))
useTitle('图标管理 · 声巡')
function change(action: () => void): void { action() }
onBeforeRouteLeave(() => !editable.value || !library.dirty || window.confirm('修改尚未保存，确认离开？'))
useEventListener(window, 'beforeunload', event => { if (editable.value && library.dirty) event.preventDefault() })
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#101513] text-[#e4ebe7]">
    <LibraryPageNavigation title="图标管理">
        <div class="flex h-[36px] shrink-0 items-stretch gap-[4px] rounded-[8px] bg-white/5 p-[3px]">
          <button v-for="view in [{ id: 'categories', name: '图标分类' }, { id: 'icons', name: '图标池' }] as const" :key="view.id" type="button" class="cursor-pointer rounded-[5px] px-[12px] text-[12px]" :class="filters.view === view.id ? 'bg-[#2a4033] text-[#b4e5cc]' : 'text-[#8d9c94] hover:bg-white/5'" @click="change(() => store.setView(view.id))">{{ view.name }}</button>
        </div>
    </LibraryPageNavigation>
    <NavigationCategoriesPanel v-if="filters.view === 'categories'" />
    <div v-else class="relative flex min-h-0 flex-1">
      <WuSidebar>
        <template v-for="source in sourceRows" :key="source.id">
          <WuSidebarItem :text="source.name" :count="source.count" :selected="filters.source === source.id" @click="change(() => store.setSource(source.id))" />
          <WuSidebarDivider v-if="source.id === 'all'" />
        </template>
      </WuSidebar>
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex h-[64px] shrink-0 items-center gap-[10px] px-[20px]">
          <div class="min-w-0 max-w-[340px] flex-1"><WuInput type="search" :model-value="search" placeholder="搜索名称或 ID" @update:model-value="change(() => store.setSearch($event))" /></div>
          <WuCheckBox class="ml-auto flex shrink-0 items-center gap-[8px] whitespace-nowrap text-[12px] text-[#99a79f]" :model-value="filters.status === 'unnamed'" @update:model-value="store.setStatus($event ? 'unnamed' : 'all')">未命名</WuCheckBox>
        </div>
        <WuScrollArea class="min-h-0 flex-1" content-class="px-[20px] pb-[20px] pr-[26px]">
          <div v-if="!loaded && !error" class="py-[80px] text-center text-[13px] text-[#8d9c94]">加载中…</div>
          <div v-else-if="!loaded" class="flex flex-col items-center gap-[12px] py-[80px] text-[13px] text-[#8d9c94]">
            <span>图标加载失败</span>
            <WuButton size="sm" @click="store.load">重新加载</WuButton>
          </div>
          <div v-else-if="!filtered.length" class="py-[80px] text-center text-[13px] text-[#8d9c94]">没有匹配的图标</div>
          <div v-else class="space-y-[24px]">
          <div v-for="section in iconSections" :key="section.id">
            <div v-if="filters.source === 'all'" class="mb-[12px] text-[13px] font-semibold text-[#c7d8ce]">{{ section.name }}</div>
            <div class="space-y-[24px]">
            <div v-for="group in section.groups" :key="group.id">
            <div v-if="group.name" class="mb-[12px] text-[12px] text-[#8d9c94]">{{ group.name }}</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-[8px]">
            <button v-for="icon in group.icons" :key="icon.id" type="button" class="relative flex h-[124px] min-w-0 cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[8px] px-[10px] outline -outline-offset-1 transition-colors" :class="selected?.id === icon.id ? 'bg-[#233b2d] outline-[#79c9a1]' : 'bg-[#171f1a] outline-transparent hover:bg-[#222e26]'" @click="change(() => store.select(icon.id))">
              <span v-if="icon.source !== 'placeholder' && categoryByIcon.has(icon.id)" v-tooltip="'所属分类：' + categoryByIcon.get(icon.id)" class="absolute right-[6px] top-[6px] flex h-[20px] w-[20px] items-center justify-center text-[#a6edca]">
                <WuSvg name="tag" class="pointer-events-none [--wu-svg-h:13px]" />
              </span>
              <NavigationArtwork :url="icon.url" class="h-[64px] w-[64px] shrink-0" />
              <WuEllipsis :text="iconDisplayName(icon)" class="h-[18px] w-full text-center text-[12px] leading-[18px]" />
            </button>
            </div>
            </div>
            </div>
          </div>
          </div>
        </WuScrollArea>
      </div>
      <NavigationIconDialog />
    </div>
  </div>
</template>
