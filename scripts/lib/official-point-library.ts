import { readFile } from 'node:fs/promises'
import { parsePointLibrary, emptyPointLibrary } from '../../src/domain/point-library.ts'
import type { AuthoredEchoPoint, AuthoredPoint, MapDataset, PointLibrary } from '../../src/domain/types.ts'

export function convertOfficialPoints(dataset: MapDataset): PointLibrary {
  const points: AuthoredPoint[] = []
  const groups = new Map<string, AuthoredEchoPoint>()
  const makeBase = (point: MapDataset['echoLocations'][number] | MapDataset['navigationPoints'][number]) => {
    return {
      id: `official:${point.id}`,
      status: 'imported' as const,
      officialIds: [point.id],
      stateId: point.stateId,
      gravityType: point.gravityType,
      countryId: dataset.regionLabels.some((label) => label.stateId === point.stateId && label.level === 1 && label.countryId === point.countryId) ? point.countryId : null,
      levelId: point.levelId,
      coordinate: { x: Math.round(point.coordinate.rawX / 100), y: Math.round(point.coordinate.rawY / 100), z: 0 },
      note: '官方导入：Z=0 为占位值；声骸数量按每种 1 只初始化，待实测补全。',
    }
  }
  for (const location of [...dataset.echoLocations].sort((left, right) => left.id.localeCompare(right.id))) {
    const base = makeBase(location)
    // Only identical source positions are combined; nearby positions remain independent.
    const key = JSON.stringify([location.stateId, location.levelId, location.gravityType, location.coordinate.rawX, location.coordinate.rawY])
    const existing = groups.get(key)
    if (existing) {
      existing.officialIds?.push(location.id)
      if (!existing.members.some(({ echoId }) => echoId === location.echoId)) existing.members.push({ echoId: location.echoId, count: 1 })
    } else {
      const point: AuthoredEchoPoint = { ...base, kind: 'echo', compositionStatus: 'partial', members: [{ echoId: location.echoId, count: 1 }] }
      groups.set(key, point)
      points.push(point)
    }
  }
  for (const location of dataset.navigationPoints) {
    points.push({ ...makeBase(location), kind: 'navigation', name: location.typeName, navigationKind: location.kind, mode: location.mode, note: '官方导入：Z=0 为占位值，待实测。' })
  }
  return parsePointLibrary({ version: 1, points }, dataset, 'official')
}

export async function readOfficialPointLibrary(path: string, dataset: MapDataset): Promise<PointLibrary> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return emptyPointLibrary()
    throw error
  }
  return parsePointLibrary(JSON.parse(text), dataset, 'official')
}
