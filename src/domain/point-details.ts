import type { EchoDefinition, EchoMapLocation } from './types.ts'
import { echoMembers } from './point-library.ts'

export function describeEchoPoint(location: EchoMapLocation, echoes: readonly EchoDefinition[]) {
  const official = location.quality === 'official-provisional'
  const complete = !official && 'members' in location && location.compositionStatus === 'complete'
  const members = echoMembers(location).map((member) => {
    const echo = echoes.find(({ id }) => id === member.echoId)
    return {
      echoId: member.echoId,
      name: echo?.name ?? member.echoId,
      iconUrl: echo?.iconUrl ?? '',
      count: official ? null : member.count,
    }
  })
  const total = members.some(({ count }) => count === null)
    ? null
    : members.reduce((sum, { count }) => sum + (count ?? 0), 0)
  const quantity = total === null ? '数量待核验' : `${total}只`
  return {
    members,
    title: members.map(({ name }) => name).join(' · '),
    summary: `${official ? '' : complete ? '共 ' : '已录入 '}${members.length}种 · ${quantity}`,
    compositionLabel: official ? null : complete ? '怪物清单已补齐' : '可继续补录',
  }
}
