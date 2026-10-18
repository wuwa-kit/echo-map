import { describe, expect, it } from 'vitest'
import { readMapDataset } from '../scripts/lib/map-data.ts'
import type { RoutePlanResult, RoutePoint } from '../src/domain/types.ts'
import { createRegionalExportPlan } from '../src/route/export-region-groups.ts'
import { createExportLayout } from '../src/route/export-layout.ts'
import { createFullExportLayouts } from '../src/route/full-export-layout.ts'

const dataset = await readMapDataset()

function plan(count: number): RoutePlanResult {
  return {
    totalCost: 0, totalPoints: count,
    groups: Array.from({ length: count }, (_, index) => {
      const point: RoutePoint = {
        id: `target-${index}`, name: '声骸', echoId: null, stateId: 912,
        levelId: `floor-${index}`, coordinate: { x: 0, y: 0, z: index }, mapCoordinate: [850, 0],
      }
      return {
        id: `912:floor-${index}:1`, stateId: 912, levelId: point.levelId, gravityType: 1,
        label: `梦枢天罗 · 楼层 ${index}`, mapName: '梦枢天罗', echoCount: 1,
        matchingLocationCount: 1, incompleteLocationCount: 0,
        route: { points: [point], totalCost: 0, algorithm: 'exact', startPointId: null },
      }
    }),
  }
}

function regional(count: number) {
  const source = plan(count)
  return createRegionalExportPlan(source, dataset, new Set(source.groups.flatMap(({ route }) => route.points.map(({ id }) => id))), 1)
}

describe('regional export banners', () => {
  it('shares the region banner across floors without merging their routes or floor identities', () => {
    const source = regional(3)
    expect(new Set(source.groups.map(({ exportAreaId }) => exportAreaId)).size).toBe(1)
    expect(source.groups.every(({ exportAreaId }) => Boolean(exportAreaId))).toBe(true)
    expect(new Set(source.groups.map(({ id }) => id)).size).toBe(3)
    const layout = createExportLayout(source)
    expect(layout.cards.map(({ levelId }) => levelId)).toEqual(['floor-0', 'floor-1', 'floor-2'])
    expect(layout.sections).toBe(3)
    expect(layout.banners.map(({ label }) => label)).toEqual(['瑝珑-梦州'])
    expect(createFullExportLayouts(layout)[0]?.banners.map(({ label }) => label)).toEqual(['瑝珑-梦州'])
  })

  it('repeats the regional banner only when continuing on a new image or mobile page', () => {
    const layout = createExportLayout(regional(40))
    expect(layout.pages.length).toBeGreaterThan(1)
    for (const page of layout.pages) {
      expect(page.banners).toHaveLength(1)
      expect(page.banners[0]).toMatchObject({ label: '瑝珑-梦州', y: page.y })
    }
    const parts = createFullExportLayouts(layout, { maxHeight: 1000 })
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.banners).toHaveLength(1)
      expect(part.banners[0]).toMatchObject({ label: '瑝珑-梦州', y: 0 })
    }
  })

  it('keeps distinct region IDs separate even when their labels match', () => {
    const source = regional(2)
    source.groups = source.groups.map((group, index) => ({ ...group, exportAreaId: `area-${index}` }))
    const layout = createExportLayout(source)
    expect(layout.banners).toHaveLength(2)
    expect(createFullExportLayouts(layout)[0]?.banners).toHaveLength(2)
  })
})
