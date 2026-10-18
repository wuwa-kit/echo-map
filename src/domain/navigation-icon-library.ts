import { z } from 'zod'
import type { NavigationIconLibrary, ManagedNavigationIcon, NavigationIconCategory } from './types.ts'
import { officialIconPool, echoCatalogIconPool } from './navigation-icon-pool.ts'
import { builtInIconType, navigationPointTypes } from './navigation-point-types.ts'

export function iconPosition(id: string): { atlas: number; column: number; row: number } {
  const match = /^unpack-map-(\d+)-(\d+)-(\d+)$/u.exec(id)
  const [atlas = NaN, column = NaN, row = NaN] = match?.slice(1).map(Number) ?? []
  return { atlas, column, row }
}

export function orderedIconCategories(categories: readonly NavigationIconCategory[]): NavigationIconCategory[] {
  return categories.map((category, index) => ({ category, order: category.order ?? index * 1024 }))
    .toSorted((a, b) => a.order - b.order).map(entry => entry.category)
}

export function categoryMoveOrder(categories: readonly NavigationIconCategory[], id: string, targetId: string, after: boolean): number | null {
  if (id === 'unclassified' || targetId === 'unclassified') return null
  if (id === targetId || !categories.some(category => category.id === id)) return null
  const ranked = new Map(categories.map((category, index) => [category.id, category.order ?? index * 1024]))
  const sorted = orderedIconCategories(categories).filter(category => category.id !== id && category.id !== 'unclassified')
  const target = sorted.findIndex(category => category.id === targetId)
  if (target < 0) return null
  const index = target + Number(after)
  const previous = sorted[index - 1], next = sorted[index]
  const lower = previous ? ranked.get(previous.id) : undefined
  const upper = next ? ranked.get(next.id) : undefined
  const order = lower === undefined ? (upper ?? 0) - 1024 : upper === undefined ? lower + 1024 : lower / 2 + upper / 2
  if (!Number.isFinite(order) || order === lower || order === upper) throw new Error('排序间隔不足，请先整理分类 order 数值')
  return order
}

export const managedNavigationIconSchema = z.object({
  id: z.string().regex(/^unpack-map-[1-4]-[1-9]\d?-[1-9]\d?$/u).refine((id) => {
    const { atlas, column, row } = iconPosition(id)
    return column <= (atlas <= 2 ? 13 : 12) && row <= 15
  }, '图标编号超出原始图集范围'),
  name: z.string().trim().max(200),
  url: z.url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'prod-alicdn-community.kurobbs.com' && !url.port && !url.username && !url.password && url.pathname.startsWith('/forum/') && !url.hash
  }, '需要库街区图片 CDN 地址'),
}).strict()

export const navigationIconCategorySchema = z.object({
  id: z.string().regex(/^(?:category-[a-z0-9-]+|unclassified)$/u).max(100),
  name: z.string().trim().min(1).max(100),
  order: z.number().finite().optional(),
  icons: z.array(z.object({ iconId: z.string().min(1) }).strict()).max(1000),
}).strict()

export const navigationIconLibrarySchema: z.ZodType<NavigationIconLibrary> = z.object({
  version: z.literal(1),
  placeholderUrl: managedNavigationIconSchema.shape.url,
  icons: z.array(managedNavigationIconSchema).min(1).max(750),
  categories: z.array(navigationIconCategorySchema).max(100),
  overrides: z.array(z.object({ id: z.string().min(1), name: z.string().trim().max(200).optional() }).strict()).max(1000),
}).strict().superRefine(({ icons, categories, overrides }, context) => {
  for (const type of Object.values(navigationPointTypes)) {
    if (type.builtIn && type.icons.some(id => ![...icons, ...officialIconPool].some(icon => icon.id === id))) context.addIssue({ code: 'custom', message: `${type.name}的内置图标不能删除` })
  }
  if (new Set(icons.map(({ id }) => id)).size !== icons.length) context.addIssue({ code: 'custom', message: '图标 ID 重复' })
  const ids = new Set(['icon-not-found', ...[...icons, ...officialIconPool, ...echoCatalogIconPool].map(icon => icon.id)])
  if (new Set(overrides.map(entry => entry.id)).size !== overrides.length || overrides.some(entry => !officialIconPool.some(icon => icon.id === entry.id))) context.addIssue({ code: 'custom', message: '来源图标设置重复或引用了未知图标' })
  if (new Set(categories.map(category => category.id)).size !== categories.length) context.addIssue({ code: 'custom', message: '分类 ID 重复' })
  if (new Set(categories.map(category => category.name)).size !== categories.length) context.addIssue({ code: 'custom', message: '分类名称重复' })
  const assigned = new Set<string>()
  for (const category of categories) {
    for (const { iconId } of category.icons) {
      if (category.id === 'category-special-boss' && !echoCatalogIconPool.some(icon => icon.id === iconId)) context.addIssue({ code: 'custom', message: '特殊 BOSS 只能添加 C1/C3 声骸图鉴图标' })
      if (iconId === 'icon-not-found' && category.id !== 'unclassified') context.addIssue({ code: 'custom', message: '图标未找到只能属于其它分类' })
      if ((builtInIconType(iconId)?.icons.length ?? 0) > 1) context.addIssue({ code: 'custom', message: '该图标属于内置类型，不能加入普通分类' })
      if (assigned.has(iconId)) context.addIssue({ code: 'custom', message: '每个图标只能加入一个分类' })
      assigned.add(iconId)
    }
    if (category.id === 'unclassified' && (category.name !== '其它' || category.order !== undefined)) context.addIssue({ code: 'custom', message: '其它名称和位置固定' })
    if (new Set(category.icons.map(icon => icon.iconId)).size !== category.icons.length) context.addIssue({ code: 'custom', message: '分类内图标重复' })
    if (category.icons.some(icon => !ids.has(icon.iconId))) context.addIssue({ code: 'custom', message: '分类引用了不存在的图标' })
  }
})

export function iconDisplayName(icon: Pick<ManagedNavigationIcon, 'id' | 'name'>): string {
  return icon.name.trim() || icon.id.replace(/^unpack-map-/u, '')
}

export function compareIconPosition(left: Pick<ManagedNavigationIcon, 'id'>, right: Pick<ManagedNavigationIcon, 'id'>): number {
  const a = iconPosition(left.id), b = iconPosition(right.id)
  if (!Number.isFinite(a.atlas) || !Number.isFinite(b.atlas)) return left.id.localeCompare(right.id, 'en', { numeric: true })
  return a.atlas - b.atlas || a.row - b.row || a.column - b.column
}

export function validateIconLibraryUpdate(value: unknown, current: NavigationIconLibrary): NavigationIconLibrary {
  const next = navigationIconLibrarySchema.parse(value)
  const ids = new Set(current.icons.map(({ id }) => id))
  if (next.icons.length !== ids.size || next.icons.some(({ id }) => !ids.has(id))) throw new Error('不能新增、删除或修改固定图标 ID')
  return { ...next, icons: next.icons.toSorted(compareIconPosition) }
}
