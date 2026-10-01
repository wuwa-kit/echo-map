import { kuroHeaders, postFormJson } from './lib/http.ts'
import { isMainModule, projectPath, writeJson } from './lib/files.ts'
import { asArray, asNumber, asRecord, asString, nested } from './lib/raw.ts'
import type { UnknownRecord } from './lib/raw.ts'
import type { WikiSnapshot } from './lib/wiki.ts'
import { withSonataEchoIds } from './lib/wiki.ts'
import { parseSonataMembers, wikiEntryId } from './lib/wiki-membership.ts'
import { wikiCatalogueSchema } from '../src/domain/schema.ts'
import type { EchoDefinition, NonEmptyArray, SonataEffect } from '../src/domain/types.ts'

const WIKI_PAGE_API = 'https://api.kurobbs.com/wiki/core/catalogue/item/getPage'
const ECHO_CATALOGUE_ID = '1107'
const SONATA_CATALOGUE_ID = '1219'

interface WikiTag {
  id: string
  name: string
  children: WikiTag[]
}

function parseTag(value: unknown): WikiTag {
  const record = asRecord(value, 'tag')
  return {
    id: asString(record.id),
    name: asString(record.name).trim(),
    children: Array.isArray(record.children) ? record.children.map(parseTag) : [],
  }
}

function parseRecords(response: unknown): { records: UnknownRecord[]; tags: WikiTag[] } {
  const root = asRecord(response, 'wiki response')
  const data = asRecord(root.data, 'wiki response.data')
  const records = asArray(nested(data, 'results', 'records'), 'wiki records').map((value) => asRecord(value, 'wiki record'))
  const rawTags = Array.isArray(data.tagTree) ? data.tagTree : [data.tagTree]
  const tags = rawTags.map(parseTag)
  return { records, tags }
}

async function fetchCatalogue(catalogueId: string): Promise<unknown> {
  return postFormJson(WIKI_PAGE_API, kuroHeaders(9), {
    catalogueId,
    page: '1',
    limit: '500',
  })
}

function contentOf(record: UnknownRecord): UnknownRecord {
  return asRecord(record.content, 'wiki record.content')
}

function tagIdsOf(record: UnknownRecord): string[] {
  const value = contentOf(record).relateTagIds
  if (Array.isArray(value)) {
    return value.map((tagId) => asString(tagId)).filter(Boolean)
  }

  return asString(value).split(/[\s,]+/u).filter(Boolean)
}

function findTag(tags: WikiTag[], name: string): WikiTag | undefined {
  for (const tag of tags) {
    if (tag.name === name) {
      return tag
    }

    const nestedTag = findTag(tag.children, name)
    if (nestedTag) {
      return nestedTag
    }
  }

  return undefined
}

function contentIcon(record: UnknownRecord): string {
  return asString(contentOf(record).contentUrl)
}

function normalizeSonatas(records: UnknownRecord[]): Omit<SonataEffect, 'c1EchoIds' | 'c3EchoIds'>[] {
  return records.map((record) => ({
    id: `wiki-sonata-${asString(record.id)}`,
    name: asString(record.name).trim(),
    iconUrl: contentIcon(record),
    sourceId: asNumber(record.id),
  })).filter(({ name }) => name.length > 0)
}

