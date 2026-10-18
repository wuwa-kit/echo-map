<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { useNavigationIconManagerStore } from '../stores/navigation-icon-manager.ts'
import WuDialog from './base/WuDialog.vue'
import WuButton from './base/WuButton.vue'
import NavigationReplacementPicker from './NavigationReplacementPicker.vue'

const store = useNavigationIconManagerStore()
onBeforeUnmount(() => store.cancelRemoval())
</script>

<template>
  <WuDialog :open="store.removalOpen" title="移出分类：处理点位引用" size="md" @dismiss-requested="store.cancelRemoval">
    <div class="mb-[16px] text-[13px] leading-6 text-[#99a79f]">以下图标仍被定位点使用。请选择本分类的其它图标，或让这些点位显示“图标未找到”。确认后将同时更新点位并移出分类。</div>
    <div v-for="item in store.removalItems" :key="item.iconId" class="mb-[16px] space-y-[8px]">
      <div class="text-[13px]">{{ item.name }} · {{ item.categoryName }} · {{ item.pointIds.length }} 个定位点</div>
      <NavigationReplacementPicker :model-value="store.removalChoices[item.iconId] ?? null" :options="item.options" @update:model-value="store.setRemovalChoice(item.iconId, $event)" />
    </div>
    <template #footer><WuButton variant="solid" tone="danger" :disabled="!store.canConfirmRemoval" @click="store.confirmRemoval">替换点位图标并移出</WuButton></template>
  </WuDialog>
</template>
