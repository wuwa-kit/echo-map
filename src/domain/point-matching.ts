import type { AuthoredEchoPoint, AuthoredPoint, EchoMember, PointLibrary } from './types.ts'
import { isOfficialPoint } from './point-library.ts'

export function isOfficialPointReplaced(point: Pick<AuthoredPoint, 'id' | 'officialIds'>, replaced: ReadonlySet<string>): boolean {
  return [point.id, ...(point.officialIds ?? [])].some((id) => replaced.has(id))
}

export function combinePointLibraries(manual: PointLibrary, official: PointLibrary): PointLibrary {
  const replaced = new Set(manual.points.flatMap((point) => point.replacesOfficialIds ?? []))
  const manualIds = new Set(manual.points.map(({ id }) => id))
  return { version: 1, points: [...manual.points, ...official.points.filter((point) => (
    !manualIds.has(point.id) && !isOfficialPointReplaced(point, replaced)
  ))] }
}

export function findNearbyPoints(points: readonly AuthoredPoint[], target: AuthoredPoint, radius = 30, heightTolerance = 8) {
  const { x, y, z } = target.coordinate
  if (x === null || y === null || z === null) return []
  return points.flatMap((point) => {
    const coordinate = point.coordinate
    if ((point.gravityType ?? null) !== (target.gravityType ?? null)) return []
    if (point.id === target.id || point.kind !== target.kind || point.stateId !== target.stateId || point.levelId !== target.levelId || coordinate.x === null || coordinate.y === null) return []
    const distance = Math.hypot(coordinate.x - x, coordinate.y - y)
    const heightDifference = isOfficialPoint(point) || coordinate.z === null ? null : Math.abs(coordinate.z - z)
    if (distance > radius || (heightDifference !== null && heightDifference > heightTolerance)) return []
    return [{ point, distance, heightDifference }]
  }).sort((left, right) => Number(isOfficialPoint(left.point)) - Number(isOfficialPoint(right.point)) || left.distance - right.distance)
}

export function findPointDuplicates(points: readonly AuthoredPoint[], target: AuthoredPoint) {
  const { x, y, z } = target.coordinate
  if (x === null || y === null) return []
  const excluded = new Set([target.id, ...(target.replacesOfficialIds ?? [])])
  return points.flatMap((point) => {
    if (isOfficialPointReplaced(point, excluded) || point.stateId !== target.stateId
      || (point.gravityType ?? null) !== (target.gravityType ?? null)
      || (point.levelId && target.levelId && point.levelId !== target.levelId)) return []
    const coordinate = point.coordinate
    if (coordinate.x === null || coordinate.y === null) return []
    const distance = Math.hypot(coordinate.x - x, coordinate.y - y)
    const heightDifference = isOfficialPoint(point) || isOfficialPoint(target) || z === null || coordinate.z === null
      ? null : Math.abs(coordinate.z - z)
    if (distance > 30 || (heightDifference !== null && heightDifference > 8)) return []
    const similar = point.kind === 'echo' && target.kind === 'echo'
      ? point.members.some(({ echoId }) => target.members.some((member) => member.echoId === echoId))
      : point.kind === 'navigation' && target.kind === 'navigation'
        && (point.pointType && target.pointType ? point.pointType === target.pointType
          : point.navigationKind === target.navigationKind)
    return [{ point, distance, heightDifference, suspicious: Boolean(similar), uncertain: heightDifference === null || point.levelId !== target.levelId }]
  }).sort((a, b) => Number(b.suspicious) - Number(a.suspicious) || a.distance - b.distance)
}

export function mergeEchoMembers(existing: readonly EchoMember[], incoming: readonly EchoMember[]): EchoMember[] {
  const counts = new Map(existing.map(({ echoId, count }) => [echoId, count]))
  for (const { echoId, count } of incoming) counts.set(echoId, Math.max(counts.get(echoId) ?? 0, count))
  return [...counts].map(([echoId, count]) => ({ echoId, count }))
}

export function appendObservation(target: AuthoredEchoPoint, incoming: AuthoredEchoPoint): AuthoredEchoPoint {
  if ((target.gravityType ?? null) !== (incoming.gravityType ?? null)) throw new Error('不同重力状态的点位不能合并')
  const imported = isOfficialPoint(target)
  const { officialIds: _officialIds, ...manualTarget } = target
  const replacementIds = [...new Set([
    ...(target.replacesOfficialIds ?? []),
    ...(incoming.replacesOfficialIds ?? []),
    ...(imported ? target.officialIds ?? [target.id] : []),
  ])]
  return {
    ...manualTarget,
    id: imported ? incoming.id : target.id,
    coordinate: imported ? { ...incoming.coordinate } : { ...target.coordinate },
    compositionStatus: 'partial',
    members: mergeEchoMembers(target.members, incoming.members),
    ...(replacementIds.length > 0 ? { replacesOfficialIds: replacementIds } : {}),
    note: [...new Set([target.note, incoming.note].filter(Boolean))].join('\n'),
  }
}
