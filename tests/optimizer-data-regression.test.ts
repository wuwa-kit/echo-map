import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { assembleMapDataset } from '../src/domain/map-data.ts'
import { combinePointLibraries } from '../src/domain/point-matching.ts'
import { combinePointLibraryKinds, libraryLocations, parsePointLibrary } from '../src/domain/point-library.ts'
import { echoPointLibrarySchema, mapCatalogDataSchema, mapDataSchema, navigationPointLibrarySchema, officialEchoPointDataSchema, officialNavigationPointDataSchema } from '../src/domain/schema.ts'
import type { RoutePoint, RouteResult } from '../src/domain/types.ts'
import { optimizeRoute } from '../src/route/optimizer.ts'
import { createRoutePlanInput } from '../src/route/plan-input.ts'
import { createRouteGroupCandidates } from '../src/route/route-groups.ts'

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
}

function routePointAt(points: readonly RoutePoint[], x: number, y: number, z: number): number {
  const index = points.findIndex(({ coordinate }) => (
    coordinate.x === x && coordinate.y === y && coordinate.z === z
  ))
  expect(index).toBeGreaterThanOrEqual(0)
  return index
}

function walkingSegmentAt(points: RouteResult['points'], index: number): number {
  return points.slice(0, index + 1).filter(({ teleportFrom }) => teleportFrom).length
}

it('rejoins spatially adjacent full-selection fragments instead of teleporting back to the same area', async () => {
  const map = mapDataSchema.parse(await readJson('../public/data/map-data.json'))
  const catalog = mapCatalogDataSchema.parse(await readJson('../public/data/catalog-data.json'))
  const officialEcho = officialEchoPointDataSchema.parse(await readJson('../public/data/official-echo-points.json'))
  const officialNavigation = officialNavigationPointDataSchema.parse(await readJson('../public/data/official-navigation-points.json'))
  const dataset = assembleMapDataset(map, catalog, {
    echoLocations: officialEcho.locations,
    navigationPoints: officialNavigation.locations,
  })
  const official = parsePointLibrary(combinePointLibraryKinds(officialEcho.library, officialNavigation.library), dataset, 'official')
  const manualEcho = echoPointLibrarySchema.parse(await readJson('../public/data/custom-echo-points.json'))
  const manualNavigation = navigationPointLibrarySchema.parse(await readJson('../public/data/custom-navigation-points.json'))
  const manual = parsePointLibrary(combinePointLibraryKinds(manualEcho, manualNavigation), dataset, 'manual')
  const library = combinePointLibraries({
    ...manual,
    points: manual.points.filter(({ status }) => status === 'verified'),
  }, official)
  const { echoLocations, navigationPoints } = libraryLocations(library, dataset)
  const activeEchoIds = new Set(dataset.echoes.map(({ id }) => id))
  const group = createRouteGroupCandidates(
    dataset, echoLocations, navigationPoints, activeEchoIds, true,
  ).find(({ id }) => id === '8:base:1')
  expect(group).toBeDefined()
  if (!group) return

  const result = optimizeRoute(createRoutePlanInput(
    dataset, group.locations, group.navigationPoints, group.stateId, activeEchoIds,
  ))
  const firstEnd = routePointAt(result.points, -858, 2570, 0)
  const adjacentFragment = routePointAt(result.points, -864, 2616, 0)
  const insertionAnchor = routePointAt(result.points, -907, 2701, 0)
  const isolatedPoint = routePointAt(result.points, -942, 2689, 0)

  expect(walkingSegmentAt(result.points, adjacentFragment)).toBe(walkingSegmentAt(result.points, firstEnd))
  expect(walkingSegmentAt(result.points, isolatedPoint)).toBe(walkingSegmentAt(result.points, insertionAnchor))
  expect(Math.abs(insertionAnchor - isolatedPoint)).toBe(1)
}, 30_000)
