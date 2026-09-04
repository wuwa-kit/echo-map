import { kuroHeaders, postFormJson } from './lib/http.ts'
import { isMainModule, projectPath, writeJson } from './lib/files.ts'
import { asArray, asNumber, asRecord, asString, nested } from './lib/raw.ts'
import type { UnknownRecord } from './lib/raw.ts'
import type { WikiSnapshot } from './lib/wiki.ts'
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

function normalizeSonatas(records: UnknownRecord[]): SonataEffect[] {
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
  const setTag = findTag(echoCatalogue.tags, '套装')
  const costTag = findTag(echoCatalogue.tags, 'COST')
  if (!setTag || setTag.children.length === 0) {
    throw new Error('声骸目录缺少“套装”标签组，拒绝生成可能污染的数据')
  }
  if (!costTag || costTag.children.length === 0) {
    throw new Error('声骸目录缺少“COST”标签组，拒绝生成可能污染的数据')
  }

  const sonatas = normalizeSonatas(sonataCatalogue.records)
  const sonataByName = new Map(sonatas.map((sonata) => [sonata.name, sonata]))
  const setNameByTagId = new Map(setTag.children.map((tag) => [tag.id, tag.name]))
  const costByTagId = new Map(costTag.children.map((tag) => [tag.id, Number(tag.name.match(/\d+/u)?.[0])]))
  const excludedEchoNames: string[] = []
  const echoes: EchoDefinition[] = []

  for (const record of echoCatalogue.records) {
    const name = asString(record.name).trim()
    const relateTagIds = tagIdsOf(record)
    const sonataIds = relateTagIds
      .map((tagId) => setNameByTagId.get(tagId))
      .filter((value): value is string => value !== undefined)
      .map((setName) => sonataByName.get(setName)?.id)
      .filter((value): value is string => value !== undefined)

    if (sonataIds.length === 0) {
      excludedEchoNames.push(name)
      continue
    }

    const rawCost = relateTagIds.map((tagId) => costByTagId.get(tagId)).find((value) => value !== undefined)
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
    sonatas: sonatas.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    echoes: echoes.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
  }

  await writeJson(projectPath('data', 'generated', 'wiki.json'), snapshot)
  console.log(`Wiki 同步完成：${snapshot.echoes.length}/${snapshot.totalEchoCount} 个声骸保留，${snapshot.sonatas.length} 个合鸣效果`)
  return snapshot
}

if (isMainModule(import.meta.url)) {
  await syncWiki()
}
