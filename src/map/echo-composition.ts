import type { EchoDefinition } from '../domain/types.ts'

export interface CompositionMember {
  echoId: string
  count: number | null
}

export function echoComposition(members: readonly CompositionMember[], echoes: readonly EchoDefinition[], definitions: ReadonlyMap<string, EchoDefinition> = new Map(echoes.map((echo) => [echo.id, echo]))) {
  const counts = new Map<string, number | null>()
  for (const member of members) {
    const old = counts.get(member.echoId)
    counts.set(member.echoId, old === null || member.count === null ? null : (old ?? 0) + member.count)
  }
  const types = [...counts].flatMap(([echoId, count]) => {
    const echo = definitions.get(echoId)
    return echo ? [{ ...echo, count }] : []
  }).sort((left, right) => right.cost - left.cost || left.id.localeCompare(right.id))
  return {
    types,
    portraits: types.slice(0, types.length > 4 ? 3 : 4),
    overflow: types.length > 4 ? types.length - 3 : 0,
    total: types.some(({ count }) => count === null) ? null : types.reduce((sum, { count }) => sum + (count ?? 0), 0),
  }
}
