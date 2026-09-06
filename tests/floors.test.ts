import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Collection from 'ol/Collection.js'
import ImageWrapper from 'ol/Image.js'
import ImageState from 'ol/ImageState.js'
import Projection from 'ol/proj/Projection.js'
import type BaseLayer from 'ol/layer/Base.js'
import LayerGroup from 'ol/layer/Group.js'
import ImageLayer from 'ol/layer/Image.js'
import VectorLayer from 'ol/layer/Vector.js'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import { createFloorCoverage, floorExtent, floorGroupAtCenter } from '../src/map/floor-coverage.ts'
import { createFloorLayers } from '../src/map/floor-layers.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import type { AuthoredNavigationPoint, MapStateDefinition } from '../src/domain/types.ts'
import { emptyPointLibrary } from '../src/domain/point-library.ts'
import { mixedPoint, smallEcho } from './fixtures/point-library.ts'

const dataset = await readMapDataset()
const state: MapStateDefinition = {
  id: 8, name: '测试地图', tileIds: [], gravityTiles: [],
  tileExtent: { minTileX: -1, maxTileX: 3, minTileY: -1, maxTileY: 3, extent: [-1024, -2048, 4096, 3072] },
  layeredMaps: [
    { id: 'a', name: '甲区域', coverage: ['0_1.png', '2_1.png', '-1_-1.png'].map((tile) => ({ tile, size: 4, runs: tile === '0_1.png' ? [[2, 4], [6, 16]] : [[0, 16]] })), floors: [
      { id: 'a1', name: '上层', layeredMapId: 'a', tiles: ['/a/1/0_1.png', '/a/1/2_1.png'] },
      { id: 'a2', name: '下层', layeredMapId: 'a', tiles: ['/a/2/0_1.png', '/a/2/-1_-1.png'] },
    ] },
    { id: 'b', name: '乙区域', coverage: [{ tile: '0_1.png', size: 4, runs: [[0, 2], [4, 6]] }],
      floors: [{ id: 'b1', name: '乙层', layeredMapId: 'b', tiles: ['/b/1/0_1.png'] }] },
    { id: 'empty', name: '空区域', coverage: [], floors: [{ id: 'empty', name: '空层', layeredMapId: 'empty', tiles: [] }] },
  ],
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('floor map context', () => {
  it('changes and restores floor layout without disturbing floor selection, viewport, routes or requests', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    store.selectLevel('a1')
    store.setMapViewport({ center: [500, 400], zoom: 5 })
    store.setRoute({ points: [], totalCost: 2, algorithm: 'exact', startPointId: null })
    store.requestLevel('a2')
    const pending = store.floorRequest
    const route = store.route
    const viewport = store.mapViewport
    expect(store.compactFloors).toBe(false)
    store.toggleFloorLayout()
    expect(store.compactFloors).toBe(true)
    expect(store.selectedLevelId).toBe('a1')
    expect(store.floorRequest).toBe(pending)
    expect(store.mapViewport).toBe(viewport)
    expect(store.route).toBe(route)
    store.toggleFloorLayout()
    expect(store.compactFloors).toBe(false)
    store.restoreUrlState({ compactFloors: true, levelId: 'a2' })
    expect(store.compactFloors).toBe(true)
    expect(store.selectedLevelId).toBe('a2')
    store.selectState(8)
    expect(store.compactFloors).toBe(true)
    store.restoreUrlState({})
    expect(store.compactFloors).toBe(false)
  })

  it('retains base points and cross-floor teleports for display without expanding route scope', () => {
    const store = useExplorerStore()
    const label = { id: 'region', name: '测试地区', stateId: 8, countryId: 1, level: 2,
      coordinate: { rawX: 0, rawY: 0, mapX: 0, mapY: 0 } }
    store.setDataset({ ...dataset, states: [state], regionLabels: [label] })
    const navigation = (id: string, levelId: string | null, mode: AuthoredNavigationPoint['mode']): AuthoredNavigationPoint => ({
      id, levelId, mode, kind: 'navigation', name: id, navigationKind: 'beacon', status: 'verified',
      stateId: 8, countryId: null, gravityType: null, coordinate: { x: 0, y: 0, z: 10 }, note: '',
    })
    store.setPointLibrary({ ...emptyPointLibrary(), points: [
      mixedPoint('base-echo'), { ...mixedPoint('floor-echo'), levelId: 'a1' },
      { ...mixedPoint('other-echo'), levelId: 'a2' }, { ...mixedPoint('other-map-echo'), stateId: 900 },
      navigation('base-ordinary', null, 'landmark'), navigation('floor-ordinary', 'a1', 'landmark'),
      navigation('other-ordinary', 'a2', 'landmark'), navigation('base-travel', null, 'fast-travel'),
      navigation('floor-travel', 'a1', 'fast-travel'), navigation('other-travel', 'a2', 'fast-travel'),
      { ...navigation('other-map-travel', null, 'fast-travel'), stateId: 900 },
    ] })
    store.toggleEcho(smallEcho.id)
    store.selectLevel('a1')
    expect(store.visibleRegionLabels).toEqual([label])
    expect(store.mapEchoLocations.map(({ id }) => id).sort()).toEqual(['base-echo', 'floor-echo'])
    expect(store.mapNavigationPoints.map(({ id }) => id).sort()).toEqual([
      'base-ordinary', 'base-travel', 'floor-ordinary', 'floor-travel', 'other-travel',
    ])
    expect(store.routeEligibleLocations.map(({ id }) => id)).toEqual(['floor-echo'])
    expect(store.routeEligibleNavigationPoints.map(({ id }) => id)).toEqual(['floor-travel'])
    store.selectPoint('base-echo')
    expect(store.selectedEchoLocation?.id).toBe('base-echo')
    store.selectPointCandidates(['base-echo', 'floor-echo'])
    expect(store.pointCandidates).toHaveLength(2)
    store.selectPoint('other-travel')
    expect(store.selectedNavigationPoint?.id).toBe('other-travel')
    store.setPointGroupVisible('manual:beacon', false)
    expect(store.mapNavigationPoints).toEqual([])
    expect(store.routeEligibleNavigationPoints.map(({ id }) => id)).toEqual(['floor-travel'])
    store.setPointGroupVisible('manual:beacon', true)
    store.selectLevel(null)
    expect(store.mapEchoLocations.map(({ id }) => id)).toEqual(['base-echo'])
    expect(store.mapNavigationPoints.map(({ id }) => id)).toEqual(['base-ordinary', 'base-travel'])
    store.toggleEcho(smallEcho.id)
    store.selectLevel('a1')
    expect(store.mapEchoLocations).toEqual([])
  })
})

