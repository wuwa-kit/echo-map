import { asArray, asRecord, asString } from './raw.ts'
import type { UnknownRecord } from './raw.ts'

export function wikiEntryId(record: UnknownRecord): string {
  const content = asRecord(record.content, 'wiki record content')
  const config = content.linkConfig ? asRecord(content.linkConfig, 'wiki link config') : {}
  // Entry IDs exceed Number.MAX_SAFE_INTEGER; use the exact string in the link.
  const id = asString(config.entryId) || asString(content.linkId)
    || (asString(config.linkUrl) || asString(content.linkUrl)).match(/\/item\/(\d+)/u)?.[1]
  if (!id || !/^\d+$/u.test(id)) throw new Error(`Wiki 条目缺少精确链接 ID：${asString(record.name)}`)
  return id
}

export function parseSonataMembers(response: unknown): Map<string, 1 | 3> {
  const root = asRecord(response, 'wiki detail response')
  const data = asRecord(root.data, 'wiki detail data')
  const content = asRecord(data.content, 'wiki detail content')
  const module = asArray(content.modules, 'wiki modules').map((value) => asRecord(value, 'wiki module'))
    .find(({ title }) => title === '对应声骸')
  if (!module) throw new Error('Wiki 套装详情缺少“对应声骸”模块')
  const members = new Map<string, 1 | 3>()
  const components = asArray(module.components, 'wiki sonata components')
  let costSections = 0
  for (const value of components) {
    const component = asRecord(value, 'wiki sonata component')
    const cost = Number(asString(component.title).match(/COST\s*([134])/iu)?.[1])
    if (![1, 3, 4].includes(cost)) throw new Error(`未知 Wiki 声骸分组：${asString(component.title)}`)
    costSections += 1
    if (cost !== 1 && cost !== 3) continue
    const links = [...asString(component.content).matchAll(/href\s*=\s*["'](?:https:\/\/wiki\.kurobbs\.com)?\/mc\/item\/(\d+)(?:[?#][^"']*)?["']/gu)]
    if (links.length === 0) throw new Error(`Wiki COST ${cost} 分组缺少声骸链接`)
    for (const link of links) {
      const id = link[1]
      if (!id) continue
      if (members.has(id) && members.get(id) !== cost) throw new Error(`Wiki 声骸 COST 冲突：${id}`)
      members.set(id, cost)
    }
  }
  if (costSections === 0) throw new Error('Wiki 套装详情没有 COST 分组')
  return members
}
