import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { mapCatalogDataSchema, mapDataSchema, mapPointLocationsSchema, officialMapAssetCatalogSchema, officialEchoPointDataSchema, wikiCatalogueSchema } from '../src/domain/schema.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import { buildOfficialAssets, filterOfficialAssets } from '../src/domain/official-assets.ts'

describe('generated application data', () => {
  it('keeps official navigation names in assets and publishes only official echoes', async () => {
    const dataset = await readMapDataset()
    const catalog = officialMapAssetCatalogSchema.parse(JSON.parse(await readFile(new URL('../public/data/map-asset-catalog.json', import.meta.url), 'utf8')))
    const assets = buildOfficialAssets(dataset, catalog.assets)
    for (const name of ['中枢信标', '小型信标', '罗蕾莱']) {
      expect(filterOfficialAssets(assets, 'navigation', null, name).length, name).toBeGreaterThan(0)
    }
    const official = officialEchoPointDataSchema.parse(JSON.parse(await readFile(new URL('../public/data/official-echo-points.json', import.meta.url), 'utf8')))
    expect(official.library.points.length).toBeGreaterThan(0)
    expect(official.library.points.every(({ kind }) => kind === 'echo')).toBe(true)
    await expect(access(new URL('../public/data/official-navigation-points.json', import.meta.url))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(mapPointLocationsSchema.safeParse({ echoLocations: [], navigationPoints: [] }).success).toBe(false)
  })

  it('separates compact map structure, catalogue icons and point coordinates', async () => {
    const mapText = await readFile(new URL('../public/data/map-data.json', import.meta.url), 'utf8')
    const catalogText = await readFile(new URL('../public/data/catalog-data.json', import.meta.url), 'utf8')
    const pointsText = await readFile(new URL('../data/generated/official-locations.json', import.meta.url), 'utf8')
    const map = mapDataSchema.parse(JSON.parse(mapText))
    const catalog = mapCatalogDataSchema.parse(JSON.parse(catalogText))
    const locations = mapPointLocationsSchema.parse(JSON.parse(pointsText))
    for (const text of [mapText, catalogText, pointsText]) expect(text).toBe(JSON.stringify(JSON.parse(text)))
    expect(Object.keys(map).sort()).toEqual(['connectors', 'mapNavigation', 'regionLabels', 'source', 'states', 'version'])
    expect(mapText).not.toContain('iconUrl')
    expect(pointsText).not.toContain('iconUrl')
    expect(catalog).not.toHaveProperty('pointIcons')
    expect(catalog).not.toHaveProperty('navigationPointGroups')
    expect(locations.echoLocations.every((point) => !('iconId' in point))).toBe(true)
    expect(Object.keys(locations).sort()).toEqual(['echoLocations'])
  })

  it.each(['../data/generated/wiki.json', '../public/data/catalog-data.json'])('stores complete C1/C3 lists in %s', async (path) => {
    const catalogue = wikiCatalogueSchema.parse(JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')))
    for (const sonata of catalogue.sonatas) {
      for (const [field, cost] of [['c1EchoIds', 1], ['c3EchoIds', 3]] as const) {
        const expected = catalogue.echoes.filter((echo) => echo.cost === cost && echo.sonataIds.includes(sonata.id)).map(({ id }) => id).sort()
        expect(sonata[field]).toEqual(expected)
      }
    }
  })

  it('stores the reverse official map sonata display order in the public catalogue and assembled dataset', async () => {
    const wiki = wikiCatalogueSchema.parse(JSON.parse(await readFile(new URL('../data/generated/wiki.json', import.meta.url), 'utf8')))
    const dataset = await readMapDataset()
    expect(dataset.sonatas.map(({ name }) => name)).toEqual([
      '茜染怀想之花', '镜影流电之瞬', '衔梦照世之心',
      '冥途夜行之灯', '清邪荡煞之心', '羽落空尘之歌', '碎梦亡鬼之魇', '剪心辑梦之影', '雪落无声之愿',
      '听唤语义之愿', '斑驳粉饰之沫', '长路启航之星', '流金溯真之式', '星构寻辉之环', '逆光跃彩之约',
      '命理崩毁之弦', '焚羽猎魔之影', '息界同调之律', '荣斗铸锋之冠', '失序彼岸之梦', '奔狼燎原之焰',
      '愿戴荣光之旅', '流云逝尽之空', '无惧浪涛之勇', '高天共奏之曲', '幽夜隐匿之帷', '此间永驻之光',
      '凌冽决断之心', '不绝余音', '轻云出月', '隐世回光', '沉日劫明', '浮星祛暗', '啸谷长风', '彻空冥雷',
      '熔山裂谷', '凝夜白霜',
    ])
    expect(dataset.sonatas.map(({ id }) => id)).not.toEqual(wiki.sonatas.map(({ id }) => id))
  })

  it('contains only C1/C3 echoes with at least one valid sonata', async () => {
    const parsed = await readMapDataset()
    const echoIds = new Set(parsed.echoes.map(({ id }) => id))
    const sonataIds = new Set(parsed.sonatas.map(({ id }) => id))
    expect(parsed.echoes.length).toBeGreaterThan(0)
    expect(parsed.echoes.every(({ cost }) => cost === 1 || cost === 3)).toBe(true)
    expect(parsed.echoes.every(({ sonataIds: ids }) => ids.length > 0 && ids.every((id) => sonataIds.has(id)))).toBe(true)
    expect(parsed.echoLocations.every(({ echoId }) => echoIds.has(echoId))).toBe(true)
    const echoes = new Map(parsed.echoes.map((echo) => [echo.id, echo]))
    expect(parsed.echoLocations.every(({ echoId, iconUrl }) => iconUrl === echoes.get(echoId)?.iconUrl)).toBe(true)
    expect(parsed.version).toBe(3)
    expect(parsed.navigationPoints).toEqual([])
    expect(parsed.navigationPointGroups).toEqual([])
  })
})