export async function syncWiki(): Promise<WikiSnapshot> {
  console.log('正在抓取声骸与合鸣效果目录…')
  const [echoResponse, sonataResponse] = await Promise.all([
    fetchCatalogue(ECHO_CATALOGUE_ID),
    fetchCatalogue(SONATA_CATALOGUE_ID),
  ])
  const echoCatalogue = parseRecords(echoResponse)
  const sonataCatalogue = parseRecords(sonataResponse)
  const costTag = findTag(echoCatalogue.tags, 'COST')
  if (!costTag || costTag.children.length === 0) {
    throw new Error('声骸目录缺少“COST”标签组，拒绝生成可能污染的数据')
  }

  const sonatas = normalizeSonatas(sonataCatalogue.records)
  const memberships = new Map<string, { cost: 1 | 3; sonataIds: string[] }>()
  const knownEntries = new Map(echoCatalogue.records.map((record) => [wikiEntryId(record), wikiEntryId(record)]))
  console.log('正在读取 Wiki 套装详情的对应声骸…')
  for (let index = 0; index < sonataCatalogue.records.length; index += 5) {
    const entries = await Promise.all(sonataCatalogue.records.slice(index, index + 5).map(async (record) => {
      const response = await postFormJson('https://api.kurobbs.com/wiki/core/catalogue/item/getEntryDetail', kuroHeaders(9), { id: wikiEntryId(record) })
      return { sonataId: `wiki-sonata-${asString(record.id)}`, members: parseSonataMembers(response) }
    }))
    for (const { sonataId, members } of entries) {
      for (const [linkedId, cost] of members) {
        let entryId = knownEntries.get(linkedId)
        if (!entryId) {
          // Some set pages link the enemy article rather than the echo article.
          const detail = await postFormJson<unknown>('https://api.kurobbs.com/wiki/core/catalogue/item/getEntryDetail', kuroHeaders(9), { id: linkedId })
          const name = asString(nested(asRecord(detail, 'wiki linked detail'), 'data', 'content', 'title')).replace(/（(?:敌人|声骸)）$/u, '').trim()
          const matches = echoCatalogue.records.filter((record) => asString(record.name).trim() === name)
          const match = matches.length === 1 ? matches[0] : undefined
          if (!match) throw new Error(`Wiki 套装 ${sonataId} 引用了目录外声骸：${linkedId} ${name}`)
          entryId = wikiEntryId(match)
          knownEntries.set(linkedId, entryId)
        }
        const membership = memberships.get(entryId)
        if (membership && membership.cost !== cost) throw new Error(`Wiki 套装间 COST 冲突：${entryId}`)
        if (membership && !membership.sonataIds.includes(sonataId)) membership.sonataIds.push(sonataId)
        else if (membership) continue
        else memberships.set(entryId, { cost, sonataIds: [sonataId] })
      }
    }
  }
  const costByTagId = new Map(costTag.children.map((tag) => [tag.id, Number(tag.name.match(/\d+/u)?.[0])]))
  const excludedEchoNames: string[] = []
  const echoes: EchoDefinition[] = []

  for (const record of echoCatalogue.records) {
    const name = asString(record.name).trim()
    const relateTagIds = tagIdsOf(record)
    const membership = memberships.get(wikiEntryId(record))
    const sonataIds = membership?.sonataIds ?? []

    if (sonataIds.length === 0) {
      excludedEchoNames.push(name)
      continue
    }

    const rawCost = relateTagIds.map((tagId) => costByTagId.get(tagId)).find((value) => value !== undefined)
    if (rawCost !== membership?.cost) throw new Error(`Wiki 目录与套装详情 COST 不一致：${name}`)
    if (rawCost !== 1 && rawCost !== 3) {
      excludedEchoNames.push(name)
      continue
    }
    echoes.push({
      id: `wiki-echo-${asString(record.id)}`,
      name,
      iconUrl: contentIcon(record),
      sonataIds: sonataIds as NonEmptyArray<string>,
      cost: rawCost,
      sourceId: asNumber(record.id),
    })
  }

  const snapshot: WikiSnapshot = {
    fetchedAt: new Date().toISOString(),
    totalEchoCount: echoCatalogue.records.length,
    excludedEchoNames: excludedEchoNames.sort((left, right) => left.localeCompare(right, 'zh-CN')),
    sonatas: withSonataEchoIds(sonatas, echoes),
    echoes: echoes.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
  }

  wikiCatalogueSchema.parse(snapshot)
  await writeJson(projectPath('data', 'generated', 'wiki.json'), snapshot)
  console.log(`Wiki 同步完成：${snapshot.echoes.length}/${snapshot.totalEchoCount} 个声骸保留，${snapshot.sonatas.length} 个合鸣效果`)
  return snapshot
}

if (isMainModule(import.meta.url)) {
  await syncWiki()
}
