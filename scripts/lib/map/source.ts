import { createHash } from 'node:crypto'
import { fetchBytes, fetchJson, fetchOptionalJson, kuroHeaders, postFormJson } from '../http.ts'
import { asArray, asNumber, asRecord, asString } from '../raw.ts'
import { STATIC_ROOT } from './normalize.ts'
import type { MapConfiguration, MapStatePayload, NavigationPointDraft } from './types.ts'

const OFFICIAL_API = 'https://api.kurobbs.com'

export async function fetchMapConfiguration(): Promise<MapConfiguration> {
  const headers = kuroHeaders(10, 8)
  const [resourceResponse, selectionResponse, tileResponse] = await Promise.all([
    postFormJson<unknown>(`${OFFICIAL_API}/map/core/config/getMapResource`, headers, {}),
    fetchJson<unknown>(`${OFFICIAL_API}/map/core/position/getMapStateSelection`, { headers }),
    postFormJson<unknown>(`${OFFICIAL_API}/map/core/config/getMapIdList`, headers, {}),
  ])
  const resourceRoot = asRecord(resourceResponse, 'map resource response')
  const selectionRoot = asRecord(selectionResponse, 'map selection response')
  const tileRoot = asRecord(tileResponse, 'map tile response')
  const selectionData = asRecord(selectionRoot.data, 'map selection data')
  const states = asArray(selectionData.state, 'map states').map((value) => {
    const state = asRecord(value, 'map state')
    return { id: asNumber(state.id), name: asString(state.name) }
  })
  const rawTiles = asRecord(tileRoot.data, 'map tile data')
  const tileIdsByState = Object.fromEntries(Object.entries(rawTiles).map(([stateId, ids]) => [
    stateId,
    asArray(ids, `tiles ${stateId}`).map((id) => asString(id)),
  ]))

  return {
    resourceHash: asString(resourceRoot.data),
    states,
    tileIdsByState,
  }
}

export async function fetchCountryData(resourceHash: string): Promise<unknown> {
  return fetchOptionalJson<unknown>(
    `${STATIC_ROOT}/mcmap/country/${resourceHash}/country.json`, [],
  )
}

export function parseMapSonataOrder(value: unknown): string[] {
  const categories = asArray(value, 'map catalog relation')
  const sonataCategory = categories
    .map((category) => asRecord(category, 'map catalog relation category'))
    .find((category) => asString(category.id) === 'C_100')
  if (!sonataCategory) throw new Error('地图目录缺少声骸套装分类')

  const sonatas = asArray(sonataCategory.children, 'map sonata catalog').map((item) => {
    const record = asRecord(item, 'map sonata')
    return { id: asNumber(record.id, Number.NaN), name: asString(record.name).trim() }
  })
  if (sonatas.length === 0 || sonatas.some(({ id, name }) => !Number.isSafeInteger(id) || id < 1 || name.length === 0)) {
    throw new Error('地图目录的声骸套装顺序为空或包含无效 ID、空名称')
  }
  if (new Set(sonatas.map(({ id }) => id)).size !== sonatas.length) throw new Error('地图目录的声骸套装 ID 不能重复')
  if (new Set(sonatas.map(({ name }) => name)).size !== sonatas.length) throw new Error('地图目录的声骸套装名称不能重复')
  return sonatas.sort((left, right) => left.id - right.id).map(({ name }) => name)
}

export async function fetchMapSonataOrder(resourceHash: string): Promise<string[]> {
  const value = await fetchJson<unknown>(`${STATIC_ROOT}/mcmap/catalog/${resourceHash}/catalogRelation.json`)
  return parseMapSonataOrder(value)
}

export async function fetchStatePayloads(configuration: MapConfiguration): Promise<MapStatePayload[]> {
  return Promise.all(configuration.states.map(async (state) => {
    const [positionData, layerData, catalogData, gravityData] = await Promise.all([
      fetchOptionalJson<unknown>(`${STATIC_ROOT}/mcmap/position/${state.id}/position.json`, []),
      fetchOptionalJson<unknown>(`${STATIC_ROOT}/mcmap/layer/${configuration.resourceHash}/${state.id}/layer.json`, []),
      fetchOptionalJson<unknown>(`${STATIC_ROOT}/mcmap/catalog/${configuration.resourceHash}/${state.id}/catalog.json`, []),
      fetchJson<unknown>(`${STATIC_ROOT}/mcmap/gravity/${configuration.resourceHash}/${state.id}/gravity.json`),
    ])
    return { state, positionData, layerData, catalogData, gravityData }
  }))
}

export async function fetchNavigationIconHashes(drafts: readonly NavigationPointDraft[]): Promise<Map<string, string | null>> {
  const iconUrls = [...new Set(drafts
    .filter(({ kind }) => kind !== 'boss')
    .map(({ iconUrl: url }) => url)
    .filter(Boolean))]
  const hashEntries = await Promise.all(iconUrls.map(async (url) => {
    try {
      const bytes = await fetchBytes(url)
      return [url, createHash('sha256').update(bytes).digest('hex')] as const
    } catch (error) {
      console.warn(`定位点图标下载失败，退回独立类型分组：${url}`, error)
      return [url, null] as const
    }
  }))
  return new Map(hashEntries)
}
