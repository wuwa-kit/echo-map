import { describe, expect, it } from 'vitest'
import View from 'ol/View.js'
import { MAP_POINT_ZOOM_RANGES, isMapPointVisibleAtZoom, isPointVisibleAtZoom, mapPointZoomRange, mapZoomForResolution, mapZoomRangeLabel } from '../src/map/point-visibility.ts'
import { mapZoomRangeSchema, regionLabelSchema } from '../src/domain/schema.ts'
import { selectRegionLabels } from '../src/domain/explorer-selectors.ts'
import type { MapDisplayPoint, RegionLabel } from '../src/domain/types.ts'
import { referenceDataset } from './fixtures/point-library.ts'

const label: RegionLabel = {
  id: 'test-region', name: '测试地区', stateId: 8, countryId: 1, level: 2,
  coordinate: { rawX: 10, rawY: 20, mapX: 30, mapY: 40 },
}

describe('map point zoom visibility', () => {
  it('hands country names to regions at the same inclusive/exclusive boundary', () => {
    const country: MapDisplayPoint = { category: 'region-name', location: { ...label, level: 1 } }
    const region: MapDisplayPoint = { category: 'region-name', location: label }
    for (const zoom of [2 - 1e-8, 2, 2 + 1e-8]) {
      expect(isMapPointVisibleAtZoom(country, zoom)).toBe(false)
      expect(isMapPointVisibleAtZoom(region, zoom)).toBe(true)
    }
    expect(isMapPointVisibleAtZoom(country, 1.99)).toBe(true)
    expect(isMapPointVisibleAtZoom(region, 1.99)).toBe(false)
    expect(isMapPointVisibleAtZoom(region, 4.99)).toBe(true)
    expect(isMapPointVisibleAtZoom(region, 5)).toBe(false)
    const place: MapDisplayPoint = { category: 'region-name', location: { ...label, level: 3 } }
    expect(isMapPointVisibleAtZoom(place, 3.99)).toBe(false)
    expect(isMapPointVisibleAtZoom(place, 4)).toBe(true)
    expect(isMapPointVisibleAtZoom(place, 8)).toBe(true)
  })

  it('uses navigation kind for each point, independently of icon grouping or teleport mode', () => {
    const point = referenceDataset.navigationPoints[0]
    if (!point) throw new Error('需要定位点测试数据')
    const nexus: MapDisplayPoint = { category: 'navigation', location: { ...point, kind: 'nexus' } }
    const service: MapDisplayPoint = { category: 'navigation', location: { ...point, kind: 'service' } }
    expect(isMapPointVisibleAtZoom(nexus, 0)).toBe(true)
    expect(isMapPointVisibleAtZoom(service, 4.99)).toBe(false)
    expect(isMapPointVisibleAtZoom(service, 5)).toBe(true)
    expect(isMapPointVisibleAtZoom(nexus, 8)).toBe(true)
    expect(isMapPointVisibleAtZoom(service, 8)).toBe(true)
  })

  it('reveals all echo sources together without using game height as a display condition', () => {
    const point = referenceDataset.echoLocations[0]
    if (!point) throw new Error('需要声骸测试数据')
    for (const gameCoordinate of [null, { x: 1, y: 2, z: 0 }, { x: 1, y: 2, z: 300 }]) {
      const echo: MapDisplayPoint = { category: 'echo', location: { ...point, gameCoordinate } }
      expect(isMapPointVisibleAtZoom(echo, 3.99)).toBe(false)
      expect(isMapPointVisibleAtZoom(echo, 4)).toBe(true)
      expect(isMapPointVisibleAtZoom(echo, 8)).toBe(true)
    }
  })

  it('uses the same actual scale on small and large base maps, without changing URL zoom', () => {
    const views = [64, 8].map((maxResolution) => new View({ maxResolution, minResolution: 0.125, resolution: 4 }))
    expect(views[0]?.getZoom()).not.toBe(views[1]?.getZoom())
    for (const view of views) {
      const zoom = mapZoomForResolution(view.getResolution() ?? Number.NaN)
      expect(zoom).toBe(4)
      expect(isPointVisibleAtZoom(MAP_POINT_ZOOM_RANGES.echo, zoom)).toBe(true)
      expect(isPointVisibleAtZoom(MAP_POINT_ZOOM_RANGES.service, zoom)).toBe(false)
    }
  })

  it('rejects invalid zoom/resolution and validates every configured range', () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(isPointVisibleAtZoom(MAP_POINT_ZOOM_RANGES.nexus, value)).toBe(false)
    }
    for (const value of [0, -1, Number.NaN, Infinity]) expect(mapZoomForResolution(value)).toBeNaN()
    for (const range of Object.values(MAP_POINT_ZOOM_RANGES)) expect(mapZoomRangeSchema.safeParse(range).success).toBe(true)
    for (const range of [{ minZoom: 3, maxZoom: 3 }, { minZoom: 4, maxZoom: 2 }, { minZoom: -1, maxZoom: null }]) {
      expect(mapZoomRangeSchema.safeParse(range).success).toBe(false)
    }
    expect(mapZoomRangeLabel(mapPointZoomRange({ category: 'region-name', location: label }))).toBe('区域至细节前显示')
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
    expect(selectRegionLabels(labels, { stateId: 8, countryId: null, levelId: '-1/3' })).toEqual([])
  })
})
