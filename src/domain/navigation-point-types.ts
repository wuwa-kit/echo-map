import { normalBossIcons } from './normal-boss-icons.ts'
import weeklyBossIcons from '../../data/generated/map-boss-icons.json' with { type: 'json' }
import iconLibraryJson from '../../data/manual/navigation-icons.json' with { type: 'json' }
import type { NavigationIconLibrary } from './types.ts'
import type { MapDisplayTier, NavigationKind, NavigationMode, NavigationPoint, NavigationPointType, NavigationTypeDefinition } from './types.ts'

function defineType(type: NavigationTypeDefinition): NavigationTypeDefinition {
  return type
}

export const builtInNavigationPointTypes = {
  'central-beacon': defineType({
    builtIn: true,
    name: '中枢信标', kind: 'nexus', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['unpack-map-2-3-13'],
    names: ['中枢信标'],
  }),
  'small-beacon': defineType({
    builtIn: true,
    name: '小型信标', kind: 'beacon', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['unpack-map-3-3-2'],
    names: ['小型信标'],
  }),
  'material-domain': defineType({
    builtIn: true,
    name: '材料副本', kind: 'domain', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['unpack-map-4-3-1'],
    names: [],
  }),
  'tacet-field': defineType({
    builtIn: true,
    name: '无音区', kind: 'tacet-field', defaultMode: 'fast-travel', teleportLocked: false,
    icons: ['unpack-map-4-6-3'],
    names: [],
  }),
  'echo-settlement': defineType({
    builtIn: true,
    name: '声骸聚落', kind: 'challenge', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['unpack-map-3-4-15', 'unpack-map-4-4-2', 'unpack-map-3-8-11'],
    names: [],
  }),
  'weekly-boss': defineType({
    builtIn: true,
    name: '周本 BOSS', kind: 'boss', defaultMode: 'fast-travel', teleportLocked: true,
    icons: weeklyBossIcons.map(icon => icon.id),
    names: [],
  }),
  'normal-boss': defineType({
    builtIn: true,
    name: '普通 BOSS', kind: 'boss', defaultMode: 'fast-travel', teleportLocked: false,
    icons: normalBossIcons.map(icon => icon.id),
    names: [],
  }),
  'exploration-quest': defineType({
    builtIn: true,
    name: '危行任务', kind: 'landmark', defaultMode: 'landmark', teleportLocked: false,
    icons: ['unpack-map-1-1-9'],
    names: [],
  }),
  'entrance': defineType({
    builtIn: true,
    name: '入口', kind: 'entrance', defaultMode: 'entrance', teleportLocked: false,
    icons: ['unpack-map-3-3-4'],
    names: [],
  }),
}

export function categoryPointType(id: string): NavigationPointType {
  if (id === 'category-service') return 'service'
  if (id === 'unclassified' || /^category-[a-z0-9-]+$/u.test(id)) return id as NavigationPointType
  throw new Error(`无效图标分类：${id}`)
}

export function buildNavigationPointTypes(categories: NavigationIconLibrary['categories']): Record<NavigationPointType, NavigationTypeDefinition> {
  return {
    ...builtInNavigationPointTypes,
    ...Object.fromEntries(categories.map(category => [categoryPointType(category.id), defineType({
      name: category.name,
      kind: category.id === 'category-special-boss' ? 'boss' : category.id === 'category-service' ? 'service' : 'landmark',
      defaultMode: category.id === 'category-service' || category.id === 'category-special-boss' ? 'fast-travel' : 'landmark',
      teleportLocked: false,
      icons: category.icons.map(icon => icon.iconId),
      names: [],
    })])),
  } as Record<NavigationPointType, NavigationTypeDefinition>
}

export const navigationPointTypes = buildNavigationPointTypes(iconLibraryJson.categories)

export function getNavigationPointType(id: NavigationPointType, types = navigationPointTypes): NavigationTypeDefinition {
  const type = types[id]
  if (!type) throw new Error(`未知定位点类型：${id}`)
  return type
}

export const builtInNavigationIconCategories = [
  { id: 'built-in', name: '基础类型', icons: Object.values(navigationPointTypes).filter(type => type.builtIn && type.icons.length === 1).flatMap(type => type.icons) },
  ...Object.entries(navigationPointTypes).filter(([, type]) => type.builtIn && type.icons.length > 1).map(([id, type]) => ({ id, name: type.name, icons: type.icons })),
]

export const navigationPointTypeIds = Object.keys(navigationPointTypes) as NavigationPointType[]

export function builtInIconType(iconId: string | undefined): NavigationTypeDefinition | undefined {
  return Object.values(navigationPointTypes).find(type => type.builtIn && type.icons.includes(iconId ?? ''))
}

export function navigationPointDisplayTier(point: Pick<NavigationPoint, 'pointType' | 'mode'>): MapDisplayTier {
  if (point.pointType === 'central-beacon') return 'always'
  return point.mode === 'fast-travel' ? 'teleport' : 'nonTeleport'
}

export function navigationTypeErrors(point: { pointType?: NavigationPointType, kind: NavigationKind, mode: NavigationMode }): string[] {
  if (!point.pointType) return []
  const rule = navigationPointTypes[point.pointType]
  if (!rule) return ['未知定位点类型']
  const errors: string[] = []
  if (point.kind !== rule.kind) errors.push('定位点粗分类与所选类型不一致')
  if (rule.teleportLocked && point.mode !== rule.defaultMode) errors.push(rule.defaultMode === 'fast-travel' ? `${rule.name}应标记为可直接传送` : `${rule.name}应标记为不可直接传送`)
  const nonTeleportMode = rule.defaultMode === 'fast-travel' ? 'landmark' : rule.defaultMode
  if (!rule.teleportLocked && point.mode !== 'fast-travel' && point.mode !== nonTeleportMode) errors.push('传送模式与所选类型不一致')
  return errors
}
