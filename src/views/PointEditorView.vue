<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import { useRouteQuery } from '@vueuse/router'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { usePointEditorStore } from '../stores/point-editor.ts'
import { MODE_NAMES, NAVIGATION_NAMES, pointTitle } from '../domain/point-library.ts'
import { navigationKindSchema, navigationModeSchema } from '../domain/schema.ts'
import PointEditorMap from '../components/PointEditorMap.vue'
import EchoPointIcon from '../components/EchoPointIcon.vue'
import WuCheckBox from '../components/base/WuCheckBox.vue'
import WuInput from '../components/base/WuInput.vue'
import WuOption from '../components/base/WuOption.vue'
import WuScrollArea from '../components/base/WuScrollArea.vue'
import WuSelect from '../components/base/WuSelect.vue'
import type { WuSelectValue } from '../components/base/select-context.ts'

const store = usePointEditorStore()
const compact = useMediaQuery('(max-width: 1023px)')
const { dataset, library, officialLibrary, allPoints, showOfficial, trackingEchoId, matchRadius, heightTolerance, requiresMatchDecision, draft, filteredPoints, nearbyPoints, busy, dirty, error, notice, search, monsterSearch, coordinateText, recovery, deleted, importPreview, versions } = storeToRefs(store)
const importFile = useTemplateRef<HTMLInputElement>('importFileRef')
const selectedQuery = useRouteQuery<string | undefined>('point', undefined, { mode: 'replace' })
const xQuery = useRouteQuery<string | undefined>('x', undefined, { mode: 'replace' })
const yQuery = useRouteQuery<string | undefined>('y', undefined, { mode: 'replace' })
const zoomQuery = useRouteQuery<string | undefined>('zoom', undefined, { mode: 'replace' })
const officialQuery = useRouteQuery<string | undefined>('official', undefined, { mode: 'replace' })
const trackingQuery = useRouteQuery<string | undefined>('tracking', undefined, { mode: 'replace' })
const radiusQuery = useRouteQuery<string | undefined>('radius', undefined, { mode: 'replace' })
const heightQuery = useRouteQuery<string | undefined>('matchHeight', undefined, { mode: 'replace' })
const savedViewport = computed(() => {
  if (xQuery.value === undefined || yQuery.value === undefined || zoomQuery.value === undefined) return null
  const x = Number(xQuery.value), y = Number(yQuery.value), zoom = Number(zoomQuery.value)
  return [x, y, zoom].every(Number.isFinite) && zoom >= 0 && zoom <= 24 ? { center: [x, y] as [number, number], zoom } : null
})
const currentState = computed(() => dataset.value?.states.find(({ id }) => id === draft.value?.stateId))
const floors = computed(() => currentState.value?.layeredMaps.flatMap(({ floors }) => floors) ?? [])
const countries = computed(() => dataset.value?.regionLabels.filter((label) => label.stateId === draft.value?.stateId && label.level === 1) ?? [])
const echoes = computed(() => dataset.value?.echoes.filter((echo) => echo.name.includes(monsterSearch.value.trim())).slice(0, 30) ?? [])
const echoById = computed(() => new Map(dataset.value?.echoes.map((echo) => [echo.id, echo])))
const verifiedCount = computed(() => library.value.points.filter(({ status }) => status === 'verified').length)
const existing = computed(() => library.value.points.some(({ id }) => id === draft.value?.id))
const importSummary = computed(() => {
  if (!importPreview.value) return null
  const oldIds = new Set(library.value.points.map(({ id }) => id))
  const newIds = new Set(importPreview.value.points.map(({ id }) => id))
  return {
    added: [...newIds].filter((id) => !oldIds.has(id)).length, removed: [...oldIds].filter((id) => !newIds.has(id)).length, updated: importPreview.value.points.filter((point) => {
      const old = library.value.points.find(({ id }) => id === point.id)
      return old && JSON.stringify(old) !== JSON.stringify(point)
    }).length
  }
})
const buttonClass = 'min-h-40px rounded-7px border border-[var(--line)] bg-[#142a22] px-12px text-13px text-[#c7dfd2] disabled:opacity-40'

