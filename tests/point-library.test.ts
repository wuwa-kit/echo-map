import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { parsePointLibrary, libraryLocations, parseCoordinateInput } from '../src/domain/point-library.ts'
import { createRoutePlanInput } from '../src/route/plan-input.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { echoComposition } from '../src/map/echo-composition.ts'
import { createExplorerQueryValues, parseExplorerQueryValues } from '../src/url/explorer-url.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'
import type { PointLibrary } from '../src/domain/types.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'

describe('authored point library', () => {
  it('keeps complete groups while selecting targets and creates one route stop', () => {
    setActivePinia(createPinia())
    const store = useExplorerStore()
    store.setDataset(referenceDataset)
    expect(store.allEchoLocations).toEqual([])
    expect(store.allNavigationPoints).toEqual([])
    store.setPointLibrary({ version: 1, points: [mixedPoint(), { ...mixedPoint('draft'), status: 'draft' }] })
    store.toggleEcho(smallEcho.id)
    expect(store.visibleEchoLocations).toHaveLength(1)
    expect(store.matchingMonsterCount).toBe(3)
    const location = store.visibleEchoLocations[0]
    expect(location && 'members' in location ? location.members : []).toHaveLength(2)
    const input = createRoutePlanInput(referenceDataset, store.routeEligibleLocations, [], 8, 1, store.activeEchoIds)
    expect(input.points).toHaveLength(1)
    expect(input.points[0]?.members).toEqual([{ echoId: smallEcho.id, count: 3, name: smallEcho.name }])
    expect(input.points[0]?.coordinate).toEqual({ x: -497, y: 449, z: 18 })
    store.toggleEcho(eliteEcho.id)
    expect(store.matchingMonsterCount).toBe(4)
    expect(store.visibleEchoLocations).toHaveLength(1)
    store.setOfficialPointLibrary(convertOfficialPoints(referenceDataset))
    store.setPointSourceFilters(['official'])
    expect(store.allEchoLocations.length).toBeGreaterThan(6000)
    expect(store.allEchoLocations.every(({ gameCoordinate }) => gameCoordinate?.z === 0)).toBe(true)
    expect(store.allEchoLocations.some(({ id }) => id === 'mixed-point')).toBe(false)
    store.setPointSourceFilters(['manual'])
    expect(store.allEchoLocations).toHaveLength(1)
    store.setPointSourceFilters(['manual', 'official'])
    expect(store.allEchoLocations.length).toBeGreaterThan(6000)
    expect(store.allEchoLocations.some(({ id }) => id === 'mixed-point')).toBe(true)
  })

  it('keeps XY-overlapping floors and heights independent and only permits verified travel starts', () => {
    const point = mixedPoint()
    const other = { ...mixedPoint('higher'), coordinate: { ...point.coordinate, z: 200 } }
    const teleportCoordinate = { x: 3, y: 4, z: 5 }
    const library: PointLibrary = { version: 1, points: [point, other, { gravityType: null, id: 'beacon', kind: 'navigation', status: 'verified', stateId: 8, countryId: null, levelId: null, coordinate: { x: 0, y: 0, z: 0 }, teleportCoordinate, name: '测试信标', navigationKind: 'beacon', mode: 'fast-travel', note: '' }] }
    const locations = libraryLocations(library, referenceDataset)
    expect(locations.echoLocations).toHaveLength(2)
    expect(locations.echoLocations.map(({ gameCoordinate }) => gameCoordinate?.z)).toEqual([18, 200])
    expect(locations.navigationPoints[0]?.mode).toBe('fast-travel')
    expect(locations.navigationPoints[0]?.teleportCoordinate).toEqual(teleportCoordinate)
    expect(locations.navigationPointGroups[0]?.id).toBe('manual:beacon')
    setActivePinia(createPinia())
    const store = useExplorerStore()
    store.setDataset(referenceDataset)
    store.setPointLibrary(library)
    expect(store.routeEligibleNavigationPoints).toHaveLength(1)
    expect(createRoutePlanInput(referenceDataset, [], store.routeEligibleNavigationPoints, 8, 1).startPoints[0]?.coordinate).toEqual(teleportCoordinate)
    store.setPointGroupVisible('manual:beacon', false)
    expect(store.visibleNavigationPoints).toHaveLength(0)
    expect(store.routeEligibleNavigationPoints).toHaveLength(1)
  })

  it('requires complete teleport XYZ for verified fast-travel points and rejects it for other modes', () => {
    const navigation = {
      gravityType: null, id: 'beacon', kind: 'navigation' as const, status: 'verified' as const,
      stateId: 8, countryId: null, levelId: null, coordinate: { x: 0, y: 0, z: 0 },
      name: '测试信标', navigationKind: 'beacon' as const, mode: 'fast-travel' as const, note: '',
    }
    expect(() => parsePointLibrary({ version: 1, points: [{ ...navigation, teleportCoordinate: { x: 1, y: 2, z: null } }] }, referenceDataset)).toThrow('核验传送落点')
    expect(() => parsePointLibrary({ version: 1, points: [{ ...navigation, mode: 'landmark', teleportCoordinate: { x: 1, y: 2, z: 3 } }] }, referenceDataset)).toThrow('只有可直接传送')
    expect(parsePointLibrary({ version: 1, points: [navigation] }, referenceDataset).points[0]).not.toHaveProperty('teleportCoordinate')
  })

  it.each([
    ['missing Z', () => ({ ...mixedPoint(), coordinate: { x: 1, y: 2, z: null } })],
    ['decimal coordinate', () => ({ ...mixedPoint(), coordinate: { x: 1.5, y: 2, z: 3 } })],
    ['empty composition', () => ({ ...mixedPoint(), members: [] })],
    ['unknown monster', () => ({ ...mixedPoint(), members: [{ echoId: 'outside-whitelist', count: 1 }] })],
    ['duplicate member', () => ({ ...mixedPoint(), members: [{ echoId: smallEcho.id, count: 1 }, { echoId: smallEcho.id, count: 2 }] })],
    ['negative quantity', () => ({ ...mixedPoint(), members: [{ echoId: smallEcho.id, count: -1 }] })],
    ['unknown floor', () => ({ ...mixedPoint(), levelId: 'unknown-floor' })],
    ['unknown map', () => ({ ...mixedPoint(), stateId: -100 })],
  ])('rejects %s before persistence', (_, point) => {
    expect(() => parsePointLibrary({ version: 1, points: [point()] }, referenceDataset)).toThrow()
  })

  it('accepts incomplete drafts but never publishes them, and rejects duplicate point IDs', () => {
    const library = parsePointLibrary({ version: 1, points: [{ ...mixedPoint(), status: 'draft', members: [], coordinate: { x: null, y: null, z: null } }] }, referenceDataset)
    expect(libraryLocations(library, referenceDataset).echoLocations).toEqual([])
    expect(() => parsePointLibrary({ version: 1, points: [mixedPoint(), mixedPoint()] }, referenceDataset)).toThrow('重复点位 ID')
  })

  it.each(['-497, 449, 18', '-497 449 18', 'X: -497 Y: 449 Z: 18', '-497，449，18', 'z=18, x=-497, y=449', 'Y：449；Z：18；X：-497'])('parses pasted integer XYZ: %s', (text) => {
    expect(parseCoordinateInput(text)).toEqual({ x: -497, y: 449, z: 18 })
  })
  it.each(['1 2', '1 2 3 4', '1.5 2 3', '1 2 Infinity', '1foo 2 3', '1 2 9007199254740992', 'X:1 X:2 Z:3', 'X:1 2 3', 'X:1.5 Y:2 Z:3'])('rejects ambiguous coordinate text: %s', (text) => {
    expect(() => parseCoordinateInput(text)).toThrow()
  })

  it('composes unique types, preserves counts and puts C3 first', () => {
    const composition = echoComposition([{ echoId: smallEcho.id, count: 2 }, { echoId: smallEcho.id, count: 1 }, { echoId: eliteEcho.id, count: 1 }], referenceDataset.echoes)
    expect(composition.portraits.map(({ id }) => id)).toEqual([eliteEcho.id, smallEcho.id])
    expect(composition.total).toBe(4)
    const large = echoComposition(referenceDataset.echoes.slice(0, 7).map(({ id }) => ({ echoId: id, count: 1 })), referenceDataset.echoes)
    expect(large.portraits).toHaveLength(3)
    expect(large.overflow).toBe(4)
    expect(echoComposition([{ echoId: smallEcho.id, count: null }], referenceDataset.echoes).total).toBeNull()
  })

  it('round-trips independent point source filters and ignores unknown values', () => {
    expect(parseExplorerQueryValues({ sources: 'official' }).pointSourceFilters).toEqual(['official'])
    expect(parseExplorerQueryValues({ sources: 'manual' }).pointSourceFilters).toEqual(['manual'])
    expect(parseExplorerQueryValues({ sources: 'official,manual' }).pointSourceFilters).toEqual(['manual', 'official'])
    expect(parseExplorerQueryValues({ sources: 'unknown' }).pointSourceFilters).toBeUndefined()
    expect(createExplorerQueryValues({ stateId: 8, countryId: null, levelId: null, pointSourceFilters: [], echoIds: [], sonataFilterIds: [], echoCostFilters: [], hiddenPointGroupIds: [], showProvisional: true, controlPanelCollapsed: false, mobileSheet: null, routeZWeight: 1.35, viewport: null }).sources).toBeUndefined()
  })
})
