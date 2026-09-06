import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Collection from 'ol/Collection.js'
import Projection from 'ol/proj/Projection.js'
import TileLayer from 'ol/layer/Tile.js'
import type BaseLayer from 'ol/layer/Base.js'
import { createOfficialBaseLayers } from '../src/map/official-base-layers.ts'
import { createOfficialTileLayer } from '../src/map/official-source.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { parsePointLibrary } from '../src/domain/point-library.ts'
import { appendObservation, findNearbyPoints } from '../src/domain/point-matching.ts'
import { normalizeGravityTiles } from '../scripts/lib/map/normalize.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { buildOfficialAssets } from '../src/domain/official-assets.ts'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import { createExplorerQueryValues, parseExplorerQueryValues } from '../src/url/explorer-url.ts'
import { resolveExplorerState } from '../src/url/resolve-explorer-state.ts'
import { planRouteInWorker } from '../src/route/worker-client.ts'
import type { AuthoredEchoPoint, AuthoredNavigationPoint, RouteResult } from '../src/domain/types.ts'
import { mixedPoint, referenceDataset } from './fixtures/point-library.ts'

vi.mock('../src/route/worker-client.ts')
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

const state = referenceDataset.states.find(({ id }) => id === 903)
if (!state) throw new Error('缺少阿维纽林地图')
const gravityState = state
const manifest = referenceDataset.source

function setupPoints() {
  const ordinary: AuthoredEchoPoint = { ...mixedPoint('ordinary'), stateId: 903, gravityType: 1 }
  const negative: AuthoredEchoPoint = { ...ordinary, id: 'negative', gravityType: 2 }
  const unknown: AuthoredEchoPoint = { ...ordinary, id: 'unknown', gravityType: null }
  const start: AuthoredNavigationPoint = {
    gravityType: 2, id: 'start', kind: 'navigation', status: 'verified', stateId: 903,
    countryId: null, levelId: null, coordinate: { x: 0, y: 0, z: 22 }, name: '信标',
    navigationKind: 'beacon', mode: 'fast-travel', note: '',
  }
  const store = useExplorerStore()
  store.setDataset(referenceDataset)
  store.setPointLibrary({ version: 1, points: [ordinary, negative, unknown, start] })
  store.setPointSource('manual')
  store.selectState(903)
  const member = ordinary.members[0]
  if (!member) throw new Error('缺少测试怪物')
  store.toggleEcho(member.echoId)
  return { store, ordinary, negative, unknown }
}

describe('gravity point data', () => {
  it('retains separate records at the same XY in different gravity states', () => {
    const point = referenceDataset.echoLocations[0]
    if (!point) throw new Error('缺少官方声骸')
    const data = { ...referenceDataset, navigationPoints: [], echoLocations: [
      { ...point, id: 'one', stateId: 903, levelId: null, gravityType: 1 as const },
      { ...point, id: 'two', stateId: 903, levelId: null, gravityType: 2 as const },
      { ...point, id: 'three', stateId: 903, levelId: null, gravityType: 2 as const },
    ] }
    const converted = convertOfficialPoints(data)
    expect(converted.points).toHaveLength(2)
    expect(converted.points.map(({ gravityType, officialIds }) => ({ gravityType, officialIds }))).toEqual([
      { gravityType: 1, officialIds: ['one'] }, { gravityType: 2, officialIds: ['three', 'two'] },
    ])
    expect(converted.points.every(({ coordinate }) => coordinate.z === 0)).toBe(true)
  })

  it('loads old manual points as unverified gravity and rejects invalid values', () => {
    const { gravityType: _gravity, ...legacy } = mixedPoint()
    const library = parsePointLibrary({ version: 1, points: [legacy] }, referenceDataset)
    expect(library.points[0]?.gravityType).toBeNull()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...legacy, gravityType: 3 }] }, referenceDataset)).toThrow()
  })

  it('prevents nearby matching and merging across gravity states', () => {
    const { ordinary, negative, unknown } = setupPoints()
    expect(findNearbyPoints([negative, unknown], ordinary)).toEqual([])
    expect(() => appendObservation(ordinary, negative)).toThrow('不同重力状态')
    expect(findNearbyPoints([{ ...ordinary, id: 'same' }], ordinary)).toHaveLength(1)
  })

  it('lists all 36 negative tiles in the asset catalogue and rejects malformed manifests', () => {
    expect(gravityState.gravityTiles).toHaveLength(36)
    const assets = buildOfficialAssets(referenceDataset).filter(({ category }) => category === 'gravity')
    expect(assets).toHaveLength(36)
    expect(assets.every(({ url, previewUrl, stateIds }) => url.includes('/903/2/') && previewUrl.includes('w_320') && stateIds.includes(903))).toBe(true)
    expect(normalizeGravityTiles({})).toEqual([])
    expect(normalizeGravityTiles([])).toEqual([])
    expect(normalizeGravityTiles({ '2': ['/2/-1_-2.png'] })).toEqual(['/2/-1_-2.png'])
    expect(() => normalizeGravityTiles({ '2': ['/2/../x.png'] })).toThrow()
    expect(() => normalizeGravityTiles({ '2': ['/2/0_0.png', '/2/0_0.png'] })).toThrow()
    expect(() => normalizeGravityTiles({ '3': [] })).toThrow()
    expect(() => mapDatasetSchema.parse({ ...referenceDataset, states: referenceDataset.states.map((state) => state.id === 903 ? { ...state, gravityTiles: ['/2/999_999.png'] } : state) })).toThrow('超出当前地图网格')
    expect(() => mapDatasetSchema.parse({ ...referenceDataset, states: referenceDataset.states.map((state) => ({ ...state, gravityTiles: [] })) })).toThrow('缺少对应底图资源')
  })
})

