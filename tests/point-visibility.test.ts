import { describe, expect, it } from 'vitest'
import { MAP_POINT_DISPLAY_POLICIES, isMapPointVisibleAtScale, isPointVisibleAtScale } from '../src/map/point-visibility.ts'
import { MAP_DISPLAY_TIERS } from '../src/domain/map-display-tier.ts'
import { mapDisplayPolicySchema, regionLabelSchema } from '../src/domain/schema.ts'
import { selectRegionLabels } from '../src/domain/explorer-selectors.ts'
import type { MapDisplayPoint, RegionLabel } from '../src/domain/types.ts'
import { navigationPoint, navigationTestDataset as referenceDataset } from './fixtures/navigation-points.ts'
import { smallEcho, eliteEcho } from './fixtures/point-library.ts'
import { gameScaleForResolution, mapResolutionForScale, mapResolutionForZoom, mapZoomForResolution } from '../src/map/map-scale.ts'

const label: RegionLabel = {
  id: 'test-region', name: '测试地区', stateId: 8, countryId: 1, level: 2,
  coordinate: { rawX: 10, rawY: 20, mapX: 30, mapY: 40 },
}

describe('map point scale visibility', () => {
  it('hands district names to places at 2.5 units/px without overlap', () => {
    for (const scale of [100, 4, 2.50001, 2.5, 2.49999, 2, 0.1]) {
      for (const level of [1, 2, 3]) {
        expect(isMapPointVisibleAtScale({ category: 'region-name', location: { ...label, level } }, scale))
          .toBe(level === (scale > 2.5 ? 2 : 3))
      }
    }
    for (const scale of [2.5 - 1e-12, 2.5, 2.5 + 1e-12]) {
      expect(isPointVisibleAtScale(MAP_POINT_DISPLAY_POLICIES['region-name'], scale)).toBe(false)
      expect(isPointVisibleAtScale(MAP_POINT_DISPLAY_POLICIES['place-name'], scale)).toBe(true)
    }
  })

  it.each(['service', 'normal-boss', 'hologram', 'entrance', 'tacet-field'] as const)('uses actual teleport mode for %s independently of its icon', (type) => {
    for (const mode of ['fast-travel', 'landmark', 'entrance', 'local-transit', 'unknown'] as const) {
      const point: MapDisplayPoint = { category: 'navigation', location: { ...navigationPoint(type), mode } }
      for (const scale of [64, 4.00001, 4, 3, 2.00001, 2, 1, 0.1]) {
        expect(isMapPointVisibleAtScale(point, scale)).toBe(scale <= (mode === 'fast-travel' ? 4 : 2))
      }
    }
  })

  it('keeps central beacons resident independently of scale and mode', () => {
    const point: MapDisplayPoint = { category: 'navigation', location: { ...navigationPoint('central-beacon'), mode: 'landmark' } }
    for (const scale of [10000, 4, 2, 0.001]) expect(isMapPointVisibleAtScale(point, scale)).toBe(true)
  })

  it.each(['fast-travel', 'landmark', 'unknown'] as const)('uses actual mode %s when the type is unset', (mode) => {
    const location = { ...navigationPoint('central-beacon'), mode }
    delete location.pointType
    for (const scale of [64, 4.01, 4, 2.01, 2, 0.1]) {
      expect(isMapPointVisibleAtScale({ category: 'navigation', location }, scale)).toBe(scale <= (mode === 'fast-travel' ? 4 : 2))
    }
  })

  it('shares the teleport scale for every echo composition and coordinate source', () => {
    expect(MAP_POINT_DISPLAY_POLICIES.echo).toBe(MAP_DISPLAY_TIERS.teleport.policy)
    const point = referenceDataset.echoLocations[0]
    if (!point) throw new Error('需要声骸点位')
    const navigation: MapDisplayPoint = { category: 'navigation', location: navigationPoint() }
    for (const members of [[{ echoId: smallEcho.id, count: 1 }], [{ echoId: eliteEcho.id, count: 2 }], [{ echoId: smallEcho.id, count: 3 }, { echoId: eliteEcho.id, count: 1 }]]) {
      for (const gameCoordinate of [null, { x: 1, y: 2, z: 300 }]) {
        const echo: MapDisplayPoint = { category: 'echo', location: { ...point, members, gameCoordinate } }
        for (const scale of [100, 4.01, 4, 3, 2, 0.1]) {
          expect(isMapPointVisibleAtScale(echo, scale)).toBe(scale <= 4)
          expect(isMapPointVisibleAtScale(echo, scale)).toBe(isMapPointVisibleAtScale(navigation, scale))
        }
      }
    }
  })

  it('validates explicit policies without numeric sentinel values', () => {
    for (const policy of [...Object.values(MAP_POINT_DISPLAY_POLICIES), ...Object.values(MAP_DISPLAY_TIERS).map(({ policy }) => policy)]) {
      expect(mapDisplayPolicySchema.safeParse(policy).success).toBe(true)
      for (const scale of [NaN, Infinity, -Infinity, 0, -1]) expect(isPointVisibleAtScale(policy, scale)).toBe(false)
    }
    for (const policy of [{ kind: 'detail', maxGameUnitsPerPixel: 0 }, { kind: 'overview', minGameUnitsPerPixel: -1 }, { kind: 'always', minZoom: 0 }, { minZoom: 0, maxZoom: null }]) {
      expect(mapDisplayPolicySchema.safeParse(policy).success).toBe(false)
    }
    expect(isPointVisibleAtScale(null, 1)).toBe(false)
  })

  it('uses a fixed scale for negative and fractional zoom with no zero clamp', () => {
    for (const zoom of [-10, -2, -1.5, -1, 0, 1, 3]) {
      const resolution = mapResolutionForZoom(zoom)
      expect(gameScaleForResolution(resolution)).toBeCloseTo(2 ** -zoom)
      expect(mapZoomForResolution(resolution)).toBeCloseTo(zoom)
      expect(mapResolutionForScale(2 ** -zoom)).toBeCloseTo(resolution)
    }
    expect(gameScaleForResolution(mapResolutionForZoom(0))).toBe(1)
    for (const scale of [0, -1, NaN, Infinity]) {
      expect(mapResolutionForScale(scale)).toBeNaN()
      expect(gameScaleForResolution(scale)).toBeNaN()
    }
    for (const zoom of [NaN, Infinity, -Infinity, 10000, -10000]) expect(mapResolutionForZoom(zoom)).toBeNaN()
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
