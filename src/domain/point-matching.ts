import type { AuthoredEchoPoint, AuthoredPoint, EchoMember, PointLibrary, PointSource } from './types.ts'

export function combinePointLibraries(manual: PointLibrary, official: PointLibrary, source: PointSource = 'all'): PointLibrary {
  if (source === 'manual') return manual
  if (source === 'official') return official
  const replaced = new Set(manual.points.flatMap((point) => point.replacesOfficialIds ?? []))
  const manualIds = new Set(manual.points.map(({ id }) => id))
  return { version: 1, points: [...manual.points, ...official.points.filter(({ id }) => !replaced.has(id) && !manualIds.has(id))] }
}

export function findNearbyPoints(points: readonly AuthoredPoint[], target: AuthoredPoint, radius = 30, heightTolerance = 8) {
  const { x, y, z } = target.coordinate
  if (x === null || y === null || z === null) return []
  return points.flatMap((point) => {
    const coordinate = point.coordinate
    if (point.id === target.id || point.kind !== target.kind || point.stateId !== target.stateId || point.levelId !== target.levelId || coordinate.x === null || coordinate.y === null) return []
    const distance = Math.hypot(coordinate.x - x, coordinate.y - y)
    const heightDifference = point.status === 'imported' || coordinate.z === null ? null : Math.abs(coordinate.z - z)
    if (distance > radius || (heightDifference !== null && heightDifference > heightTolerance)) return []
    return [{ point, distance, heightDifference }]
  }).sort((left, right) => Number(left.point.status === 'imported') - Number(right.point.status === 'imported') || left.distance - right.distance)
}

export function mergeEchoMembers(existing: readonly EchoMember[], incoming: readonly EchoMember[]): EchoMember[] {
  const counts = new Map(existing.map(({ echoId, count }) => [echoId, count]))
  for (const { echoId, count } of incoming) counts.set(echoId, Math.max(counts.get(echoId) ?? 0, count))
  return [...counts].map(([echoId, count]) => ({ echoId, count }))
}

export function appendObservation(target: AuthoredEchoPoint, incoming: AuthoredEchoPoint): AuthoredEchoPoint {
  const imported = target.status === 'imported'
  return {
    ...target,
    id: imported ? incoming.id : target.id,
    coordinate: imported ? { ...incoming.coordinate } : { ...target.coordinate },
    status: 'draft',
    compositionStatus: 'partial',
    members: mergeEchoMembers(target.members, incoming.members),
    ...(imported ? { replacesOfficialIds: [...new Set([...(target.replacesOfficialIds ?? []), target.id])] } : {}),
    note: [...new Set([target.note, incoming.note].filter(Boolean))].join('\n'),
  }
}
