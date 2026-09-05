import type { NavigationPointGroup } from '../../../src/domain/types.ts'
import type { NavigationGroupConfig, NavigationGroupingResult, NavigationPointDraft } from './types.ts'

export function groupNavigationPoints(
  drafts: NavigationPointDraft[],
  config: NavigationGroupConfig,
  hashByUrl: ReadonlyMap<string, string | null>,
): NavigationGroupingResult {
  const groupDrafts = new Map<string, {
    hash: string | null
    points: NavigationPointDraft[]
  }>()
  const fullHashByShortId = new Map<string, string>()

  for (const point of drafts) {
    const isBoss = point.kind === 'boss'
    const hash = isBoss ? null : hashByUrl.get(point.iconUrl) ?? null
    const groupId = isBoss ? 'kind:boss' : hash ? `icon:${hash.slice(0, 16)}` : `type:${point.typeId}`
    if (hash) {
      const previousHash = fullHashByShortId.get(groupId)
      if (previousHash && previousHash !== hash) {
        throw new Error(`定位点图标分组 ID 冲突：${groupId}`)
      }
      fullHashByShortId.set(groupId, hash)
    }
    const group = groupDrafts.get(groupId)
    if (group) {
      group.points.push(point)
    } else {
      groupDrafts.set(groupId, { hash, points: [point] })
    }
  }

  const groupIdByPointId = new Map<string, string>()
  const groups = [...groupDrafts.entries()].map(([id, group]): NavigationPointGroup => {
    const sortedPoints = [...group.points].sort((left, right) => (
      left.typeName.localeCompare(right.typeName, 'zh-CN') || left.typeId.localeCompare(right.typeId)
    ))
    const firstPoint = sortedPoints[0]
    if (!firstPoint) {
      throw new Error(`定位点图标分组为空：${id}`)
    }
    const typeIds = [...new Set(sortedPoints.map(({ typeId }) => typeId))]
    const typeNames = [...new Set(sortedPoints.map(({ typeName }) => typeName))]
    const firstTypeName = typeNames[0] ?? firstPoint.typeName
    const modes = [...new Set(sortedPoints.map(({ mode }) => mode))]
    const kinds = [...new Set(sortedPoints.map(({ kind }) => kind))]
    for (const point of group.points) {
      groupIdByPointId.set(point.id, id)
    }
    return {
      id,
      name: (id === 'kind:boss' ? 'BOSS' : undefined)
        ?? (group.hash ? config.namesByHash[group.hash] : undefined)
        ?? (typeNames.length === 1 ? firstTypeName : `${firstTypeName}等 ${typeNames.length} 类`),
      iconUrl: firstPoint.iconUrl,
      iconHash: group.hash,
      typeIds,
      typeNames,
      modes,
      kinds,
    }
  }).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id))

  return {
    points: drafts.map((point) => ({
      ...point,
      groupId: groupIdByPointId.get(point.id) ?? `type:${point.typeId}`,
    })),
    groups,
    iconFetchFailureCount: [...hashByUrl.values()].filter((hash) => hash === null).length,
  }
}
