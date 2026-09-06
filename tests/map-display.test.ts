import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Point from 'ol/geom/Point.js'
import Style from 'ol/style/Style.js'
import { createPointLayers, mapFeaturePointIds } from '../src/map/point-layers.ts'
import type { MapDisplayPoint, NavigationPoint, RegionLabel } from '../src/domain/types.ts'
import { referenceDataset } from './fixtures/point-library.ts'

beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1 }))
afterEach(() => vi.unstubAllGlobals())

describe('map display layer integration', () => {
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
