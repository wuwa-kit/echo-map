import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRouteExportStore } from '../src/stores/route-export.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { exportRouteImages } from '../src/route/image-export.ts'
import { createExportLayout } from '../src/route/export-layout.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import type { RouteExportImages } from '../src/route/image-export.ts'
import type { RouteResult } from '../src/domain/types.ts'

vi.mock('../src/route/image-export.ts')
const exporter = vi.mocked(exportRouteImages)
const dataset = await readMapDataset()
const route: RouteResult = { points: [{ id: 'a', name: '声骸', echoId: null, stateId: 8, levelId: null, coordinate: { x: 10, y: 20, z: 0 }, mapCoordinate: [10, 20] }], algorithm: 'exact', totalCost: 0, startPointId: null }
const images: RouteExportImages = {
  routes: [{ image: new Blob(['route'], { type: 'image/jpeg' }), width: 1600, height: 1800, columns: 2 }],
  maps: [{ stateId: 8, title: '地表地图', part: 1, parts: 1, image: new Blob(['map'], { type: 'image/jpeg' }), width: 1600, height: 1800, columns: 2 }],
  pages: [new Blob(['page'], { type: 'image/jpeg' })], layout: createExportLayout(route),
}

beforeEach(() => {
  setActivePinia(createPinia())
  exporter.mockReset()
  const explorer = useExplorerStore()
  explorer.setDataset(dataset)
  explorer.setRoute(route)
  explorer.setMapViewport({ center: [120, 340], zoom: 5.2 })
})

describe('route export actions', () => {
  it('publishes downloads without moving the main map and reopens completed results without rerendering', async () => {
    exporter.mockResolvedValue(images)
    const store = useRouteExportStore()
    await store.start()
    expect(store.status).toBe('ready')
    expect(store.artifacts?.routes[0]?.url).toMatch(/^blob:/u)
    expect(store.artifacts?.pages).toHaveLength(1)
    expect(store.artifacts?.routes[0]).toMatchObject({ width: 1600, height: 1800, columns: 2 })
    expect(store.artifacts?.pageWidth).toBe(1600)
    expect(useExplorerStore().mapViewport).toEqual({ center: [120, 340], zoom: 5.2 })
    store.close()
    await store.start()
    expect(exporter).toHaveBeenCalledOnce()
    expect(store.open).toBe(true)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    store.dispose()
    expect(revoke).toHaveBeenCalledTimes(3)
    revoke.mockRestore()
  })

  it('cancels pending work and ignores late completion', async () => {
    const pending = Promise.withResolvers<typeof images>()
    exporter.mockReturnValue(pending.promise)
    const store = useRouteExportStore()
    const task = store.start()
    store.close()
    expect(exporter.mock.calls[0]?.[1].aborted).toBe(true)
    pending.resolve(images)
    await task
    expect(store.artifacts).toBeNull()
    expect(store.status).toBe('cancelled')
  })

  it('retries failed resources from the captured route snapshot', async () => {
    exporter.mockRejectedValueOnce(new Error('路线 3 底图加载失败')).mockResolvedValueOnce(images)
    const store = useRouteExportStore()
    await store.start()
    expect(store.error).toContain('路线 3')
    useExplorerStore().clearRoute()
    await store.retry()
    expect(store.status).toBe('ready')
    expect(exporter.mock.calls[1]?.[0]).toBe(exporter.mock.calls[0]?.[0])
    store.dispose()
  })

  it('shows an oversized-image failure without publishing partial downloads', async () => {
    exporter.mockRejectedValue(new Error('图片尺寸过大，生成失败'))
    const store = useRouteExportStore()
    await store.start()
    expect(store.status).toBe('error')
    expect(store.error).toBe('图片尺寸过大，生成失败')
    expect(store.artifacts).toBeNull()
    store.dispose()
  })

  it('publishes multiple fixed-column route images when the export is split', async () => {
    exporter.mockResolvedValue({
      ...images,
      routes: [...images.routes, { image: new Blob(['route-2'], { type: 'image/jpeg' }), width: 1600, height: 1200, columns: 2 }],
    })
    const store = useRouteExportStore()
    await store.start()
    expect(store.status).toBe('ready')
    expect(store.artifacts?.routes).toHaveLength(2)
    expect(store.artifacts?.routes.map(({ filename }) => filename.slice(-3))).toEqual(['-01', '-02'])
    expect(store.artifacts?.maps.map(({ title }) => title)).toEqual(['地表地图'])
    expect(store.artifacts?.pages).toHaveLength(1)
    store.dispose()
  })
})