describe('gravity map scope', () => {
  it('switches points and routes together while retaining filters and the saved viewport', () => {
    const { store } = setupPoints()
    const viewport = { center: [235, -456] as [number, number], zoom: 5 }
    store.setMapViewport(viewport)
    store.selectPoint('ordinary')
    store.setRoute({ points: [], totalCost: 2, algorithm: 'exact', startPointId: null })
    expect(store.visibleEchoLocations.map(({ id }) => id)).toEqual(['ordinary', 'unknown'])
    expect(store.unmarkedGravityCount).toBe(1)
    expect(store.routeEligibleLocations.map(({ id }) => id)).toEqual(['ordinary'])
    expect(store.routeEligibleNavigationPoints).toEqual([])
    const echoIds = store.selectedEchoIds
    store.selectGravity(2)
    expect(store.visibleEchoLocations.map(({ id }) => id)).toEqual(['negative'])
    expect(store.routeEligibleLocations.map(({ id }) => id)).toEqual(['negative'])
    expect(store.routeEligibleLocations[0]?.gameCoordinate?.z).toBe(18)
    expect(store.routeEligibleNavigationPoints.map(({ id }) => id)).toEqual(['start'])
    expect(store.mapViewport).toEqual(viewport)
    expect(store.selectedEchoIds).toBe(echoIds)
    expect(store.selectedEchoLocation).toBeNull()
    expect(store.route).toBeNull()
    store.hidePointGroups(store.allNavigationPointGroups.map(({ id }) => id))
    expect(store.visibleNavigationPoints).toEqual([])
    expect(store.routeEligibleNavigationPoints).toHaveLength(1)
    store.selectGravity(1)
    expect(store.mapViewport).toEqual(viewport)
    store.selectState(8)
    store.selectGravity(2)
    expect(store.selectedGravity).toBe(1)
    expect(store.supportsGravity).toBe(false)
  })

  it('aborts an in-flight route and ignores its late response after switching', async () => {
    const { store } = setupPoints()
    const result = Promise.withResolvers<RouteResult>()
    vi.mocked(planRouteInWorker).mockReturnValue(result.promise)
    const pending = store.planRoute()
    const signal = vi.mocked(planRouteInWorker).mock.calls[0]?.[1]
    expect(store.planning).toBe(true)
    store.selectGravity(2)
    expect(signal?.aborted).toBe(true)
    expect(store.planning).toBe(false)
    result.resolve({ points: [], totalCost: 10, algorithm: 'exact', startPointId: null })
    await pending
    expect(store.route).toBeNull()
    expect(store.routeError).toBe('')
  })

  it('restores gravity from URL, omits the default, and ignores invalid or unsupported modes', () => {
    const resolved = resolveExplorerState(referenceDataset, parseExplorerQueryValues({ map: '903', gravity: '2', x: '100', y: '200', zoom: '4' }), 8)
    const query = createExplorerQueryValues(resolved)
    expect(query).toMatchObject({ map: '903', gravity: '2', x: '100', y: '200', zoom: '4' })
    const { store } = setupPoints()
    store.restoreUrlState(parseExplorerQueryValues(query))
    expect(store.selectedGravity).toBe(2)
    expect(store.mapViewport).toEqual({ center: [100, 200], zoom: 4 })
    expect(createExplorerQueryValues({ ...resolved, gravityType: 1 }).gravity).toBeUndefined()
    for (const gravity of ['3', '-1', 'NaN', '2.0', '']) {
      expect(parseExplorerQueryValues({ gravity }).gravityType).toBe(1)
    }
    expect(resolveExplorerState(referenceDataset, { stateId: 8, gravityType: 2 }, 8).gravityType).toBe(1)
    const destination = referenceDataset.mapNavigation.flatMap(({ regionIds }) => regionIds)
      .find((id) => referenceDataset.regionLabels.some((region) => region.id === id && region.stateId === 8))
    if (!destination) throw new Error('缺少其他地图目的地')
    store.navigateToRegion(destination)
    expect(store.selectedGravity).toBe(1)
  })

  it('uses only the three marked navigation points in the official negative view', () => {
    const store = useExplorerStore()
    store.setDataset(referenceDataset)
    store.setOfficialPointLibrary(convertOfficialPoints(referenceDataset))
    store.selectState(903)
    store.selectGravity(2)
    expect(store.visibleNavigationPoints).toHaveLength(3)
    expect(store.visibleNavigationPoints.every(({ gravityType }) => gravityType === 2)).toBe(true)
    expect(store.routeEligibleNavigationPoints).toHaveLength(2)
  })
})

