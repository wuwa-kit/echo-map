import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Feature from 'ol/Feature.js'
import Point from 'ol/geom/Point.js'
import Projection from 'ol/proj/Projection.js'
import Cluster from 'ol/source/Cluster.js'
import Style from 'ol/style/Style.js'
import { createPointLayers, mapFeaturePointIds } from '../src/map/point-layers.ts'
import type { MapDisplayPoint, NavigationPoint, RegionLabel } from '../src/domain/types.ts'
import { referenceDataset } from './fixtures/point-library.ts'

beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1 }))
afterEach(() => vi.unstubAllGlobals())

describe('map display layer integration', () => {
  it('places base context under the floor mask and keeps current-floor points and teleports above it', () => {
    const points = createPointLayers()
    const echo = referenceDataset.echoLocations[0]
    const point = referenceDataset.navigationPoints[0]
    if (!echo || !point) throw new Error('需要地图点位测试数据')
    const navigation: NavigationPoint[] = [
      { ...point, id: 'base-ordinary', levelId: null, mode: 'landmark', iconUrl: '' },
      { ...point, id: 'floor-ordinary', levelId: 'a1', mode: 'landmark', iconUrl: '' },
      { ...point, id: 'base-travel', levelId: null, mode: 'fast-travel', iconUrl: '' },
      { ...point, id: 'other-travel', levelId: 'a2', mode: 'fast-travel', iconUrl: '' },
    ]
    points.update([
      { ...echo, id: 'base-echo', levelId: null }, { ...echo, id: 'floor-echo', levelId: 'a1' },
    ], navigation, [], referenceDataset.echoes, undefined, 'a1')
    const [labels, foregroundEcho, foregroundNavigation, backgroundEcho, backgroundNavigation] = points.layers
    expect(labels?.getZIndex()).toBeLessThan(5)
    expect(backgroundEcho?.getZIndex()).toBeLessThan(5)
    expect(backgroundNavigation?.getZIndex()).toBeLessThan(5)
    expect(foregroundEcho?.getZIndex()).toBeGreaterThan(10)
    expect(foregroundNavigation?.getZIndex()).toBeGreaterThan(10)
    expect(backgroundNavigation?.getSource()?.getFeatures().flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual(['base-ordinary'])
    expect(foregroundNavigation?.getSource()?.getFeatures().flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual(['floor-ordinary', 'base-travel', 'other-travel'])
    points.finishInteraction([-100000, -100000, 100000, 100000], 2, new Projection({ code: 'TEST:FLOORS', units: 'pixels' }))
    for (const [layer, id] of [[foregroundEcho, 'floor-echo'], [backgroundEcho, 'base-echo']] as const) {
      const source = layer?.getSource()
      if (!(source instanceof Cluster)) throw new Error('需要独立的声骸聚类图层')
      const features = source.getFeatures()
      expect(features).toHaveLength(1)
      const cluster = features[0]
      if (!cluster) throw new Error('需要声骸聚合点')
      const members: Feature[] = cluster.get('features')
      expect(members).toHaveLength(1)
      expect(members.flatMap((feature) => mapFeaturePointIds(feature) ?? [])).toEqual([id])
      expect(layer?.getStyleFunction()?.(cluster, 8)).toBeUndefined()
    }
    points.update([], navigation.slice(0, 1), [], [])
    expect(backgroundNavigation?.getSource()?.getFeatures()).toEqual([])
    expect(backgroundEcho?.getSource()?.getFeatures()).toEqual([])
    expect(foregroundNavigation?.getSource()?.getFeatures()).toHaveLength(1)
    points.dispose()
  })

  it('updates point and label batches while dragging and animating', () => {
    const points = createPointLayers()
    for (const layer of points.layers) {
      expect(layer.getUpdateWhileInteracting()).toBe(true)
      expect(layer.getUpdateWhileAnimating()).toBe(true)
    }
    points.dispose()
  })

  it('keeps all existing clusters during zoom frames and reclusters once at the final resolution', () => {
    let moving = false
    const points = createPointLayers(() => moving)
    const location = referenceDataset.echoLocations[0]
    if (!location) throw new Error('需要声骸点测试数据')
    points.update([0, 80, 10000].map((x) => ({
      ...location, id: `point-${x}`, coordinate: { ...location.coordinate, mapX: x, mapY: 0 },
    })), [], [], referenceDataset.echoes)
    const clusters = points.layers[1]?.getSource()
    if (!(clusters instanceof Cluster)) throw new Error('需要声骸聚类图层')
    const projection = new Projection({ code: 'TEST:POINTS', units: 'pixels' })
    const extent = [-100, -100, 200, 100]
    clusters.loadFeatures(extent, 2, projection)
    const initial = clusters.getFeatures()
    expect(initial).toHaveLength(2)
    const refresh = vi.spyOn(clusters, 'refresh')
    moving = true
    for (const resolution of [1.8, 1.5, 1, 0.75, 0.5]) clusters.loadFeatures(extent, resolution, projection)
    expect(refresh).not.toHaveBeenCalled()
    expect(clusters.getFeatures()).toEqual(initial)
    expect(clusters.getFeaturesInExtent([9900, -100, 10100, 100])).toHaveLength(1)
    moving = false
    points.finishInteraction(extent, 0.5, projection)
    expect(refresh).toHaveBeenCalledOnce()
    expect(clusters.getFeatures()).toHaveLength(3)
    points.finishInteraction(extent, 0.5, projection)
    expect(refresh).toHaveBeenCalledOnce()
    points.dispose()
  })

  it('builds initial clusters during an interaction and immediately respects changed point filters', () => {
    const points = createPointLayers(() => true)
    const location = referenceDataset.echoLocations[0]
    if (!location) throw new Error('需要声骸点测试数据')
    points.update([location], [], [], referenceDataset.echoes)
    const clusters = points.layers[1]?.getSource()
    if (!(clusters instanceof Cluster)) throw new Error('需要声骸聚类图层')
    clusters.loadFeatures([-10000, -10000, 10000, 10000], 2, new Projection({ code: 'TEST:POINTS', units: 'pixels' }))
    expect(clusters.getFeatures()).toHaveLength(1)
    points.update([], [], [], referenceDataset.echoes)
    expect(clusters.getFeatures()).toEqual([])
    points.dispose()
  })

  it('switches text navigation levels on zoom without rebuilding features or making labels selectable', () => {
    const points = createPointLayers()
    const labels: RegionLabel[] = [1, 2, 3].map((level) => ({
      id: `label-${level}`, name: `地区 ${level}`, level, stateId: 8, countryId: 1,
      coordinate: { rawX: 10, rawY: 20, mapX: 30, mapY: 40 },
    }))
    points.update([], [], labels, [])
    const layer = points.layers[0]
    const features = layer?.getSource()?.getFeatures() ?? []
    const render = layer?.getStyleFunction()
    expect(features).toHaveLength(3)
    for (const feature of features) {
      const point = feature.get('mapPoint') as MapDisplayPoint
      if (point.category !== 'region-name') throw new Error('需要文字定位点')
      const { level } = point.location
      const geometry = feature.getGeometry()
      if (!(geometry instanceof Point)) throw new Error('文字定位需要 XY 点几何')
      expect(geometry.getCoordinates()).toEqual([30, 40])
      expect(Boolean(render?.(feature, 64))).toBe(level === 1)
      expect(Boolean(render?.(feature, 32))).toBe(level === 1)
      expect(Boolean(render?.(feature, 16))).toBe(level === 2)
      expect(Boolean(render?.(feature, 4))).toBe(level >= 2)
      expect(Boolean(render?.(feature, 2))).toBe(level === 3)
      const style = render?.(feature, level === 1 ? 64 : 4)
      expect(style).toBeInstanceOf(Style)
      if (!(style instanceof Style)) throw new Error('需要文字样式')
      expect(style.getText()?.getFill()?.getColor()).toBe('#ffffff')
      expect(style.getText()?.getStroke()).toBeNull()
      expect(mapFeaturePointIds(feature)).toBeUndefined()
    }
    expect(layer?.getSource()?.getFeatures()).toEqual(features)
    points.dispose()
  })

  it('hides teleport markers at world scale and restores nexuses in overview before beacons', () => {
    const points = createPointLayers()
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要定位点测试数据')
    const navigation: NavigationPoint[] = [
      { ...point, id: 'nexus', kind: 'nexus', iconUrl: '' },
      { ...point, id: 'beacon', kind: 'beacon', iconUrl: '' },
    ]
    points.update([], navigation, [], [])
    const layer = points.layers[2]
    const features = layer?.getSource()?.getFeatures() ?? []
    const render = layer?.getStyleFunction()
    expect(features).toHaveLength(2)
    if (!render) throw new Error('定位点需要缩放样式函数')
    for (const feature of features) {
      const isNexus = mapFeaturePointIds(feature)?.[0] === 'nexus'
      expect(render(feature, 64)).toBeUndefined()
      expect(render(feature, 32.01)).toBeUndefined()
      expect(Boolean(render(feature, 32))).toBe(isNexus)
      expect(Boolean(render(feature, 24))).toBe(isNexus)
      expect(Boolean(render(feature, 16))).toBe(isNexus)
      expect(Boolean(render(feature, 8.01))).toBe(isNexus)
      expect(render(feature, 8)).toBeDefined()
      expect(render(feature, 2)).toBeDefined()
      expect(render(feature, 64)).toBeUndefined()
    }
    expect(layer?.getSource()?.getFeatures()).toEqual(features)
    points.dispose()
  })

  it('does not repopulate manually filtered points when zoom changes', () => {
    const points = createPointLayers()
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要定位点测试数据')
    const navigation = { ...point, kind: 'service' as const, iconUrl: '' }
    points.update([], [navigation], [], [])
    const layer = points.layers[2]
    const feature = layer?.getSource()?.getFeatures()[0]
    if (!feature) throw new Error('定位点必须生成图层 Feature')
    const render = layer?.getStyleFunction()
    expect(render?.(feature, 4)).toBeUndefined()
    expect(render?.(feature, 2)).toBeDefined()
    expect(mapFeaturePointIds(feature)).toEqual([navigation.id])
    points.update([], [], [], [])
    expect(layer?.getSource()?.getFeatures()).toEqual([])
    expect(layer?.getSource()?.getFeaturesInExtent([-100000, -100000, 100000, 100000])).toEqual([])
    points.dispose()
  })
})