function selectPoint(id: string): void {
  store.selectPoint(id)
  selectedQuery.value = existing.value ? draft.value?.id : undefined
}
function toggleOfficial(checked: boolean): void {
  store.setOfficialVisible(checked)
  officialQuery.value = showOfficial.value ? undefined : '0'
}
function setTracking(value: WuSelectValue): void {
  store.setTrackingEcho(typeof value === 'string' ? value : '')
  trackingQuery.value = trackingEchoId.value || undefined
}
function setMatchDistance(kind: 'radius' | 'height', value: string): void {
  store.setMatchingDistance(kind, Number(value))
  radiusQuery.value = matchRadius.value === 30 ? undefined : String(matchRadius.value)
  heightQuery.value = heightTolerance.value === 8 ? undefined : String(heightTolerance.value)
}
function newPoint(kind: 'echo' | 'navigation'): void {
  store.newPoint(kind)
  if (!existing.value) selectedQuery.value = undefined
}
async function runDraftAction(action: () => void | Promise<void>): Promise<void> {
  await action()
  selectedQuery.value = existing.value ? draft.value?.id : undefined
}
async function save(status: 'draft' | 'verified', next = false): Promise<void> {
  await store.saveDraft(status, next)
  if (!dirty.value) selectedQuery.value = existing.value ? draft.value?.id : undefined
}
function setNavigationKind(value: WuSelectValue): void {
  const parsed = navigationKindSchema.safeParse(value)
  if (parsed.success) store.setNavigationKind(parsed.data)
}
function setMode(value: WuSelectValue): void {
  const parsed = navigationModeSchema.safeParse(value)
  if (parsed.success) store.setMode(parsed.data)
}
async function importJson(event: Event): Promise<void> {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  if (file) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('导入文件超过 10 MB')
      store.previewImport(await file.text())
    } catch (error) { store.reportError(error instanceof Error ? error.message : String(error)) }
  }
  input.value = ''
}
function exportJson(): void {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(library.value, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'echo-map-points.json'
  link.click()
  URL.revokeObjectURL(url)
}
function publishViewport(viewport: {
  center: [number, number]
  zoom: number
} | null): void {
  if (!viewport) {
    xQuery.value = yQuery.value = zoomQuery.value = undefined
    return
  }
  xQuery.value = String(Number(viewport.center[0].toFixed(2)))
  yQuery.value = String(Number(viewport.center[1].toFixed(2)))
  zoomQuery.value = String(Number(viewport.zoom.toFixed(4)))
}
function changeState(value: WuSelectValue): void {
  if (typeof value !== 'number') return
  xQuery.value = yQuery.value = zoomQuery.value = undefined
  store.selectState(value)
}
function changeCountry(value: WuSelectValue): void {
  if (value === null || typeof value === 'number') store.setCountry(value)
}
function changeLevel(value: WuSelectValue): void {
  if (value === null || typeof value === 'string') store.setLevel(value)
}
onMounted(async () => {
  await store.load()
  store.setOfficialVisible(officialQuery.value !== '0')
  officialQuery.value = showOfficial.value ? undefined : '0'
  store.setMatchingDistance('radius', Number(radiusQuery.value ?? 30))
  store.setMatchingDistance('height', Number(heightQuery.value ?? 8))
  if (selectedQuery.value && !dirty.value) {
    if (library.value.points.some(({ id }) => id === selectedQuery.value)) store.selectPoint(selectedQuery.value)
    else selectedQuery.value = undefined
  }
  store.setTrackingEcho(trackingQuery.value ?? '')
  trackingQuery.value = trackingEchoId.value || undefined
  radiusQuery.value = matchRadius.value === 30 ? undefined : String(matchRadius.value)
  heightQuery.value = heightTolerance.value === 8 ? undefined : String(heightTolerance.value)
})
onBeforeRouteLeave(() => !dirty.value || window.confirm('当前修改尚未保存到点位库。离开后可恢复浏览器草稿，仍要离开吗？'))
useEventListener(window, 'beforeunload', (event) => {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
})
</script>

<template>
  <WuScrollArea :unbounded="!compact" class="h-full bg-[#091510] text-[#d7eadf]" content-class="lg:flex lg:h-full lg:flex-col" viewport-class="lg:h-full">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-12px border-b border-[var(--line)] px-16px py-12px lg:px-24px">
      <div class="flex items-center gap-16px"><RouterLink to="/" class="text-13px text-[#8eae9d]">← 返回地图</RouterLink><div><div class="text-20px font-600">点位录入</div><div class="mt-3px text-12px text-[#7d9e8b]">人工 {{ verifiedCount }} 处已核验 · {{ library.points.length - verifiedCount }} 处草稿 · 官方 {{ officialLibrary.points.length }} 处</div></div></div>
      <div class="flex flex-wrap gap-6px">
        <button :class="buttonClass" :disabled="busy" @click="store.load">重新载入</button>
        <button :class="buttonClass" :disabled="busy || !dataset" @click="exportJson">导出人工 JSON</button>
        <button :class="buttonClass" :disabled="busy || !dataset" @click="importFile?.click()">导入人工 JSON</button>
        <button :class="buttonClass" :disabled="busy" @click="store.loadVersions">历史版本</button>
        <input ref="importFileRef" type="file" accept="application/json,.json" class="hidden" aria-label="导入点位 JSON" @change="importJson" />
      </div>
    </div>
    <div v-if="error" class="shrink-0 whitespace-pre-wrap break-words bg-[#44251e] px-20px py-10px text-13px text-[#ffd0b8]" role="alert">{{ error }}</div>
    <div v-else-if="notice" class="shrink-0 bg-[#163328] px-20px py-8px text-12px text-[#a8d9c0]" role="status">{{ notice }}</div>
    <div v-if="recovery" class="flex shrink-0 flex-wrap items-center gap-10px bg-[#3b3420] px-20px py-10px text-13px"><span>发现上次未保存的编辑。</span><button :class="buttonClass" @click="runDraftAction(store.recoverDraft)">恢复草稿</button><button :class="buttonClass" @click="store.dismissRecovery">忽略草稿</button></div>
    <div v-if="deleted" class="flex shrink-0 items-center gap-10px bg-[#192e25] px-20px py-8px text-13px"><span>点位已删除。</span><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.undoDelete)">撤销删除</button></div>
    <div v-if="importPreview && importSummary" class="shrink-0 border-b border-[#937544] bg-[#302b1c] p-16px text-13px">
      <div>替换预览：共 {{ importPreview.points.length }} 处，新增 {{ importSummary.added }}、修改 {{ importSummary.updated }}、移除 {{ importSummary.removed }}。保存前会保留当前版本。</div>
      <div class="mt-10px flex gap-8px"><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.applyImport)">确认替换点位库</button><button :class="buttonClass" :disabled="busy" @click="store.cancelImport">取消</button></div>
    </div>
    <WuScrollArea v-if="versions.length" class="max-h-160px shrink-0 border-b border-[var(--line)]" content-class="p-12px" aria-label="历史版本">
      <div class="mb-8px flex items-center justify-between text-13px"><span>历史版本 · 选择后预览差异</span><button :class="buttonClass" @click="store.closeVersions">收起</button></div>
      <button v-for="version in versions" :key="version.revision" :class="buttonClass" class="mb-6px mr-6px" :disabled="busy" @click="store.previewVersion(version.revision)">{{ new Date(version.savedAt).toLocaleString('zh-CN') }}</button>
    </WuScrollArea>
    <div v-if="dataset && draft" class="min-h-0 flex-1 lg:grid lg:grid-cols-[220px_minmax(240px,1fr)_360px] xl:grid-cols-[250px_minmax(300px,1fr)_400px]">
      <div class="flex max-h-340px min-h-0 flex-col border-b border-[var(--line)] p-12px lg:max-h-none lg:border-b-0 lg:border-r">
        <div class="mb-10px grid grid-cols-2 gap-6px"><button :class="buttonClass" :disabled="busy" @click="newPoint('echo')">＋ 刷取点</button><button :class="buttonClass" :disabled="busy" @click="newPoint('navigation')">＋ 定位点</button></div>
        <WuCheckBox :model-value="showOfficial" :disabled="busy" class="mb-10px flex min-h-36px items-center gap-8px text-13px text-[#b9cfbf]" @update:model-value="toggleOfficial">显示官方点位</WuCheckBox>
        <WuInput :model-value="search" type="search" placeholder="搜索怪物、坐标或备注" aria-label="搜索点位" @update:model-value="store.setSearch" />
        <WuScrollArea class="mt-10px min-h-0 flex-1" role="list" aria-label="人工点位列表">
          <div v-if="!filteredPoints.length" class="py-24px text-center text-13px text-[#7e9e8d]">{{ library.points.length ? '没有匹配的点位' : '从第一处实测点位开始。' }}</div>
          <button v-for="point in filteredPoints.slice(0, 100)" :key="point.id" type="button" :aria-pressed="point.id === draft.id" class="mb-7px w-full rounded-8px border border-[var(--line)] bg-[#10241b] p-11px text-left aria-pressed:border-[#65f1c2]" @click="selectPoint(point.id)">
            <div class="mb-6px flex items-center justify-between text-10px tracking-wide"><span class="text-[#9ebaac]">{{ point.kind === 'echo' ? '刷取点' : '定位点' }}</span><span :class="point.status === 'verified' ? 'text-[#77e5b6]' : 'text-[#e2bd7f]'">{{ point.status === 'imported' ? '官方 · Z=0' : point.status === 'verified' ? '人工 · 已核验' : '人工 · 草稿' }}</span></div>
            <div class="text-13px leading-relaxed">{{ pointTitle(point, dataset) }}</div><div class="mt-6px font-mono text-11px text-[#7d9e8c]">{{ Object.values(point.coordinate).map((value) => value ?? '—').join(', ') }}</div>
          </button>
          <div v-if="filteredPoints.length > 100" class="py-10px text-12px text-[#7e9e8d]">共 {{ filteredPoints.length }} 处，显示前 100 处。可搜索或输入 XYZ 查找附近点。</div>
        </WuScrollArea>
      </div>
      <PointEditorMap :dataset="dataset" :points="allPoints" :draft="draft" :saved-viewport="savedViewport" class="h-340px lg:h-full" @point-selected="selectPoint" @position-picked="store.pickMapPosition" @viewport-changed="publishViewport" />
      <WuScrollArea :unbounded="compact" class="min-h-0 border-t border-[var(--line)] bg-[#0d1e16] lg:border-l lg:border-t-0" content-class="p-16px" aria-label="点位录入表单">
        <div class="mb-16px flex items-center justify-between"><div class="text-17px font-600">{{ existing ? '编辑' : '新增' }}{{ draft.kind === 'echo' ? '刷取点' : '定位点' }}</div><span class="text-12px text-[#dcb77b]">{{ dirty ? '未保存' : draft.status === 'verified' ? '已核验' : '草稿' }}</span></div>
        <div v-if="draft.kind === 'echo'" class="mb-16px rounded-8px border border-[var(--line)] bg-[#142d22] p-10px">
          <label for="editor-tracking-echo" class="mb-6px block text-13px text-[#b4d9c5]">当前追踪声骸</label>
          <WuSelect id="editor-tracking-echo" :native="compact" :model-value="trackingEchoId" :disabled="busy" @update:model-value="setTracking">
            <WuOption value="">未选择</WuOption>
            <WuOption v-for="echo in dataset.echoes" :key="echo.id" :value="echo.id">{{ echo.name }} · C{{ echo.cost }}</WuOption>
          </WuSelect>
          <div class="mt-7px text-12px leading-relaxed text-[#91ae9e]">只录认识的怪物即可。先填 XYZ，选择附近点追加；连续录入时保留追踪种类。</div>
          <button v-if="trackingEchoId && !draft.members.some(({ echoId }) => echoId === trackingEchoId)" :class="buttonClass" class="mt-7px w-full" :disabled="busy" @click="store.addMember(trackingEchoId)">加入本次记录</button>
        </div>
        <div class="mb-10px">
          <label for="editor-state" class="mb-5px block text-12px text-[#91ae9e]">地图</label>
          <WuSelect id="editor-state" :native="compact" :model-value="draft.stateId" :disabled="busy" @update:model-value="changeState">
            <WuOption v-for="state in dataset.states" :key="state.id" :value="state.id">{{ state.name }}</WuOption>
          </WuSelect>
        </div>
        <div class="grid grid-cols-2 gap-10px">
          <div>
            <label for="editor-country" class="mb-5px block text-12px text-[#91ae9e]">地区</label>
            <WuSelect id="editor-country" :native="compact" :model-value="draft.countryId" :disabled="busy" @update:model-value="changeCountry">
              <WuOption :value="null">未指定地区</WuOption>
              <WuOption v-for="country in countries" :key="country.id" :value="country.countryId">{{ country.name }}</WuOption>
            </WuSelect>
          </div>
          <div>
            <label for="editor-level" class="mb-5px block text-12px text-[#91ae9e]">楼层</label>
            <WuSelect id="editor-level" :native="compact" :model-value="draft.levelId" :disabled="busy" @update:model-value="changeLevel">
              <WuOption :value="null">地表</WuOption>
              <WuOption v-if="draft.levelId && !floors.some(({ id }) => id === draft?.levelId)" :value="draft.levelId">官方楼层 {{ draft.levelId }}（请核验选择）</WuOption>
              <WuOption v-for="floor in floors" :key="floor.id" :value="floor.id">{{ floor.name }}</WuOption>
            </WuSelect>
          </div>
        </div>
        <div class="mt-16px border-t border-[var(--line)] pt-14px">
          <div class="mb-7px text-13px font-600">游戏内实测坐标</div>
          <div class="flex gap-6px"><WuInput :model-value="coordinateText" :disabled="busy" placeholder="粘贴 XYZ，例如 -497, 449, 18" aria-label="粘贴 XYZ" @update:model-value="store.setCoordinateText" @confirm="store.applyCoordinateText" /><button :class="buttonClass" class="shrink-0" :disabled="busy" @click="store.applyCoordinateText">应用</button></div>
          <div class="mt-8px grid grid-cols-3 gap-8px"><label v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="text-11px text-[#88a694]">{{ axis.toUpperCase() }}<WuInput class="mt-4px font-mono" inputmode="numeric" :aria-label="`坐标 ${axis.toUpperCase()}`" :model-value="draft.coordinate[axis]" :disabled="busy" @update:model-value="store.setCoordinate(axis, $event)" /></label></div>
        </div>
        <div v-if="draft.kind === 'echo'" class="mt-12px rounded-8px border border-[var(--line)] p-10px">
          <div class="mb-8px text-13px font-600">附近点位匹配</div>
          <div class="grid grid-cols-2 gap-8px"><label class="text-11px text-[#91ae9e]">XY 范围<WuInput type="number" min="1" max="500" :model-value="matchRadius" lazy @update:model-value="setMatchDistance('radius', $event)" /></label><label class="text-11px text-[#91ae9e]">最大高度差<WuInput type="number" min="0" max="500" :model-value="heightTolerance" lazy @update:model-value="setMatchDistance('height', $event)" /></label></div>
          <div v-if="Object.values(draft.coordinate).some((value) => value === null)" class="mt-8px text-12px text-[#91ae9e]">填写完整 XYZ 后自动查找同地图、同楼层的已有刷取点。</div>
          <div v-else-if="!nearbyPoints.length" class="mt-8px text-12px text-[#91ae9e]">附近没有匹配点，可以新建。</div>
          <template v-else>
            <div class="mt-8px text-12px text-[#e1c18c]">找到 {{ nearbyPoints.length }} 处候选。官方点仅比较 XY，Z=0 不代表实际高度。</div>
            <div v-for="nearby in nearbyPoints.slice(0, 8)" :key="nearby.point.id" class="mt-8px rounded-7px bg-[#1a3025] p-9px">
              <div class="text-12px leading-relaxed">{{ pointTitle(nearby.point, dataset) }}</div>
              <div class="mt-4px font-mono text-11px text-[#9cb6a6]">XYZ {{ Object.values(nearby.point.coordinate).map((value) => value ?? '—').join(', ') }}</div>
              <div class="mt-4px text-11px text-[#9cb6a6]">{{ nearby.point.status === 'imported' ? '官方' : '人工' }} · XY {{ nearby.distance.toFixed(1) }} · {{ nearby.heightDifference === null ? '高度待核验' : `高度差 ${nearby.heightDifference.toFixed(1)}` }}</div>
              <button v-if="!existing" :class="buttonClass" class="mt-7px w-full" :disabled="busy" @click="runDraftAction(() => store.appendToNearby(nearby.point.id))">追加到此点</button>
            </div>
            <button v-if="requiresMatchDecision" :class="buttonClass" class="mt-8px w-full" @click="store.confirmSeparatePoint">这些都不是，作为独立新点</button>
            <div v-else-if="!existing && !draft.replacesOfficialIds?.length" class="mt-8px text-12px text-[#8bd4b2]">已选择建立独立点位。</div>
          </template>
        </div>
        <div v-if="draft.kind === 'echo'" class="mt-16px border-t border-[var(--line)] pt-14px">
          <div class="mb-10px flex items-center gap-12px"><EchoPointIcon :members="draft.members" :echoes="dataset.echoes" /><div><div class="text-13px font-600">怪物清单</div><div class="mt-4px text-12px text-[#90ae9d]">{{ draft.members.length }} 种 · {{ draft.members.reduce((sum, member) => sum + member.count, 0) }} 只 · 自动组合图标</div></div></div>
          <WuCheckBox :model-value="draft.compositionStatus === 'complete'" :disabled="busy" class="mb-10px flex min-h-36px items-center gap-8px text-12px text-[#a9c7b6]" @update:model-value="store.setCompositionComplete">怪物清单已补齐（可留空，后续继续追加）</WuCheckBox>
          <div v-for="member in draft.members" :key="member.echoId" class="mb-7px flex items-center gap-6px rounded-7px bg-[#152c22] px-8px py-5px">
            <img :src="echoById.get(member.echoId)?.iconUrl" alt="" class="h-32px w-32px object-contain" /><span class="min-w-0 flex-1 text-12px">{{ echoById.get(member.echoId)?.name ?? member.echoId }}</span>
            <div class="w-52px shrink-0"><WuInput size="sm" type="number" min="1" max="999" :aria-label="`${echoById.get(member.echoId)?.name}数量`" :model-value="member.count" :disabled="busy" @update:model-value="store.setMemberCount(member.echoId, Number($event))" /></div>
            <button class="h-36px border-0 bg-transparent text-13px text-[#a6b6a9]" :disabled="busy" :aria-label="`移除${echoById.get(member.echoId)?.name}`" @click="store.removeMember(member.echoId)">移除</button>
          </div>
          <WuInput class="mt-6px" :model-value="monsterSearch" type="search" placeholder="搜索怪物，点击添加" aria-label="搜索可添加怪物" @update:model-value="store.setMonsterSearch" />
          <WuScrollArea class="mt-7px max-h-190px" content-class="grid grid-cols-2 gap-5px" aria-label="可添加怪物">
            <button v-for="echo in echoes" :key="echo.id" class="flex min-h-44px items-center gap-5px rounded-6px border border-[var(--line)] bg-[#10251b] p-5px text-left" :disabled="busy" :aria-label="`添加${echo.name}`" @click="store.addMember(echo.id)"><img :src="echo.iconUrl" alt="" class="h-30px w-30px object-contain" loading="lazy" /><span class="min-w-0 text-11px leading-relaxed">{{ echo.name }}<span class="block text-10px text-[#88aa96]">C{{ echo.cost }} ＋</span></span></button>
          </WuScrollArea>
        </div>
        <div v-else class="mt-16px border-t border-[var(--line)] pt-14px">
          <label class="mb-10px block text-12px text-[#91ae9e]">名称<WuInput class="mt-5px" :model-value="draft.name" :disabled="busy" @update:model-value="store.setName" /></label>
          <div class="mb-10px">
            <label for="editor-navigation-kind" class="mb-5px block text-12px text-[#91ae9e]">定位点类型</label>
            <WuSelect id="editor-navigation-kind" :native="compact" :model-value="draft.navigationKind" :disabled="busy" @update:model-value="setNavigationKind">
              <WuOption v-for="(name, kind) in NAVIGATION_NAMES" :key="kind" :value="kind">{{ name }}</WuOption>
            </WuSelect>
          </div>
          <label for="editor-navigation-mode" class="mb-5px block text-12px text-[#91ae9e]">传送能力</label>
          <WuSelect id="editor-navigation-mode" :native="compact" :model-value="draft.mode" :disabled="busy" @update:model-value="setMode">
            <WuOption v-for="(name, mode) in MODE_NAMES" :key="mode" :value="mode">{{ name }}</WuOption>
          </WuSelect>
        </div>
        <label class="mt-16px block text-12px text-[#91ae9e]">备注<WuInput class="mt-5px" :model-value="draft.note" :disabled="busy" placeholder="入口、地形、核验说明…" @update:model-value="store.setNote" /></label>
        <div class="sticky bottom-0 mt-16px border-t border-[var(--line)] bg-[#0d1e16] pt-12px">
          <div class="mb-8px text-11px text-[#8daa99]">{{ draft.kind === 'echo' ? '核验 XYZ 和本次已知怪物即可保存；清单不必一次补齐。同种声骸再次追加时取较大数量。' : '核验 XYZ 和传送能力后保存；可直接传送的点位可作为路线起点。' }}</div>
          <div class="grid grid-cols-2 gap-6px"><button :class="buttonClass" :disabled="busy" @click="save('draft')">保存草稿</button><button class="min-h-42px rounded-7px border-0 bg-[#65f1c2] px-8px text-13px text-[#092519] font-600 disabled:opacity-40" :disabled="busy" @click="save('verified')">{{ busy ? '保存中…' : '核验并保存' }}</button></div>
          <button :class="buttonClass" class="mt-6px w-full" :disabled="busy" @click="save('verified', true)">核验保存，继续下一处 →</button>
          <div class="mt-7px flex flex-wrap gap-5px"><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.copyPoint)">复制到新点</button><button :class="buttonClass" :disabled="busy" @click="runDraftAction(store.discardChanges)">放弃修改</button><button v-if="existing" :class="buttonClass" class="text-[#e5ad9a]" :disabled="busy" @click="runDraftAction(store.deletePoint)">删除点位</button></div>
        </div>
      </WuScrollArea>
    </div>
    <div v-else class="flex flex-1 items-center justify-center p-40px text-14px text-[#91ae9e]">{{ busy ? '正在载入录入系统…' : '请通过本机开发服务打开录入系统，然后重新载入。' }}</div>
  </WuScrollArea>
</template>
