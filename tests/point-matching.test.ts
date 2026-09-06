import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendObservation, combinePointLibraries, findNearbyPoints } from '../src/domain/point-matching.ts'
import { convertOfficialPoints, readOfficialPointLibrary } from '../scripts/lib/official-point-library.ts'
import { parsePointLibrary, libraryLocations } from '../src/domain/point-library.ts'
import { referenceDataset, mixedPoint, smallEcho, eliteEcho } from './fixtures/point-library.ts'

describe('official library and incremental observations', () => {
  it('converts source XY into integer XYZ with explicit placeholder Z and traceable source IDs', () => {
    const library = convertOfficialPoints(referenceDataset)
    expect(library.points.length).toBeGreaterThan(7000)
    expect(library.points.every(({ coordinate, status, officialIds }) => coordinate.z === 0 && Number.isSafeInteger(coordinate.x) && Number.isSafeInteger(coordinate.y) && status === 'imported' && officialIds?.length)).toBe(true)
    const source = referenceDataset.echoLocations[0]
    if (!source) throw new Error('Missing reference point')
    const point = library.points.find(({ officialIds }) => officialIds?.includes(source.id))
    expect(point?.coordinate.x).toBe(Math.round(source.coordinate.rawX / 100))
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

  it('combines only exactly coincident official positions, not nearby or vertically separated scopes', () => {
    const source = referenceDataset.echoLocations[0]
    if (!source) throw new Error('Missing reference point')
    const library = convertOfficialPoints({ ...referenceDataset, navigationPoints: [], echoLocations: [
      { ...source, id: 'one', echoId: smallEcho.id },
      { ...source, id: 'two', echoId: eliteEcho.id },
      { ...source, id: 'three', coordinate: { ...source.coordinate, rawX: source.coordinate.rawX + 1 } },
    ] })
    expect(library.points).toHaveLength(2)
    expect(library.points[0]?.kind === 'echo' ? library.points[0].members : []).toHaveLength(2)
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
    const imported = { ...mixedPoint('official'), status: 'imported' as const }
    const authored = appendObservation(imported, mixedPoint('manual'))
    const manual = { version: 1 as const, points: [authored] }
    const official = { version: 1 as const, points: [imported] }
    expect(combinePointLibraries(manual, official).points).toEqual([authored])
    expect(combinePointLibraries(manual, official, 'manual').points).toEqual([authored])
    expect(combinePointLibraries(manual, official, 'official').points).toEqual([imported])
    expect(combinePointLibraries(manual, { version: 1, points: [] }).points).toEqual([authored])
  })
})