describe('one floor group around the map center', () => {
  it('keeps overlapping groups reachable while a different group is selected', () => {
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.selectLevel('-1/57')
    store.setFloorCenter([-6681.5, 414.5], 1)
    expect(store.displayedFloorGroup?.id).toBe('57')
    expect(store).toHaveProperty('nearbyFloorGroups', expect.arrayContaining([
      expect.objectContaining({ id: '57' }), expect.objectContaining({ id: '58' }),
    ]))
    store.setRoute({ points: [], totalCost: 2, algorithm: 'exact', startPointId: null })
    store.requestLevel('-2/58')
    expect(store.displayedFloorGroup?.id).toBe('57')
    expect(store.route).not.toBeNull()
    expect(store.completeFloorRequest(store.floorRequest?.token ?? -1)).toBe(true)
    expect(store.displayedFloorGroup?.id).toBe('58')
    expect(store.selectedFloor?.id).toBe('-2/58')
    expect(store.route).toBeNull()
  })

  const coverage = createFloorCoverage(state, 1024)
  it('uses alpha coverage, preserves source order on ties, and handles empty tiles and negative coordinates', () => {
    expect(floorGroupAtCenter(coverage, [256, 768])).toBe('b')
    expect(floorGroupAtCenter(coverage, [768, 768])).toBe('a')
    expect(floorGroupAtCenter(coverage, [1500, 500])).toBeNull()
    expect(floorGroupAtCenter(coverage, [2500, 500])).toBe('a')
    expect(floorGroupAtCenter(coverage, [-500, -1500])).toBe('a')
    expect(floorGroupAtCenter(coverage, [0, 1024])).toBe('b')
    expect(floorGroupAtCenter(coverage, [1024, 1024])).toBeNull()
    expect(floorGroupAtCenter(coverage, [0, 0])).toBeNull()
    expect(floorGroupAtCenter(coverage, [NaN, 0])).toBeNull()
    expect(floorGroupAtCenter(coverage, null)).toBeNull()
    expect(createFloorCoverage(null, 1024)).toEqual([])
    expect(floorExtent(undefined, 1024)).toBeNull()
    const overlap = coverage[1]
    if (!overlap) throw new Error('缺少重叠范围')
    expect(floorGroupAtCenter([overlap, { ...overlap, id: 'tie' }], [256, 768])).toBe('b')
  })

  it('pins the selected group without changing the list, viewport or route when panning to another group', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    store.setFloorCenter([768, 768])
    const group = store.displayedFloorGroup
    expect(group?.id).toBe('a')
    store.setFloorCenter([780, 780])
    expect(store.displayedFloorGroup).toBe(group)
    store.setMapViewport({ center: [500, 500], zoom: 5 })
    store.selectLevel('a2')
    store.setRoute({ points: [], totalCost: 2, algorithm: 'exact', startPointId: null })
    const route = store.route
    store.setFloorCenter([256, 768])
    expect(store.displayedFloorGroup).toBe(group)
    expect(store.displayedFloorGroup?.floors.map(({ id }) => id)).toEqual(['a1', 'a2'])
    expect(store.selectedFloor?.id).toBe('a2')
    expect(store.route).toBe(route)
    store.requestLevel('a2')
    expect(store.route).toBe(route)
    store.requestLevel(null)
    expect(store.route).toBeNull()
    expect(store.displayedFloorGroup?.id).toBe('b')
    expect(store.mapViewport).toEqual({ center: [500, 500], zoom: 5 })
    store.setFloorCenter([1500, 500])
    expect(store.displayedFloorGroup).toBeNull()
  })

  it('holds the requested group during initial loading and restores center selection when cancelled', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    store.setFloorCenter([768, 768])
    store.requestLevel('a1')
    store.setFloorCenter([256, 768])
    expect(store.displayedFloorGroup?.id).toBe('a')
    store.requestLevel(null)
    expect(store.displayedFloorGroup?.id).toBe('b')
  })

  it('uses a screen-sized search radius and keeps the selected group available outside that radius', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    store.setFloorCenter([1200, 768], 1)
    expect(store.nearbyFloorGroups).toEqual([])
    store.setFloorCenter([1200, 768], 4)
    expect(store.nearbyFloorGroups.map(({ id }) => id)).toEqual(['a'])
    store.selectLevel('b1')
    expect(store.nearbyFloorGroups.map(({ id }) => id)).toEqual(['a', 'b'])
    store.setFloorCenter([1200, 768], NaN)
    expect(store.nearbyFloorGroups.map(({ id }) => id)).toEqual(['b'])
    store.selectState(8)
    expect(store.nearbyFloorGroups).toEqual([])
  })

  it('hides the switcher below local map scale without changing the selected floor, viewport or route', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    expect(store.floorSwitcherVisible).toBe(false)
    store.setFloorCenter([768, 768], 8)
    expect(store.floorSwitcherVisible).toBe(false)
    expect(store.nearbyFloorGroups).toEqual([])
    store.selectLevel('a2')
    store.setMapViewport({ center: [500, 500], zoom: 0 })
    store.setRoute({ points: [], totalCost: 2, algorithm: 'exact', startPointId: null })
    const route = store.route
    const viewport = store.mapViewport
    store.setFloorCenter([768, 768], 4)
    expect(store.floorSwitcherVisible).toBe(true)
    store.setFloorCenter([768, 768], 4.01)
    expect(store.floorSwitcherVisible).toBe(false)
    expect(store.selectedLevelId).toBe('a2')
    expect(store.route).toBe(route)
    expect(store.mapViewport).toBe(viewport)
    store.setFloorCenter([768, 768], 4)
    expect(store.floorSwitcherVisible).toBe(true)
    expect(store.selectedLevelId).toBe('a2')
    expect(store.nearbyFloorGroups.map(({ id }) => id)).toContain('a')
    store.setFloorCenter([768, 768], NaN)
    expect(store.floorSwitcherVisible).toBe(false)
    store.selectState(8)
    expect(store.floorSwitcherVisible).toBe(false)
  })

  it('preserves pending requests and retry errors while the switcher is hidden', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    store.selectLevel('a1')
    store.setFloorCenter([768, 768], 2)
    store.requestLevel('a2')
    const request = store.floorRequest
    store.setFloorCenter([768, 768], 8)
    expect(store.floorSwitcherVisible).toBe(false)
    expect(store.floorRequest).toBe(request)
    store.failFloorRequest(request?.token ?? -1)
    expect(store.floorSwitcherVisible).toBe(false)
    store.setFloorCenter([768, 768], 2)
    expect(store.floorSwitcherVisible).toBe(true)
    expect(store.selectedLevelId).toBe('a1')
    expect(store.floorRequest?.status).toBe('error')
  })

  it('restores the selected floor group from a URL even when the saved viewport is elsewhere', () => {
    const store = useExplorerStore()
    store.setDataset(dataset)
    store.restoreUrlState({ stateId: 8, levelId: '-1/58', viewport: { center: [0, 0], zoom: 4 } })
    store.setFloorCenter([0, 0])
    expect(store.displayedFloorGroup?.id).toBe('58')
    expect(store.displayedFloorGroup?.floors.map(({ id }) => id)).toEqual(['-1/58', '-2/58'])
  })

  it('commits only the latest successful request and preserves the old display on failure', () => {
    const store = useExplorerStore()
    store.setDataset({ ...dataset, states: [state] })
    store.selectLevel('a1')
    store.setRoute({ points: [], totalCost: 2, algorithm: 'exact', startPointId: null })
    store.requestLevel('a2')
    const first = store.floorRequest?.token ?? -1
    store.requestLevel('b1')
    const second = store.floorRequest?.token ?? -1
    expect(store.completeFloorRequest(first)).toBe(false)
    store.failFloorRequest(second)
    expect(store.floorRequest?.status).toBe('error')
    expect(store.selectedLevelId).toBe('a1')
    expect(store.displayedFloorGroup?.id).toBe('a')
    expect(store.route).not.toBeNull()
    store.requestLevel('b1')
    expect(store.completeFloorRequest(second)).toBe(false)
    expect(store.completeFloorRequest(store.floorRequest?.token ?? -1)).toBe(true)
    expect(store.displayedFloorGroup?.id).toBe('b')
    expect(store.route).toBeNull()
    store.requestLevel('unknown')
    expect(store.selectedLevelId).toBe('b1')
    store.requestLevel('a1')
    const cancelled = store.floorRequest?.token ?? -1
    store.selectState(8)
    expect(store.completeFloorRequest(cancelled)).toBe(false)
    expect(store.floorRequest).toBeNull()
    expect(store.selectedLevelId).toBeNull()
    expect(store.displayedFloorGroup).toBeNull()
  })
})

