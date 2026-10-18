import normalBossIcons from '../../data/generated/wiki-boss-icons.json' with { type: 'json' }
import weeklyBossIcons from '../../data/generated/map-boss-icons.json' with { type: 'json' }
import type { MapDisplayTier, NavigationKind, NavigationMode, NavigationPoint, NavigationPointType, NavigationTypeDefinition } from './types.ts'

function defineType(type: NavigationTypeDefinition): NavigationTypeDefinition {
  return type
}

export const navigationPointTypes = {
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
    names: ['无音区'],
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
  'hologram': defineType({
    name: '全息战略', kind: 'hologram', defaultMode: 'landmark', teleportLocked: false,
    icons: ['unpack-map-4-3-15', 'unpack-map-4-6-6', 'unpack-map-4-6-7', 'unpack-map-1-1-10'],
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
  'service': defineType({
    name: '服务设施', kind: 'service', defaultMode: 'fast-travel', teleportLocked: false,
    icons: ['unpack-map-3-5-12', 'unpack-map-4-5-2', 'unpack-map-3-5-11', 'unpack-map-4-5-3', 'unpack-map-4-5-5', 'unpack-map-4-5-6', 'unpack-map-4-5-7', 'unpack-map-4-5-8', 'unpack-map-4-5-10', 'unpack-map-4-3-10', 'unpack-map-4-5-1', 'unpack-map-3-5-13', 'unpack-map-2-4-1', 'unpack-map-3-4-12', 'unpack-map-3-4-13', 'unpack-map-4-3-11', 'unpack-map-4-5-13', 'unpack-map-1-1-6', 'unpack-map-2-4-2', 'unpack-map-4-1-10'],
    names: [],
  }),
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
  const errors: string[] = []
  if (point.kind !== rule.kind) errors.push('定位点粗分类与所选类型不一致')
  if (rule.teleportLocked && point.mode !== rule.defaultMode) errors.push(rule.defaultMode === 'fast-travel' ? `${rule.name}应标记为可直接传送` : `${rule.name}应标记为不可直接传送`)
  const nonTeleportMode = rule.defaultMode === 'fast-travel' ? 'landmark' : rule.defaultMode
  if (!rule.teleportLocked && point.mode !== 'fast-travel' && point.mode !== nonTeleportMode) errors.push('传送模式与所选类型不一致')
  return errors
}
