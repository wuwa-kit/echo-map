import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { editorLibraryLocations, parsePointLibrary, libraryLocations, parseCoordinateInput } from '../src/domain/point-library.ts'
import { createRoutePlanInput } from '../src/route/plan-input.ts'
import { useExplorerStore } from '../src/stores/explorer.ts'
import { echoComposition } from '../src/map/echo-composition.ts'
import { createExplorerQueryValues, parseExplorerQueryValues } from '../src/url/explorer-url.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'
import type { AuthoredNavigationPoint, PointLibrary } from '../src/domain/types.ts'
import { convertOfficialPoints } from '../scripts/lib/official-point-library.ts'
import { navigationPointTypeIds, navigationPointTypes } from '../src/domain/navigation-point-types.ts'
import { navigationTypeIcons } from '../src/domain/navigation-icons.ts'

describe('authored point library', () => {
  it('keeps complete groups while selecting targets and creates one route stop', () => {
    setActivePinia(createPinia())
    const store = useExplorerStore()
    store.setDataset(referenceDataset)
    expect(store.allEchoLocations).toEqual([])
    expect(store.allNavigationPoints).toEqual([])
    store.setPointLibrary({ version: 1, points: [mixedPoint()] })
    store.toggleEcho(smallEcho.id)
    expect(store.visibleEchoLocations).toHaveLength(1)
    expect(store.matchingMonsterCount).toBe(3)
    const location = store.visibleEchoLocations[0]
    expect(location && 'members' in location ? location.members : []).toHaveLength(2)
    const input = createRoutePlanInput(referenceDataset, store.routeEligibleLocations, [], 8, store.activeEchoIds)
    expect(input.points).toHaveLength(1)
    expect(input.points[0]?.members).toEqual([{ echoId: smallEcho.id, count: 3, name: smallEcho.name }])
    expect(input.points[0]?.coordinate).toEqual({ x: -497, y: 449, z: 18 })
    store.toggleEcho(eliteEcho.id)
    expect(store.matchingMonsterCount).toBe(4)
    expect(store.visibleEchoLocations).toHaveLength(1)
    const officialLibrary = convertOfficialPoints(referenceDataset)
    const officialEchoPointCount = officialLibrary.points.filter(({ kind }) => kind === 'echo').length
    store.setOfficialPointLibrary(officialLibrary)
    expect(store.allEchoLocations).toHaveLength(officialEchoPointCount + 1)
    expect(store.allEchoLocations.some(({ id }) => id === 'mixed-point')).toBe(true)
    expect(store.allEchoLocations.filter(({ quality }) => quality === 'official-provisional')
      .every(({ gameCoordinate }) => gameCoordinate?.z === 0)).toBe(true)
    expect(store.routePlanEligibleLocations.some(({ quality }) => quality === 'official-provisional')).toBe(true)
    expect(store.routePlanEligibleLocations.some(({ id }) => id === 'mixed-point')).toBe(true)
  })

  it('keeps XY-overlapping floors and heights independent and permits saved travel starts', () => {
    const point = mixedPoint()
    const other = { ...mixedPoint('higher'), coordinate: { ...point.coordinate, z: 200 } }
    const teleportCoordinate = { x: 3, y: 4, z: 5 }
    const library: PointLibrary = { version: 1, points: [point, other, { gravityType: null, id: 'beacon', kind: 'navigation', stateId: 8, levelId: null, coordinate: { x: 0, y: 0, z: 0 }, teleportCoordinate, name: '测试信标', navigationKind: 'beacon', mode: 'fast-travel', note: '' }] }
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
    expect(createRoutePlanInput(referenceDataset, [], store.routeEligibleNavigationPoints, 8).startPoints[0]?.coordinate).toEqual({ ...teleportCoordinate, z: 0 })
    expect(store.routeEligibleNavigationPoints[0]?.teleportCoordinate).toEqual(teleportCoordinate)
    expect(store.visibleNavigationPoints).toHaveLength(1)
    expect(store.routeEligibleNavigationPoints).toHaveLength(1)
  })

  it('persists explicit icons without inheriting the source point position or teleport behavior', () => {
    const source = navigationTypeIcons('small-beacon')[0]
    if (!source) throw new Error('测试数据缺少信标图标')
    const point = {
      gravityType: null, id: 'custom-icon', kind: 'navigation' as const,
      stateId: 8, levelId: null, coordinate: { x: 15, y: 25, z: 35 },
      name: '独立名称', navigationKind: 'landmark' as const, mode: 'landmark' as const, note: '', iconId: source.id,
    }
    const library = parsePointLibrary({ version: 1, points: [point] }, referenceDataset, 'manual')
    const dataset = { ...referenceDataset, navigationPoints: [], navigationPointGroups: [] }
    const rendered = libraryLocations(library, dataset).navigationPoints[0]
    expect(rendered).toMatchObject({ id: 'custom-icon', typeName: '独立名称', iconUrl: source.url, mode: 'landmark', gameCoordinate: { x: 15, y: 25, z: 35 } })
    expect(rendered?.teleportCoordinate).toBeUndefined()
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, iconId: 'missing-icon' }] }, referenceDataset)).toThrow('未知图标')
  })

  it('requires complete teleport XYZ for saved fast-travel points and rejects it for other modes', () => {
    const navigation = {
      gravityType: null, id: 'beacon', kind: 'navigation' as const,
      stateId: 8, levelId: null, coordinate: { x: 0, y: 0, z: 0 },
      name: '小型信标', pointType: 'small-beacon' as const, navigationKind: 'beacon' as const, mode: 'fast-travel' as const, note: '', iconId: navigationPointTypes['small-beacon'].icons[0],
    }
    expect(() => parsePointLibrary({ version: 1, points: [{ ...navigation, teleportCoordinate: { x: 1, y: 2, z: null } }] }, referenceDataset)).toThrow('传送落点')
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

  it('renders incomplete form positions but rejects incomplete records before persistence', () => {
    const draft = { ...mixedPoint(), members: [], coordinate: { x: 1, y: 2, z: null } }
    expect(() => parsePointLibrary({ version: 1, points: [draft] }, referenceDataset)).toThrow('完整的整数 XYZ')
    expect(editorLibraryLocations([draft], referenceDataset, 'echo').echoLocations[0]?.gameCoordinate).toBeNull()
    expect(() => parsePointLibrary({ version: 1, points: [mixedPoint(), mixedPoint()] }, referenceDataset)).toThrow('重复点位 ID')
  })

  it('uses source IDs for provenance and prevents official records from entering the manual library', () => {
    const official = { ...mixedPoint('official:source'), officialIds: ['source'], coordinate: { x: 1, y: 2, z: 0 } }
    expect(parsePointLibrary({ version: 1, points: [official] }, referenceDataset, 'official').points).toEqual([official])
    expect(() => parsePointLibrary({ version: 1, points: [official] }, referenceDataset, 'manual')).toThrow('官方导入点应保存于官方文件')
    expect(() => parsePointLibrary({ version: 1, points: [mixedPoint()] }, referenceDataset, 'official')).toThrow('来源 ID')
    expect(() => parsePointLibrary({ version: 1, points: [{ ...official, coordinate: { x: 1, y: 2, z: 10 } }] }, referenceDataset, 'official')).toThrow('Z 固定为 0')
    expect(libraryLocations({ version: 1, points: [official, mixedPoint()] }, referenceDataset).echoLocations.map(({ quality }) => quality)).toEqual(['official-provisional', 'manual'])
  })

  it('temporarily hides all echo sources during navigation editing and restores them when switching back', () => {
    const official = convertOfficialPoints(referenceDataset)
    const officialEcho = official.points.find(({ kind }) => kind === 'echo')
    if (!officialEcho) throw new Error('需要官方声骸点位')
    const navigation: AuthoredNavigationPoint = {
      id: 'manual-navigation', kind: 'navigation', stateId: 8, levelId: null,
      gravityType: null, coordinate: { x: 1, y: 2, z: 3 }, note: '', name: '小型信标', pointType: 'small-beacon',
      navigationKind: 'beacon', mode: 'fast-travel',
    }
    const library: PointLibrary = {
      version: 1,
      points: [mixedPoint(), { ...mixedPoint('draft'), coordinate: { x: 1, y: 2, z: null } }, officialEcho, navigation],
    }
    const snapshot = JSON.stringify(library)
    const echoEditing = editorLibraryLocations(library.points, referenceDataset, 'echo')
    expect(echoEditing.echoLocations.map(({ id }) => id)).toEqual(['mixed-point', 'draft', officialEcho.id])
    for (let index = 0; index < 2; index += 1) {
      const navigationEditing = editorLibraryLocations(library.points, referenceDataset, 'navigation')
      expect(navigationEditing.echoLocations).toEqual([])
      expect(navigationEditing.navigationPoints).toEqual(echoEditing.navigationPoints)
      expect(editorLibraryLocations(library.points, referenceDataset, 'echo')).toEqual(echoEditing)
    }
    expect(libraryLocations(library, referenceDataset).echoLocations.map(({ id }) => id)).toEqual(['mixed-point', officialEcho.id])
    expect(JSON.stringify(library)).toBe(snapshot)
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

  it('ignores removed source parameters and does not serialize them', () => {
    const query = { map: '8', sources: 'official' }
    expect(parseExplorerQueryValues(query)).toEqual(parseExplorerQueryValues({ map: '8' }))
    expect(createExplorerQueryValues({ stateId: 8, countryId: null, levelId: null, echoIds: [], sonataFilterIds: [], echoCostFilters: [], showProvisional: true, hideNonTeleportPoints: false, controlPanelCollapsed: false, mobileSheet: null, viewport: null })).not.toHaveProperty('sources')
  })})

it('accepts an unset navigation type on saved points and validates rules when a type is selected', () => {
  const navigation = {
    gravityType: null, id: 'typed-navigation', kind: 'navigation',
    stateId: 8, levelId: null, coordinate: { x: 1, y: 2, z: 3 },
    name: '测试', navigationKind: 'landmark', mode: 'landmark', note: '', iconId: navigationPointTypes['small-beacon'].icons[0],
  }
  for (const pointType of navigationPointTypeIds) {
    const rule = navigationPointTypes[pointType]
    const point = { ...navigation, name: rule.names[0] ?? navigation.name, pointType, navigationKind: rule.kind, mode: rule.defaultMode, iconId: rule.icons[0] ?? navigation.iconId }
    expect(parsePointLibrary({ version: 1, points: [point] }, referenceDataset).points[0]).toHaveProperty('pointType', pointType)
    expect(() => parsePointLibrary({ version: 1, points: [{ ...point, navigationKind: 'unknown' }] }, referenceDataset)).toThrow()
    if (rule.teleportLocked) expect(() => parsePointLibrary({ version: 1, points: [{ ...point, mode: 'landmark' }] }, referenceDataset)).toThrow('可直接传送')
  }
  expect(parsePointLibrary({ version: 1, points: [navigation] }, referenceDataset).points[0]).toEqual(navigation)
  expect(() => parsePointLibrary({ version: 1, points: [{ ...navigation, mode: 'unknown' }] }, referenceDataset)).toThrow('传送能力')
  expect(() => parsePointLibrary({ version: 1, points: [{ ...navigation, pointType: 'invalid' }] }, referenceDataset)).toThrow()
})
