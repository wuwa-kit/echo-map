import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendObservation, combinePointLibraries, findNearbyPoints } from '../src/domain/point-matching.ts'
import { OFFICIAL_ECHO_MERGE_DIAMETER, convertOfficialPoints, readOfficialPointLibrary } from '../scripts/lib/official-point-library.ts'
import { parsePointLibrary, libraryLocations } from '../src/domain/point-library.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'

describe('official library and incremental observations', () => {
  it('converts source XY into integer XYZ with explicit placeholder Z and traceable source IDs', () => {
    const library = convertOfficialPoints(referenceDataset)
    expect(library.points.filter(({ kind }) => kind === 'echo').length).toBeLessThan(referenceDataset.echoLocations.length)
    expect(library.points.filter(({ kind }) => kind === 'navigation')).toHaveLength(referenceDataset.navigationPoints.length)
    expect(library.points.every(({ coordinate, status, officialIds }) => coordinate.z === 0 && Number.isSafeInteger(coordinate.x) && Number.isSafeInteger(coordinate.y) && status === 'imported' && officialIds?.length)).toBe(true)
    expect(library.points.filter((point) => point.kind === 'echo').flatMap(({ members }) => members).reduce((sum, { count }) => sum + count, 0)).toBe(referenceDataset.echoLocations.length)
    const source = referenceDataset.echoLocations[0]
    if (!source) throw new Error('Missing reference point')
    const point = library.points.find(({ officialIds }) => officialIds?.includes(source.id))
    const sourceById = new Map(referenceDataset.echoLocations.map((location) => [location.id, location]))
    const representativeCoordinates = new Set(point?.officialIds?.flatMap((id) => {
      const location = sourceById.get(id)
      return location ? [`${Math.round(location.coordinate.rawX / 100)}:${Math.round(location.coordinate.rawY / 100)}`] : []
    }))
    expect(representativeCoordinates.has(`${point?.coordinate.x}:${point?.coordinate.y}`)).toBe(true)
    const convertedIds = library.points.flatMap(({ officialIds }) => officialIds ?? [])
    expect(new Set(convertedIds).size).toBe(referenceDataset.echoLocations.length + referenceDataset.navigationPoints.length)
    expect(convertedIds).toHaveLength(referenceDataset.echoLocations.length + referenceDataset.navigationPoints.length)
    const convertedByOriginalId = new Map(library.points.flatMap((point) => (point.officialIds ?? []).map((id) => [id, point] as const)))
    for (const sourcePoint of [...referenceDataset.echoLocations, ...referenceDataset.navigationPoints]) {
      const converted = convertedByOriginalId.get(sourcePoint.id)
      expect(converted?.levelId).toBe(sourcePoint.levelId)
    }
    expect(libraryLocations(library, referenceDataset).echoLocations[0]?.quality).toBe('official-provisional')
    expect(() => parsePointLibrary(library, referenceDataset, 'manual')).toThrow('官方导入点')
  })

  it('treats a deleted official JSON as an empty library without falling back to raw map points', async () => {
    const library = await readOfficialPointLibrary(join(tmpdir(), `${randomUUID()}.json`), referenceDataset)
    expect(library.points).toEqual([])
    expect(combinePointLibraries({ version: 1, points: [mixedPoint()] }, library).points).toEqual([mixedPoint()])
  })

  it('merges diameter-bounded neighbors without chaining across map, floor or gravity scopes', () => {
    const source = referenceDataset.echoLocations[0]
    if (!source) throw new Error('Missing reference point')
    const library = convertOfficialPoints({ ...referenceDataset, navigationPoints: [], echoLocations: [
      { ...source, id: 'one', echoId: smallEcho.id },
      { ...source, id: 'two', echoId: eliteEcho.id, coordinate: { ...source.coordinate, rawX: source.coordinate.rawX + 300 } },
      { ...source, id: 'three', echoId: smallEcho.id, coordinate: { ...source.coordinate, rawX: source.coordinate.rawX + 700 } },
      { ...source, id: 'four', echoId: smallEcho.id, coordinate: { ...source.coordinate, rawX: source.coordinate.rawX + 1_200 } },
      { ...source, id: 'five', echoId: smallEcho.id, coordinate: { ...source.coordinate, rawX: source.coordinate.rawX + 1_600 } },
      { ...source, id: 'other-country', echoId: smallEcho.id, countryId: (source.countryId ?? 0) + 10_000 },
      { ...source, id: 'other-floor', echoId: smallEcho.id, levelId: 'other-floor' },
      { ...source, id: 'other-gravity', echoId: smallEcho.id, gravityType: null },
    ] })
    expect(library.points).toHaveLength(4)
    const cluster = library.points.find(({ officialIds }) => officialIds?.includes('one'))
    expect(cluster?.officialIds).toEqual(['four', 'one', 'other-country', 'three', 'two'])
    expect(cluster?.coordinate.x).toBe(Math.round(source.coordinate.rawX / 100) + 3)
    expect(cluster?.kind === 'echo' ? cluster.members : []).toEqual([
      { echoId: eliteEcho.id, count: 1 },
      { echoId: smallEcho.id, count: 4 },
    ].sort((left, right) => left.echoId.localeCompare(right.echoId)))
    expect(library.points.find(({ officialIds }) => officialIds?.includes('five'))?.officialIds).toEqual(['five'])
    expect(cluster?.note).toContain(`最大直径 ${OFFICIAL_ECHO_MERGE_DIAMETER}`)
  })

  it('uses nearby region labels to correct erroneous official echo countries before clustering', () => {
    const library = convertOfficialPoints(referenceDataset)
    const cluster = library.points.find(({ officialIds }) => officialIds?.includes('1467288883984715776'))
    expect(cluster?.countryId).toBe(4)
    expect(cluster?.officialIds).toEqual([
      '1467288883984715776',
      '1467288919757934592',
      '1468660812729860096',
      '1479537236550549504',
    ])
  })

  it('requires matching map, floor and XY radius, uses real height only for manual points', () => {
    const target = mixedPoint('observed')
    const points = [mixedPoint(), { ...mixedPoint('upstairs'), coordinate: { ...target.coordinate, z: 80 } }, { ...mixedPoint('other-map'), stateId: 999 }, { ...mixedPoint('other-floor'), levelId: 'underground' }, { ...mixedPoint('far'), coordinate: { ...target.coordinate, x: 1000 } }, { ...mixedPoint('official'), status: 'imported' as const, coordinate: { ...target.coordinate, z: 0 } }]
    expect(findNearbyPoints(points, target).map(({ point }) => point.id)).toEqual(['mixed-point', 'official'])
    expect(findNearbyPoints(points, { ...target, coordinate: { ...target.coordinate, z: null } })).toEqual([])
  })

  it('does not double-count repeated tracking visits or erase existing monsters and XYZ', () => {
    const target = mixedPoint()
    const incoming = { ...mixedPoint('visit'), members: [{ echoId: smallEcho.id, count: 1 }], coordinate: { x: 1, y: 2, z: 3 } }
    const once = appendObservation(target, incoming)
    const twice = appendObservation(once, incoming)
    expect(twice.members).toEqual(target.members)
    expect(twice.coordinate).toEqual(target.coordinate)
    expect(target.status).toBe('verified')
  })

  it('keeps independently usable manual overrides when official data is hidden or removed', () => {
    const imported = { ...mixedPoint('official'), status: 'imported' as const, officialIds: ['source-a', 'source-b'] }
    const authored = appendObservation(imported, mixedPoint('manual'))
    const manual = { version: 1 as const, points: [authored] }
    const official = { version: 1 as const, points: [imported] }
    const regroupedOfficial = { version: 1 as const, points: [
      { ...imported, id: 'official:changed', officialIds: ['new-source', 'source-a'] },
      { ...imported, id: 'official:source-b', officialIds: ['source-b'] },
    ] }
    const mergedIntoManual = appendObservation(mixedPoint('existing-manual'), {
      ...mixedPoint('official-draft'),
      replacesOfficialIds: ['source-a', 'source-b'],
    })
    expect(authored.replacesOfficialIds).toEqual(['source-a', 'source-b'])
    expect(mergedIntoManual.replacesOfficialIds).toEqual(['source-a', 'source-b'])
    expect(combinePointLibraries(manual, official).points).toEqual([authored])
    expect(combinePointLibraries(manual, regroupedOfficial).points).toEqual([authored])
    expect(combinePointLibraries(manual, official, 'manual').points).toEqual([authored])
    expect(combinePointLibraries(manual, official, 'official').points).toEqual([imported])
    expect(combinePointLibraries(manual, { version: 1, points: [] }).points).toEqual([authored])
  })
})