describe('gravity basemap layers', () => {
  it('addresses the negative tiles with the same grid and does not fall back for missing tiles', () => {
    const layer = createOfficialTileLayer(gravityState, manifest, 2)
    const source = layer.getSource()
    if (!source) throw new Error('缺少瓦片源')
    const projection = new Projection({ code: 'KURO:CRS-SIMPLE', units: 'pixels' })
    const url = source.getTileUrlFunction()([0, 0, 0], 1, projection)
    expect(url).toContain('/903/2/-2_3.png?')
    expect(source.getTileUrlFunction()([0, 6, 0], 1, projection)).toBeUndefined()
    source.dispose()
    layer.dispose()
  })

  it('caches both layers, keeps errors associated with their mode, and retries the active source', () => {
    const collection = new Collection<BaseLayer>()
    const map = { getLayers: () => collection, removeLayer: (layer: BaseLayer) => collection.remove(layer) }
    const report = vi.fn()
    const manager = createOfficialBaseLayers(report)
    manager.update(map, gravityState, manifest, 1)
    const ordinary = collection.item(0)
    manager.update(map, gravityState, manifest, 2)
    const negative = collection.item(0)
    if (!(negative instanceof TileLayer)) throw new Error('缺少瓦片层')
    expect(collection.getLength()).toBe(2)
    expect(ordinary.getVisible()).toBe(false)
    expect(negative.getVisible()).toBe(true)
    negative.getSource()?.dispatchEvent('tileloaderror')
    expect(report).toHaveBeenLastCalledWith(true)
    manager.update(map, gravityState, manifest, 1)
    expect(report).toHaveBeenLastCalledWith(false)
    expect(ordinary.getVisible()).toBe(true)
    manager.update(map, gravityState, manifest, 2)
    expect(collection.item(0)).toBe(negative)
    expect(report).toHaveBeenLastCalledWith(true)
    manager.retry()
    expect(collection.item(0)).not.toBe(negative)
    expect(report).toHaveBeenLastCalledWith(false)
    expect(collection.getLength()).toBe(2)
    manager.dispose()
    expect(collection.getLength()).toBe(0)
  })
})