describe('floor group image handoff', () => {
  function setup(dimBase = true) {
    const images: ImageWrapper[] = []
    vi.spyOn(ImageWrapper.prototype, 'load').mockImplementation(function (this: ImageWrapper) {
      if (this.getState() !== ImageState.IDLE) return
      vi.spyOn(this, 'getState').mockReturnValue(ImageState.LOADING)
      images.push(this)
    })
    const layers = new Collection<BaseLayer>()
    const map = { addLayer: (layer: BaseLayer) => { layers.push(layer) }, removeLayer: (layer: BaseLayer) => layers.remove(layer) }
    const report = vi.fn()
    const manager = createFloorLayers(new Projection({ code: 'TEST:FLOORS', units: 'pixels' }), { dimBase, onError: report })
    function finish(image: ImageWrapper | undefined, success = true): void {
      if (!image) throw new Error('缺少待加载图片')
      vi.spyOn(image, 'getState').mockReturnValue(success ? ImageState.LOADED : ImageState.ERROR)
      image.dispatchEvent('change')
    }
    const tiles = () => layers.getArray().flatMap((layer) => layer instanceof LayerGroup
      ? layer.getLayers().getArray().filter((child) => child instanceof ImageLayer) : [])
    return { images, layers, map, report, manager, finish, tiles }
  }
  const extent = () => [10, 10, 900, 900]

  it('prepares visible siblings together and places them below one mask while the selected floor stays above', async () => {
    const app = setup()
    app.manager.update(app.map, state, dataset.source, 'b1')
    const old = [...app.layers.getArray()]
    const preparation = app.manager.prepare(state, dataset.source, 'a1', extent, new AbortController().signal)
    expect(app.images).toHaveLength(2)
    expect(app.layers.getArray()).toEqual(old)
    app.images.forEach((image) => app.finish(image))
    await preparation
    app.manager.update(app.map, state, dataset.source, 'a1')
    expect(app.layers.getLength()).toBe(2)
    const mask = app.layers.item(0)
    if (!(mask instanceof VectorLayer)) throw new Error('需要蒙层矢量图层')
    expect(mask.getZIndex()).toBe(5)
    expect(mask.getUpdateWhileInteracting()).toBe(true)
    expect(mask.getUpdateWhileAnimating()).toBe(true)
    const group = app.layers.item(1)
    const tiles = app.tiles()
    expect(tiles.map((layer) => layer.getZIndex())).toEqual([10, 10, 2, 2])
    expect(tiles.every((layer) => layer.getOpacity() === 1)).toBe(true)
    expect(app.manager.prepare(state, dataset.source, 'a2', extent, new AbortController().signal)).toBeUndefined()
    app.manager.update(app.map, state, dataset.source, 'a2')
    expect(app.layers.item(0)).toBe(mask)
    expect(app.layers.item(1)).toBe(group)
    expect(app.tiles()).toEqual(tiles)
    expect(tiles.map((layer) => layer.getZIndex())).toEqual([2, 2, 10, 10])
    expect(app.images).toHaveLength(2)
    app.manager.update(app.map, state, dataset.source, null)
    expect(app.layers.getLength()).toBe(0)
    app.manager.dispose()
  })

  it('keeps the previous group if a sibling fails and retries only the failed image', async () => {
    const app = setup()
    app.manager.update(app.map, state, dataset.source, 'b1')
    const old = [...app.layers.getArray()]
    const preparation = app.manager.prepare(state, dataset.source, 'a1', extent, new AbortController().signal)
    app.finish(app.images[0])
    app.finish(app.images[1], false)
    await expect(preparation).rejects.toThrow('楼层图片加载失败')
    expect(app.layers.getArray()).toEqual(old)
    expect(app.report).not.toHaveBeenCalled()
    const retry = app.manager.prepare(state, dataset.source, 'a1', extent, new AbortController().signal)
    expect(app.images).toHaveLength(3)
    app.finish(app.images[2])
    await retry
    app.manager.update(app.map, state, dataset.source, 'a1')
    expect(app.tiles()).toHaveLength(4)
    app.manager.dispose()
  })

  it('reuses decoded groups synchronously across group and main-map round trips', async () => {
    const app = setup()
    const first = app.manager.prepare(state, dataset.source, 'a1', extent, new AbortController().signal)
    app.images.forEach((image) => app.finish(image))
    await first
    app.manager.update(app.map, state, dataset.source, 'a1')
    const firstGroup = app.layers.item(1)
    const second = app.manager.prepare(state, dataset.source, 'b1', extent, new AbortController().signal)
    app.finish(app.images[2])
    await second
    app.manager.update(app.map, state, dataset.source, 'b1')
    expect(app.manager.prepare(state, dataset.source, 'a2', extent, new AbortController().signal)).toBeUndefined()
    app.manager.update(app.map, state, dataset.source, 'a2')
    expect(app.layers.item(1)).toBe(firstGroup)
    app.manager.update(app.map, state, dataset.source, null)
    expect(app.manager.prepare(state, dataset.source, 'a1', extent, new AbortController().signal)).toBeUndefined()
    app.manager.update(app.map, state, dataset.source, 'a1')
    expect(app.layers.item(1)).toBe(firstGroup)
    expect(app.images).toHaveLength(3)
    app.manager.dispose()
  })

  it('preloads a bounded neighboring area without requesting distant tiles', async () => {
    const app = setup()
    const first = app.manager.prepare(state, dataset.source, 'a1', extent, new AbortController().signal)
    app.images.forEach((image) => app.finish(image))
    await first
    app.manager.update(app.map, state, dataset.source, 'a1')
    app.manager.updateViewport([900, 100, 1900, 900])
    expect(app.images).toHaveLength(3)
    app.finish(app.images[2])
    await vi.waitFor(() => expect(app.manager.prepare(state, dataset.source, 'a2', () => [10, 10, 2900, 900], new AbortController().signal)).toBeUndefined())
    expect(app.images).toHaveLength(3)
    app.manager.dispose()
  })

  it('loads newly visible tiles while preparing without rebuilding already decoded images', async () => {
    const app = setup()
    let viewport = extent()
    const preparation = app.manager.prepare(state, dataset.source, 'a1', () => viewport, new AbortController().signal)
    viewport = [2100, 10, 2900, 900]
    app.images.forEach((image) => app.finish(image))
    await vi.waitFor(() => expect(app.images).toHaveLength(3))
    app.finish(app.images[2])
    await preparation
    app.manager.update(app.map, state, dataset.source, 'a1')
    expect(app.manager.prepare(state, dataset.source, 'a2', () => [10, 10, 2900, 900], new AbortController().signal)).toBeUndefined()
    app.manager.dispose()
  })

  it('cancels and times out without replacing the previous group', async () => {
    vi.useFakeTimers()
    const app = setup()
    app.manager.update(app.map, state, dataset.source, 'b1')
    const old = [...app.layers.getArray()]
    const abort = new AbortController()
    const cancelled = app.manager.prepare(state, dataset.source, 'a1', extent, abort.signal)
    abort.abort()
    await expect(cancelled).rejects.toThrow()
    app.images.forEach((image) => app.finish(image))
    const timed = app.manager.prepare(state, dataset.source, 'a2', () => [2100, 10, 2900, 900], new AbortController().signal)
    const assertion = expect(timed).rejects.toThrow('楼层图片加载超时')
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
    expect(app.layers.getArray()).toEqual(old)
    const retry = app.manager.prepare(state, dataset.source, 'a2', () => [2100, 10, 2900, 900], new AbortController().signal)
    expect(app.images).toHaveLength(4)
    app.finish(app.images[3])
    await retry
    app.manager.dispose()
  })

  it('releases cached groups on context changes and disposal, and aborts outstanding preparation', async () => {
    const app = setup()
    app.manager.update(app.map, state, dataset.source, 'a1')
    const first = app.tiles()[0]
    if (!first) throw new Error('缺少楼层图层')
    const releaseFirst = vi.spyOn(first, 'dispose')
    app.manager.update(app.map, state, dataset.source, null)
    expect(releaseFirst).not.toHaveBeenCalled()
    app.manager.update(app.map, state, { ...dataset.source, mapResourceHash: 'updated' }, 'a1')
    expect(releaseFirst).toHaveBeenCalledOnce()
    const updated = app.tiles()[0]
    if (!updated) throw new Error('缺少更新图层')
    const releaseUpdated = vi.spyOn(updated, 'dispose')
    app.manager.update(app.map, state, dataset.source, 'b1')
    expect(releaseUpdated).toHaveBeenCalledOnce()
    const pending = app.manager.prepare(state, dataset.source, 'a2', extent, new AbortController().signal)
    app.manager.dispose()
    await expect(pending).rejects.toThrow()
    expect(app.layers.getLength()).toBe(0)
  })

  it('keeps the point editor on a single floor without a mask or siblings', () => {
    const app = setup(false)
    app.manager.update(app.map, state, dataset.source, 'a1')
    expect(app.layers.getLength()).toBe(1)
    expect(app.tiles()).toHaveLength(2)
    expect(app.tiles().map((layer) => layer.getZIndex())).toEqual([10, 10])
    app.manager.dispose()
  })

  it('limits foreground loading to three requests and protects a large active group from cache eviction', async () => {
    const app = setup()
    const large: MapStateDefinition = { ...state, layeredMaps: [...state.layeredMaps, {
      id: 'large', name: '大区域', coverage: [], floors: Array.from({ length: 18 }, (_, index) => ({
        id: `large-${index}`, name: String(index), layeredMapId: 'large', tiles: [`/large/${index}/0_1.png`],
      })),
    }] }
    const preparation = app.manager.prepare(large, dataset.source, 'large-17', extent, new AbortController().signal)
    expect(app.images).toHaveLength(3)
    for (let count = 3; count <= 18; count += 3) {
      await vi.waitFor(() => expect(app.images).toHaveLength(count))
      app.images.slice(count - 3, count).forEach((image) => app.finish(image))
    }
    await preparation
    app.manager.update(app.map, large, dataset.source, 'large-17')
    const first = app.tiles()[0]
    if (!first) throw new Error('缺少楼层图层')
    const release = vi.spyOn(first, 'dispose')
    expect(app.tiles()).toHaveLength(18)
    expect(app.manager.prepare(large, dataset.source, 'large-0', extent, new AbortController().signal)).toBeUndefined()
    app.manager.update(app.map, large, dataset.source, 'large-0')
    expect(release).not.toHaveBeenCalled()
    app.manager.update(app.map, large, dataset.source, 'b1')
    expect(release).toHaveBeenCalledOnce()
    app.manager.dispose()
  })
})
