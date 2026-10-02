import type { NavigationPointType } from './types.ts'

export const navigationPointTypeNames: Record<NavigationPointType, string> = {
  'central-beacon': '中枢信标',
  'small-beacon': '小型信标',
  'tacet-field': '无音区',
  'echo-settlement': '声骸聚落',
  'weekly-boss': '周本BOSS',
  'normal-boss': '普通BOSS',
  'material-domain': '材料秘境',
}
