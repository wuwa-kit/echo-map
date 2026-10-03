import { authoredPointSchema, pointLibrarySchema } from './schema.ts'
import type { AuthoredCoordinate, AuthoredPoint, EchoMapLocation, AuthoredEchoLocation, GameCoordinate, MapDataset, NavigationKind, NavigationMode, NavigationPoint, NavigationPointGroup, PointLibrary, PointQuality } from './types.ts'
import { gameToMapCoordinate, officialToMapCoordinate } from '../map/projection.ts'
import { navigationPointTypes } from './navigation-point-types.ts'
import { navigationPointIconUrl } from './navigation-icons.ts'
import { pointRegionResolver } from './point-region.ts'
import { isOfficialEchoMapIncluded } from './official-echo-scope.ts'

export const NAVIGATION_NAMES: Record<NavigationKind, string> = {
  nexus: '中枢信标', beacon: '小型信标', 'tacet-field': '无音区', 'training-ground': '模拟领域',
  hologram: '全息战略', boss: 'BOSS', domain: '副本', endgame: '周期挑战', challenge: '挑战',
  service: '服务地标', 'local-transit': '交通点', entrance: '入口', landmark: '地标', unknown: '待确认',
}
export const MODE_NAMES: Record<NavigationMode, string> = {
  'fast-travel': '可直接传送', 'local-transit': '局部交通', entrance: '入口', landmark: '不可传送', unknown: '待确认',
}

export function emptyPointLibrary(): PointLibrary {
  return { version: 1, points: [] }
}

export function splitPointLibrary(library: PointLibrary): { echo: PointLibrary, navigation: PointLibrary } {
  return {
    echo: { version: 1, points: library.points.filter(({ kind }) => kind === 'echo') },
    navigation: { version: 1, points: library.points.filter(({ kind }) => kind === 'navigation') },
  }
}

export function combinePointLibraryKinds(echo: PointLibrary, navigation: PointLibrary): PointLibrary {
  return { version: 1, points: [...echo.points, ...navigation.points] }
}

export function isOfficialPoint(point: Pick<AuthoredPoint, 'officialIds'>): boolean {
  return point.officialIds !== undefined
}

type PointReferenceDataset = Pick<MapDataset, 'states' | 'echoes' | 'regionLabels' | 'mapNavigation' | 'source'>

function validatePointReferences(points: readonly AuthoredPoint[], dataset: PointReferenceDataset, source?: 'manual' | 'official'): void {
  const echoIds = new Set(dataset.echoes.map(({ id }) => id))
  const replacements = new Set<string>()
  for (const point of points) {
    if (source === 'official' && point.kind !== 'echo') throw new Error('官方文件只能包含声骸点位')
    if (source === 'official' && !isOfficialPoint(point)) throw new Error('官方点位必须保留来源 ID')
    if (source === 'manual' && isOfficialPoint(point)) throw new Error('官方导入点应保存于官方文件，请先录入实测坐标再保存到人工库')
    for (const id of point.replacesOfficialIds ?? []) {
      if (replacements.has(id)) throw new Error(`官方点 ${id} 已有人工替代点，请追加到已有点位`)
      replacements.add(id)
    }
    const state = dataset.states.find(({ id }) => id === point.stateId)
    if (!state) throw new Error(`点位 ${point.id} 引用了未知地图`)
    if (source === 'official') {
      const { x, y } = point.coordinate
      if (x === null || y === null || !isOfficialEchoMapIncluded(dataset, point.stateId, gameToMapCoordinate(x, y, dataset.source.tileWidth))) {
        throw new Error(`官方声骸点 ${point.id} 不在收录地图范围内`)
      }
    }
    if (point.gravityType === 2 && state.gravityTiles.length === 0) throw new Error(`点位 ${point.id} 的地图没有反重力资源`)
    if (!isOfficialPoint(point) && point.levelId !== null && !state.layeredMaps.some(({ floors }) => floors.some(({ id }) => id === point.levelId))) {
      throw new Error(`点位 ${point.id} 的楼层不属于当前地图`)
    }
    if (point.kind === 'echo' && point.members.some(({ echoId }) => !echoIds.has(echoId))) {
      throw new Error(`点位 ${point.id} 引用了白名单外声骸`)
    }
  }
}

export function parsePointDraft(value: unknown, dataset: PointReferenceDataset): AuthoredPoint {
  const point = authoredPointSchema.parse(value)
  validatePointReferences([point], dataset, 'manual')
  return point
}

export function parsePointLibrary(value: unknown, dataset: PointReferenceDataset, source?: 'manual' | 'official'): PointLibrary {
  const library = pointLibrarySchema.parse(value)
  validatePointReferences(library.points, dataset, source)
  return library
}

export function echoMembers(location: EchoMapLocation): readonly {
  echoId: string
  count: number | null
}[] {
  return 'members' in location ? location.members : [{ echoId: location.echoId, count: null }]
}

export function pointTitle(point: AuthoredPoint, dataset: Pick<MapDataset, 'echoes'>): string {
  if (point.kind === 'navigation') return point.name.trim() || (point.pointType ? navigationPointTypes[point.pointType].name : '未设置类型')
  const names = new Map(dataset.echoes.map(({ id, name }) => [id, name]))
  return point.members.map(({ echoId, count }) => `${names.get(echoId) ?? echoId} ×${count}`).join(' · ') || '未添加怪物'
}

