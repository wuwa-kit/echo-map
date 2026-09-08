import { onScopeDispose, shallowReadonly, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useExplorerStore } from './explorer.ts'
import { exportRouteImages } from '../route/image-export.ts'
import type { RouteExportProgress } from '../route/image-export.ts'
import type { RouteExportSnapshot } from '../map/route-export.ts'

interface ExportArtifacts {
  title: string
  filename: string
  fullUrl: string
  pages: { url: string; height: number }[]
  width: number
  height: number
  pageWidth: number
  columns: number
}

export const useRouteExportStore = defineStore('route-export', () => {
  const open = shallowRef(false)
  const status = shallowRef<'idle' | 'running' | 'ready' | 'error' | 'cancelled'>('idle')
  const progress = shallowRef<RouteExportProgress>({ completed: 0, total: 0, message: '' })
  const error = shallowRef('')
  const artifacts = shallowRef<ExportArtifacts | null>(null)
  let active: AbortController | null = null
  let snapshot: RouteExportSnapshot | null = null

  function releaseImages(): void {
    if (artifacts.value?.fullUrl) URL.revokeObjectURL(artifacts.value.fullUrl)
    for (const page of artifacts.value?.pages ?? []) URL.revokeObjectURL(page.url)
    artifacts.value = null
  }

  function cancel(): void {
    active?.abort()
    active = null
    if (status.value === 'running') status.value = 'cancelled'
  }

  function close(): void {
    cancel()
    open.value = false
  }

  function reportProgress(value: RouteExportProgress, controller: AbortController): void {
    if (active === controller) progress.value = value
  }

  async function generate(value: RouteExportSnapshot): Promise<void> {
    cancel()
    releaseImages()
    snapshot = value
    const controller = new AbortController()
    active = controller
    open.value = true
    status.value = 'running'
    error.value = ''
    progress.value = { completed: 0, total: 0, message: '正在计算子路线裁切与排版' }
    try {
      const result = await exportRouteImages(value, controller.signal, (progress) => reportProgress(progress, controller))
      if (active !== controller) return
      const filename = `声巡-${value.title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').slice(0, 60)}-${value.createdAt.replace(/[ :/]/gu, '-')}`
      artifacts.value = {
        title: value.title, filename, fullUrl: URL.createObjectURL(result.full),
        pages: result.pages.map((blob, index) => ({ url: URL.createObjectURL(blob), height: result.layout.pageHeights[index] ?? 0 })),
        width: result.fullSize.width, height: result.fullSize.height,
        pageWidth: result.layout.width,
        columns: result.fullColumns,
      }
      status.value = 'ready'
    } catch (reason) {
      if (active !== controller) return
      error.value = reason instanceof Error ? reason.message : String(reason)
      status.value = 'error'
    } finally {
      if (active === controller) active = null
    }
  }

  async function start(): Promise<void> {
    const explorer = useExplorerStore()
    if (!explorer.route || !explorer.dataset) return
    if (snapshot?.route === explorer.route && status.value === 'ready') {
      open.value = true
      return
    }
    const echoNames = explorer.dataset.echoes.filter(({ id }) => explorer.selectedEchoIds.includes(id)).map(({ name }) => name)
    const title = echoNames.length <= 3 ? echoNames.join(' · ') : `${echoNames.slice(0, 2).join(' · ')} 等 ${echoNames.length} 种声骸`
    await generate({
      route: explorer.route, dataset: explorer.dataset,
      locations: explorer.routeEligibleLocations, navigationPoints: explorer.routeEligibleNavigationPoints,
      echoIds: [...explorer.activeEchoIds], gravity: explorer.selectedGravity,
      title: title || `${explorer.activeMapName}声骸路线`,
      usesOfficial: [...explorer.routeEligibleLocations, ...explorer.routeEligibleNavigationPoints].some(({ quality }) => quality === 'official-provisional'),
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    })
  }

  function retry(): Promise<void> | undefined { if (snapshot) return generate(snapshot) }
  function dispose(): void {
    close()
    releaseImages()
    snapshot = null
    status.value = 'idle'
  }
  onScopeDispose(dispose)
  return { open: shallowReadonly(open), status: shallowReadonly(status), progress: shallowReadonly(progress), error: shallowReadonly(error), artifacts: shallowReadonly(artifacts), start, retry, cancel, close, dispose }
})
