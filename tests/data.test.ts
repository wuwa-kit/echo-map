import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { mapDatasetSchema } from '../src/domain/schema.ts'
import type { MapDataset } from '../src/domain/types.ts'

const datasetUrl = new URL('../public/data/app-data.json', import.meta.url)

describe('generated application data', () => {
  it('contains only C1/C3 echoes with at least one valid sonata', async () => {
    const parsed = mapDatasetSchema.parse(JSON.parse(await readFile(datasetUrl, 'utf8'))) as MapDataset
    const echoIds = new Set(parsed.echoes.map(({ id }) => id))
    const sonataIds = new Set(parsed.sonatas.map(({ id }) => id))
    expect(parsed.echoes.length).toBeGreaterThan(0)
    expect(parsed.echoes.every(({ cost }) => cost === 1 || cost === 3)).toBe(true)
    expect(parsed.echoes.every(({ sonataIds: ids }) => ids.length > 0 && ids.every((id) => sonataIds.has(id)))).toBe(true)
    expect(parsed.echoLocations.every(({ echoId }) => echoIds.has(echoId))).toBe(true)
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
