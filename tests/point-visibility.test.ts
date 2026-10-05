import { describe, expect, it } from 'vitest'
import View from 'ol/View.js'
import { MAP_POINT_ZOOM_RANGES, MAP_TIER_ZOOM_RANGES, isMapPointVisibleAtZoom, isPointVisibleAtZoom, mapPointZoomRange, mapResolutionForZoom, mapZoomForResolution, mapZoomRangeLabel } from '../src/map/point-visibility.ts'
import { mapZoomRangeSchema, regionLabelSchema } from '../src/domain/schema.ts'
import { selectRegionLabels } from '../src/domain/explorer-selectors.ts'
import type { EchoMapLocation, MapDisplayPoint, RegionLabel } from '../src/domain/types.ts'
import { navigationPoint, navigationTestDataset as referenceDataset } from './fixtures/navigation-points.ts'
import { smallEcho, eliteEcho } from './fixtures/point-library.ts'

const label: RegionLabel = {
  id: 'test-region', name: '测试地区', stateId: 8, countryId: 1, level: 2,
  coordinate: { rawX: 10, rawY: 20, mapX: 30, mapY: 40 },
}

describe('map point zoom visibility', () => {
  it('hands district names to small places at step 9 without overlap and keeps country names for navigation only', () => {
    const country: MapDisplayPoint = { category: 'region-name', location: { ...label, level: 1 } }
    const region: MapDisplayPoint = { category: 'region-name', location: label }
    const place: MapDisplayPoint = { category: 'region-name', location: { ...label, level: 3 } }
    for (const zoom of [9 - 1e-8, 9, 9 + 1e-8, 16, 35, 50]) {
      expect(isMapPointVisibleAtZoom(country, zoom)).toBe(false)
      expect(isMapPointVisibleAtZoom(region, zoom)).toBe(false)
      expect(isMapPointVisibleAtZoom(place, zoom)).toBe(true)
    }
    for (const zoom of [0, 3, 8, 8.99]) {
      expect(isMapPointVisibleAtZoom(country, zoom)).toBe(false)
      expect(isMapPointVisibleAtZoom(region, zoom)).toBe(true)
      expect(isMapPointVisibleAtZoom(place, zoom)).toBe(false)
    }
    for (const zoom of [0, 8.99, 9, 16, 35]) {
      const forest = referenceDataset.regionLabels.find(({ name }) => name === '无光之森')
      const banyan = referenceDataset.regionLabels.find(({ name }) => name === '中央巨榕')
      if (!forest || !banyan) throw new Error('需要官方地区名回归数据')
      expect(forest.level).toBe(2)
      expect(banyan.level).toBe(3)
      expect(isMapPointVisibleAtZoom({ category: 'region-name', location: forest }, zoom)).toBe(zoom < 9)
      expect(isMapPointVisibleAtZoom({ category: 'region-name', location: banyan }, zoom)).toBe(zoom >= 9)
    }
  })

  it('uses navigation type for each point, independently of icon grouping or teleport mode', () => {
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要定位点测试数据')
    const nexus: MapDisplayPoint = { category: 'navigation', location: { ...point, kind: 'nexus', pointType: 'central-beacon' } }
    const service: MapDisplayPoint = { category: 'navigation', location: { ...point, kind: 'service', pointType: 'service' } }
    expect(isMapPointVisibleAtZoom(nexus, 0)).toBe(true)
    expect(isMapPointVisibleAtZoom(service, 15.99)).toBe(false)
    expect(isMapPointVisibleAtZoom(service, 16)).toBe(true)
    for (const zoom of [16, 23, 35, 50]) {
      expect(isMapPointVisibleAtZoom(nexus, zoom)).toBe(true)
      expect(isMapPointVisibleAtZoom(service, zoom)).toBe(true)
    }
    const landmark: MapDisplayPoint = { category: 'navigation', location: { ...nexus.location, mode: 'landmark' } }
    expect(isMapPointVisibleAtZoom(landmark, 0)).toBe(true)
    expect(isMapPointVisibleAtZoom(service, 0)).toBe(false)
  })

  it('uses near visibility when the type is unset, regardless of navigation kind', () => {
    const location = navigationPoint('central-beacon')
    delete location.pointType
    const point: MapDisplayPoint = { category: 'navigation', location }
    for (const zoom of [0, 8.99, 9, 15.99, 16, 35]) {
      expect(isMapPointVisibleAtZoom(point, zoom)).toBe(zoom >= 16)
    }
  })

  it.each([
    ['central-beacon', 0], ['normal-boss', 0], ['weekly-boss', 0], ['hologram', 0],
    ['small-beacon', 9], ['nightmare-boss', 9], ['material-domain', 9], ['tacet-field', 9], ['challenge', 9],
    ['echo-settlement', 16],
    ['entrance', 16], ['service', 16],
  ] as const)('shows %s from step %s onwards', (type, threshold) => {
    const point: MapDisplayPoint = { category: 'navigation', location: navigationPoint(type) }
    for (const zoom of [0, 8.99, 9, 15.99, 16, 23, 35, 50]) {
      expect(isMapPointVisibleAtZoom(point, zoom)).toBe(zoom >= threshold)
    }
  })

  it('reveals every echo composition and source alongside small beacons', () => {
    const point = referenceDataset.echoLocations[0]
    const beacon = referenceDataset.navigationPoints.find(({ pointType }) => pointType === 'small-beacon')
    if (!point || !beacon) throw new Error('需要声骸与小型信标测试数据')
    const locations: EchoMapLocation[] = [point, ...[
      [{ echoId: smallEcho.id, count: 1 }],
      [{ echoId: eliteEcho.id, count: 1 }],
      [{ echoId: smallEcho.id, count: 3 }],
      [{ echoId: eliteEcho.id, count: 2 }, { echoId: smallEcho.id, count: 3 }],
    ].map((members) => ({ ...point, members, note: '' }))]
    const navigation: MapDisplayPoint = { category: 'navigation', location: beacon }
    for (const location of locations) {
      for (const gameCoordinate of [null, { x: 1, y: 2, z: 0 }, { x: 1, y: 2, z: 300 }]) {
        const echo: MapDisplayPoint = { category: 'echo', location: { ...location, gameCoordinate } }
        expect(isMapPointVisibleAtZoom(echo, 8.99)).toBe(false)
        for (const zoom of [9 - 1e-8, 9, 9 + 1e-8, 16, 23, 35, 50]) {
          expect(isMapPointVisibleAtZoom(echo, zoom)).toBe(true)
          expect(isMapPointVisibleAtZoom(echo, zoom)).toBe(isMapPointVisibleAtZoom(navigation, zoom))
        }
      }
    }
  })

  it('uses the same actual scale on small and large base maps, without changing URL zoom', () => {
    const views = [64, 8].map((maxResolution) => new View({ maxResolution, minResolution: 0.125, resolution: mapResolutionForZoom(12) }))
    expect(views[0]?.getZoom()).not.toBe(views[1]?.getZoom())
    for (const view of views) {
      const zoom = mapZoomForResolution(view.getResolution() ?? Number.NaN)
      expect(zoom).toBeCloseTo(12)
      expect(isPointVisibleAtZoom(MAP_POINT_ZOOM_RANGES.echo, zoom)).toBe(true)
      expect(isPointVisibleAtZoom(MAP_TIER_ZOOM_RANGES.near, zoom)).toBe(false)
    }
  })

  it('rejects invalid zoom/resolution and validates every configured range', () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(isPointVisibleAtZoom(MAP_TIER_ZOOM_RANGES.always, value)).toBe(false)
    }
    for (const value of [0, -1, Number.NaN, Infinity]) expect(mapZoomForResolution(value)).toBeNaN()
    for (const range of [...Object.values(MAP_POINT_ZOOM_RANGES), ...Object.values(MAP_TIER_ZOOM_RANGES)]) expect(mapZoomRangeSchema.safeParse(range).success).toBe(true)
    for (const range of [{ minZoom: 3, maxZoom: 3 }, { minZoom: 4, maxZoom: 2 }, { minZoom: -1, maxZoom: null }]) {
      expect(mapZoomRangeSchema.safeParse(range).success).toBe(false)
    }
    expect(mapZoomRangeLabel(mapPointZoomRange({ category: 'region-name', location: label }))).toBe('第 0 至 9 格前显示')
    expect(mapZoomRangeLabel(MAP_TIER_ZOOM_RANGES.always)).toBe('常驻')
    expect(mapZoomRangeLabel(MAP_TIER_ZOOM_RANGES.far)).toBe('远景')
    expect(mapZoomRangeLabel(MAP_TIER_ZOOM_RANGES.near)).toBe('近景')
  })

  it('calibrates 35 logarithmic steps to the measured spans and extends beyond both ends', () => {
    expect(mapResolutionForZoom(0)).toBe(4)
    expect(mapResolutionForZoom(35)).toBeCloseTo(1000 / 850)
    expect(mapResolutionForZoom(9)).toBeCloseTo(2.92, 2)
    expect(mapResolutionForZoom(16)).toBeCloseTo(2.286, 2)
    for (const zoom of [0, 9, 16, 23, 35, 50]) expect(mapZoomForResolution(mapResolutionForZoom(zoom))).toBeCloseTo(zoom)
    for (const resolution of [4, 8, 64, 128]) {
      const zoom = mapZoomForResolution(resolution)
      expect(zoom).toBe(0)
      expect(isPointVisibleAtZoom(MAP_TIER_ZOOM_RANGES.always, zoom)).toBe(true)
      expect(isPointVisibleAtZoom(MAP_POINT_ZOOM_RANGES['region-name'], zoom)).toBe(true)
    }
    for (const invalid of [NaN, Infinity, -1]) expect(mapResolutionForZoom(invalid)).toBeNaN()
  })

  it('keeps text navigation anchors strictly XY and scopes them to the base map', () => {
    expect(regionLabelSchema.parse(label)).toEqual(label)
    expect(regionLabelSchema.safeParse({ ...label, coordinate: { ...label.coordinate, z: 0 } }).success).toBe(false)
    expect(regionLabelSchema.safeParse({ ...label, gameCoordinate: { x: 1, y: 2, z: 0 } }).success).toBe(false)
    expect(regionLabelSchema.safeParse({ ...label, level: 0 }).success).toBe(false)
    const country = { ...label, id: 'country', level: 1 }
    const otherCountry = { ...label, id: 'other-country', countryId: 2 }
    const otherState = { ...label, id: 'other-state', stateId: 900 }
    const labels = [country, label, otherCountry, otherState]
    expect(selectRegionLabels(labels, { stateId: 8, countryId: 1, levelId: null })).toEqual([country, label])
    expect(selectRegionLabels(labels, { stateId: 8, countryId: null, levelId: null })).toEqual([country, label, otherCountry])
    expect(selectRegionLabels(labels, { stateId: 8, countryId: null, levelId: '-1/3' })).toEqual([country, label, otherCountry])
    expect(selectRegionLabels(labels, { stateId: 8, countryId: 1, levelId: '-1/3' })).toEqual([country, label])
  })
})
