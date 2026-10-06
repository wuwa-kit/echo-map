import type { MapDisplayTier, NavigationKind, NavigationMode, NavigationPoint, NavigationPointType, NavigationTypeDefinition } from './types.ts'
import { NAVIGATION_KIND_DISPLAY_TIERS } from './map-display-tier.ts'

function defineType(type: Omit<NavigationTypeDefinition, 'displayTier'> & { displayTier?: MapDisplayTier }): NavigationTypeDefinition {
  return {
    displayTier: NAVIGATION_KIND_DISPLAY_TIERS[type.kind],
    ...type,
  }
}

export const navigationPointTypes = {
  'central-beacon': defineType({
    name: '中枢信标', kind: 'nexus', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['icon-5d4afaadc4b4274c'],
    names: ['中枢信标'],
  }),
  'small-beacon': defineType({
    name: '小型信标', kind: 'beacon', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['icon-b396dbca18b10761'],
    names: ['小型信标'],
  }),
  'material-domain': defineType({
    name: '材料副本', kind: 'domain', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['icon-458b1db12b603d42'],
    names: [],
  }),
  'tacet-field': defineType({
    name: '无音区', kind: 'tacet-field', defaultMode: 'fast-travel', teleportLocked: false,
    icons: ['icon-b73ecba5c4c73be0'],
    names: ['无音区'],
  }),
  'echo-settlement': defineType({
    name: '声骸聚落', kind: 'challenge', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['icon-6a46917ca51473d0', 'icon-4324b10e72143f72', 'icon-fbd442ad82816fef'],
    names: [],
  }),
  'normal-boss': defineType({
    name: '普通 BOSS', kind: 'boss', defaultMode: 'fast-travel', teleportLocked: false,
    icons: ['icon-5fb2c9afe3c5ef4f', 'icon-34af81bbfb61ba8b', 'icon-8480faec330e0d21', 'icon-1b18767990f50c6d', 'icon-a861633695aa54c1', 'icon-a3c10157f1086370', 'icon-b75c9197fb62a46a', 'icon-a5d696eded142fa9', 'icon-6f39ee6efb2f8da5', 'icon-c5ede23ba73dad81', 'icon-7b81e95a8b39868d', 'icon-a68bf2ea7fbe60b6', 'icon-329b20a475756ef2', 'icon-6f49bc80ea32a0af', 'icon-35a016bf18d6d146', 'icon-9fde2846e861820a', 'icon-02e3f41e4a6ece6a', 'icon-8ae8ca4bb6c58a82', 'icon-77bf05e5fde1ccef', 'icon-c2a9ff1fb45b32f5', 'icon-b581bc8404ff02f2', 'icon-5afd5e6a9a84c32d'],
    names: [],
  }),
  'nightmare-boss': defineType({
    displayTier: 'far',
    name: '梦魇 BOSS', kind: 'boss', defaultMode: 'fast-travel', teleportLocked: false,
    icons: ['icon-468be257f951b306', 'icon-86723158f9b8fb72', 'icon-998ee6d72e5e7ba7', 'icon-5d69abc0dd477e2f', 'icon-9a55aab6fd62592e', 'icon-037620842007a024', 'icon-77fe3b9e30342f61', 'icon-fd5bac1b69ba7763', 'icon-c088f57a65b4ef83', 'icon-297227e62170479c', 'icon-54cb799bcd01abd9'],
    names: [],
  }),
  'weekly-boss': defineType({
    name: '周本 BOSS', kind: 'boss', defaultMode: 'fast-travel', teleportLocked: true,
    icons: ['icon-4f065a956e8f24da', 'icon-2d5708b02039025b', 'icon-78b29f1de7502d44', 'icon-a46a8fa6579284db', 'icon-b8049d7e44bc5c38', 'icon-9aa63034f2f89720', 'icon-73b2a425df2c9e5a', 'icon-0293dd81e6330bbc', 'icon-93d2328a365f0abb', 'icon-87025d6758395362', 'icon-7d301670467079e4'],
    names: [],
  }),
  'hologram': defineType({
    name: '全息战略', kind: 'hologram', defaultMode: 'landmark', teleportLocked: false,
    icons: ['icon-6c6f88b7fdddf131', 'icon-acc273d641dd2a07', 'icon-d47d4bc656459591', 'icon-4348096f28bb1337'],
    names: [],
  }),
  'exploration-quest': defineType({
    name: '危行任务', kind: 'landmark', defaultMode: 'landmark', teleportLocked: false,
    icons: ['icon-05f43f9613d478b8'],
    names: [],
  }),
  'entrance': defineType({
    name: '入口', kind: 'entrance', defaultMode: 'entrance', teleportLocked: false,
    icons: ['icon-f9e566c56ab2c4e4'],
    names: [],
  }),
  'service': defineType({
    name: '服务设施', kind: 'service', defaultMode: 'fast-travel', teleportLocked: false,
    icons: ['icon-ac9e0de71d8ea258', 'icon-c4f98f582c9dd99f', 'icon-0fd966a2cfa0aa40', 'icon-c58c3aea6d69dcbc', 'icon-a760dfcbafaa746d', 'icon-5936ab6519ade43f', 'icon-b0b95e3398fcc02c', 'icon-ed46b9d29dc6d9ea', 'icon-d3e2755656db7bd7', 'icon-07be844f01f9bc26', 'icon-d46d97ebff06af5f', 'icon-50b338ec14e96d80', 'icon-2ee2e41664dd1920', 'icon-049d0d32d01a6a8d', 'icon-13dffc1da5f5c309', 'icon-ce690222976140c5', 'icon-047aaa32aada0ca0', 'icon-b1d093e98ab2140d', 'icon-c2e2cff5927e4bfb', 'icon-fb2cbe33e966e314'],
    names: [],
  }),
}

export const navigationPointTypeIds = Object.keys(navigationPointTypes) as NavigationPointType[]

export function navigationPointDisplayTier(point: Pick<NavigationPoint, 'pointType'>): MapDisplayTier {
  return point.pointType ? navigationPointTypes[point.pointType].displayTier : 'near'
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