function completeCoordinate(coordinate: AuthoredCoordinate | undefined): GameCoordinate | undefined {
  if (!coordinate || coordinate.x === null || coordinate.y === null || coordinate.z === null) return undefined
  return { x: coordinate.x, y: coordinate.y, z: coordinate.z }
}

type AuthoredMapDisplayPoint =
  | { category: 'echo'; location: AuthoredEchoLocation }
  | { category: 'navigation'; location: NavigationPoint }

export function authoredPointMapDisplay(
  point: AuthoredPoint,
  dataset: MapDataset,
): AuthoredMapDisplayPoint | null {
  const { x, y } = point.coordinate
  if (x === null || y === null) return null
  const quality: PointQuality = isOfficialPoint(point) ? 'official-provisional' : 'manual'
  const coordinate = officialToMapCoordinate(x * 100, y * 100, dataset.source.tileWidth)
  const base = {
    id: point.id,
    typeId: `manual:${point.kind}`,
    typeName: pointTitle(point, dataset),
    iconUrl: '',
    stateId: point.stateId,
    countryId: pointRegionResolver(dataset)(point.stateId, [coordinate.mapX, coordinate.mapY])?.countryId ?? null,
    levelId: point.levelId,
    gravityType: point.gravityType ?? null,
    layeredMapId: dataset.states.find(({ id }) => id === point.stateId)?.layeredMaps.find(({ floors }) => floors.some(({ id }) => id === point.levelId))?.id ?? null,
    coordinate,
    gameCoordinate: completeCoordinate(point.coordinate) ?? null,
    quality,
  }
  if (point.kind === 'echo') {
    return { category: 'echo', location: { ...base, members: point.members, note: point.note ?? '', compositionStatus: point.compositionStatus ?? 'partial' } }
  }
  const teleportCoordinate = completeCoordinate(point.teleportCoordinate)
  const location: NavigationPoint = {
    ...base, groupId: `manual:${point.navigationKind}`, kind: point.navigationKind, mode: point.mode,
    catalogCategoryId: 'manual', catalogCategoryName: '人工定位点',
    ...(teleportCoordinate ? { teleportCoordinate } : {}),
  }
  const iconUrl = navigationPointIconUrl(point)
  if (iconUrl) location.iconUrl = iconUrl
  location.pointType = point.pointType
  if (!teleportCoordinate) delete location.teleportCoordinate
  return { category: 'navigation', location }
}

export function editorLibraryLocations(points: readonly AuthoredPoint[], dataset: MapDataset, editorKind: AuthoredPoint['kind']) {
  const displayPoints = points.flatMap((point) => {
    if (editorKind === 'navigation' && point.kind === 'echo') return []
    const display = authoredPointMapDisplay(point, dataset)
    return display ? [display] : []
  })
  return {
    echoLocations: displayPoints.flatMap((point) => point.category === 'echo' ? [point.location] : []),
    navigationPoints: displayPoints.flatMap((point) => point.category === 'navigation' ? [point.location] : []),
  }
}

export function navigationRouteCoordinate(point: NavigationPoint): GameCoordinate | null {
  return point.teleportCoordinate ?? point.gameCoordinate
}

export function libraryLocations(library: PointLibrary, dataset: MapDataset) {
  const echoLocations: AuthoredEchoLocation[] = []
  const navigationPoints: NavigationPoint[] = []
  const navigationPointGroups: NavigationPointGroup[] = []
  for (const point of library.points) {
    if (!completeCoordinate(point.coordinate)) continue
    const display = authoredPointMapDisplay(point, dataset)
    if (display?.category === 'echo') echoLocations.push(display.location)
    else if (display?.category === 'navigation') {
      navigationPoints.push(display.location)
    }
  }
  for (const kind of Object.keys(NAVIGATION_NAMES) as NavigationKind[]) {
    const points = navigationPoints.filter((point) => point.kind === kind && point.groupId === `manual:${kind}`)
    if (points.length === 0) continue
    const id = `manual:${kind}`
    navigationPointGroups.push({ id, name: NAVIGATION_NAMES[kind], iconUrl: '', iconHash: null, typeIds: [id], typeNames: [NAVIGATION_NAMES[kind]], modes: [...new Set(points.map(({ mode }) => mode))], kinds: [kind] })
  }
  return { echoLocations, navigationPoints, navigationPointGroups }
}

export function parseCoordinateInput(text: string): {
  x: number
  y: number
  z: number
} {
  const normalized = text.trim().replace(/[，,;；\s]+/gu, ' ')
  const labelPattern = /([xyz])\s*[:：=]?\s*([+-]?\d+)/giu
  const labels = [...normalized.matchAll(labelPattern)]
  let parts = normalized.split(' ')
  if (labels.length > 0) {
    const axes = new Map(labels.map((match) => [match[1]?.toLowerCase(), match[2]]))
    if (labels.length !== 3 || axes.size !== 3 || normalized.replace(labelPattern, '').trim() !== '') {
      throw new Error('带标签的坐标必须各包含一个 X、Y、Z 整数')
    }
    parts = ['x', 'y', 'z'].map((axis) => axes.get(axis) ?? '')
  }
  if (parts.length !== 3 || parts.some((part) => !/^[+-]?\d+$/u.test(part))) throw new Error('请输入三个整数，例如 -497, 449, 18')
  const [x, y, z] = parts.map(Number)
  if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isSafeInteger)) throw new Error('XYZ 必须是有效整数')
  return { x, y, z }
}
