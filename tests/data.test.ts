import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { mapCatalogDataSchema, mapDataSchema, mapPointLocationsSchema, wikiCatalogueSchema } from '../src/domain/schema.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'

describe('generated application data', () => {
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
    expect(catalog.pointIcons.length).toBeGreaterThan(0)
    const icons = new Set(catalog.pointIcons.map(({ id }) => id))
    expect(icons).toEqual(new Set(locations.navigationPoints.map(({ iconId }) => iconId)))
    expect(locations.echoLocations.every((point) => !('iconId' in point))).toBe(true)
    expect(Object.keys(locations).sort()).toEqual(['echoLocations', 'navigationPoints'])
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

  it('preserves Wiki sonata display order in the public catalogue and assembled dataset', async () => {
    const wiki = wikiCatalogueSchema.parse(JSON.parse(await readFile(new URL('../data/generated/wiki.json', import.meta.url), 'utf8')))
    const dataset = await readMapDataset()
    expect(dataset.sonatas.map(({ id }) => id)).toEqual(wiki.sonatas.map(({ id }) => id))
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
    expect(parsed.navigationPoints.length).toBeGreaterThan(0)
    expect(parsed.navigationPointGroups.length).toBeGreaterThan(0)
    expect(parsed.navigationPointGroups.some(({ typeIds }) => typeIds.length > 1)).toBe(true)
    expect(parsed.navigationPoints.every(({ groupId }) => parsed.navigationPointGroups.some(({ id }) => id === groupId))).toBe(true)
    expect(parsed.navigationPoints.some(({ typeName }) => typeName === '观景点')).toBe(false)
    expect(parsed.navigationPointGroups.some(({ typeNames }) => typeNames.includes('观景点'))).toBe(false)
    expect(parsed.report.navigationPointCount).toBe(parsed.navigationPoints.length)
    expect(parsed.report.navigationPointGroupCount).toBe(parsed.navigationPointGroups.length)
    expect(parsed.report.navigationIconFetchFailureCount).toBe(0)
    expect(parsed.report.bossNavigationPointCount).toBeGreaterThan(0)
    const bossPoints = parsed.navigationPoints.filter(({ kind }) => kind === 'boss')
    expect(bossPoints.every(({ mode }) => mode === 'fast-travel')).toBe(true)
    expect(new Set(bossPoints.map(({ groupId }) => groupId))).toEqual(new Set(['kind:boss']))
    expect(parsed.navigationPointGroups.find(({ id }) => id === 'kind:boss')?.name).toBe('BOSS')
    expect(parsed.navigationPoints.filter(({ catalogCategoryName }) => catalogCategoryName === '挑战').every(({ mode }) => mode === 'fast-travel')).toBe(true)
    expect(parsed.report.routeEligibleNavigationPointCount).toBe(parsed.navigationPoints.filter(({ mode, gameCoordinate }) => (
      mode === 'fast-travel' && gameCoordinate !== null
    )).length)
  })
})
