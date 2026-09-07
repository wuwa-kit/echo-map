import { pointLibrarySchema } from './schema.ts'
import type { AuthoredCoordinate, AuthoredPoint, EchoMapLocation, AuthoredEchoLocation, GameCoordinate, MapDataset, NavigationKind, NavigationMode, NavigationPoint, NavigationPointGroup, PointLibrary, PointQuality } from './types.ts'
import { officialToMapCoordinate } from '../map/projection.ts'

export const NAVIGATION_NAMES: Record<NavigationKind, string> = {
  nexus: '共鸣中枢', beacon: '共鸣信标', 'tacet-field': '无音区', 'training-ground': '训练场',
  hologram: '全息战略', boss: 'BOSS', domain: '副本', endgame: '周期挑战', challenge: '挑战',
  service: '服务地标', 'local-transit': '交通点', entrance: '入口', landmark: '地标', unknown: '待确认',
}
export const MODE_NAMES: Record<NavigationMode, string> = {
  'fast-travel': '可直接传送', 'local-transit': '局部交通', entrance: '入口', landmark: '不可传送', unknown: '待确认',
}

export function emptyPointLibrary(): PointLibrary {
  return { version: 1, points: [] }
}

export function parsePointLibrary(value: unknown, dataset: Pick<MapDataset, 'states' | 'echoes' | 'regionLabels'>, source?: 'manual' | 'official'): PointLibrary {
  const library = pointLibrarySchema.parse(value)
  const echoIds = new Set(dataset.echoes.map(({ id }) => id))
  const replacements = new Set<string>()
  for (const point of library.points) {
    if (source === 'official' && point.status !== 'imported') throw new Error('官方文件只能包含官方导入点')
    if (source === 'manual' && point.status === 'imported') throw new Error('官方导入点应保存于官方文件，请先录入实测坐标再保存到人工库')
    for (const id of point.replacesOfficialIds ?? []) {
      if (replacements.has(id)) throw new Error(`官方点 ${id} 已有人工替代点，请追加到已有点位`)
      replacements.add(id)
    }
    const state = dataset.states.find(({ id }) => id === point.stateId)
    if (!state) throw new Error(`点位 ${point.id} 引用了未知地图`)
    if (point.gravityType === 2 && state.gravityTiles.length === 0) throw new Error(`点位 ${point.id} 的地图没有反重力资源`)
    if (point.status !== 'imported' && point.levelId !== null && !state.layeredMaps.some(({ floors }) => floors.some(({ id }) => id === point.levelId))) {
      throw new Error(`点位 ${point.id} 的楼层不属于当前地图`)
    }
    if (point.countryId !== null && !dataset.regionLabels.some((label) => label.stateId === point.stateId && label.level === 1 && label.countryId === point.countryId)) {
      throw new Error(`点位 ${point.id} 的地区不属于当前地图`)
    }
    if (point.kind === 'echo' && point.members.some(({ echoId }) => !echoIds.has(echoId))) {
      throw new Error(`点位 ${point.id} 引用了白名单外声骸`)
    }
  }
  return library
}

export function echoMembers(location: EchoMapLocation): readonly {
  echoId: string
  count: number | null
}[] {
  return 'members' in location ? location.members : [{ echoId: location.echoId, count: null }]
}

export function pointTitle(point: AuthoredPoint, dataset: Pick<MapDataset, 'echoes'>): string {
  if (point.kind === 'navigation') return point.name.trim() || NAVIGATION_NAMES[point.navigationKind]
  const names = new Map(dataset.echoes.map(({ id, name }) => [id, name]))
  return point.members.map(({ echoId, count }) => `${names.get(echoId) ?? echoId} ×${count}`).join(' · ') || '未添加怪物'
}

function completeCoordinate(coordinate: AuthoredCoordinate | undefined): GameCoordinate | undefined {
  if (!coordinate || coordinate.x === null || coordinate.y === null || coordinate.z === null) return undefined
  return { x: coordinate.x, y: coordinate.y, z: coordinate.z }
}

export function navigationRouteCoordinate(point: NavigationPoint): GameCoordinate | null {
  return point.teleportCoordinate ?? point.gameCoordinate
}

export function libraryLocations(library: PointLibrary, dataset: MapDataset) {
  const echoLocations: AuthoredEchoLocation[] = []
  const navigationPoints: NavigationPoint[] = []
  const navigationPointGroups: NavigationPointGroup[] = []
  const officialNavigation = new Map(dataset.navigationPoints.map((point) => [point.id, point]))
  const officialGroupIds = new Set<string>()
  for (const point of library.points) {
    const { x, y, z } = point.coordinate
    if (point.status === 'draft' || x === null || y === null || z === null) continue
    const quality: PointQuality = point.status === 'imported' ? 'official-provisional' : 'manual-verified'
    const base = {
      id: point.id, typeId: `manual:${point.kind}`, typeName: pointTitle(point, dataset), iconUrl: '',
      stateId: point.stateId, countryId: point.countryId, levelId: point.levelId,
      gravityType: point.gravityType ?? null,
      layeredMapId: dataset.states.find(({ id }) => id === point.stateId)?.layeredMaps.find(({ floors }) => floors.some(({ id }) => id === point.levelId))?.id ?? null,
      coordinate: officialToMapCoordinate(x * 100, y * 100, dataset.source.tileWidth),
      gameCoordinate: { x, y, z }, quality,
    }
    if (point.kind === 'echo') {
      echoLocations.push({ ...base, members: point.members, note: point.note, compositionStatus: point.compositionStatus ?? 'partial' })
    } else {
      const teleportCoordinate = completeCoordinate(point.teleportCoordinate)
      const original = point.status === 'imported' ? officialNavigation.get(point.officialIds?.[0] ?? '') : undefined
      if (original) {
        navigationPoints.push({ ...original, ...base, typeId: original.typeId, iconUrl: original.iconUrl, ...(teleportCoordinate ? { teleportCoordinate } : {}) })
        officialGroupIds.add(original.groupId)
        continue
      }
      const groupId = `manual:${point.navigationKind}`
      navigationPoints.push({ ...base, typeId: groupId, groupId, kind: point.navigationKind, mode: point.mode, catalogCategoryId: 'manual', catalogCategoryName: '人工定位点', ...(teleportCoordinate ? { teleportCoordinate } : {}) })
    }
  }
  for (const kind of Object.keys(NAVIGATION_NAMES) as NavigationKind[]) {
    const points = navigationPoints.filter((point) => point.kind === kind && point.groupId === `manual:${kind}`)
    if (points.length === 0) continue
    const id = `manual:${kind}`
    navigationPointGroups.push({ id, name: NAVIGATION_NAMES[kind], iconUrl: '', iconHash: null, typeIds: [id], typeNames: [NAVIGATION_NAMES[kind]], modes: [...new Set(points.map(({ mode }) => mode))], kinds: [kind] })
  }
  navigationPointGroups.push(...dataset.navigationPointGroups.filter(({ id }) => officialGroupIds.has(id)))
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
