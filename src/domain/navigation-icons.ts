import type { AuthoredNavigationPoint, NavigationIconDefinition, NavigationPointType } from './types.ts'
import { navigationPointTypes } from './navigation-point-types.ts'
import { navigationIconCatalog } from './navigation-icon-catalog.ts'

const iconsById = new Map(navigationIconCatalog.map((icon) => [icon.id, icon]))
const typedIconIds = new Set(Object.values(navigationPointTypes).flatMap(({ icons }) => icons))
const untypedIcons = navigationIconCatalog.filter(({ id }) => !typedIconIds.has(id))

export function navigationIconById(id: string | undefined): NavigationIconDefinition | undefined {
  return id ? iconsById.get(id) : undefined
}

export function navigationTypeIcons(pointType: NavigationPointType | undefined, search = '', recentIds: readonly string[] = []): readonly NavigationIconDefinition[] {
  const rule = pointType ? navigationPointTypes[pointType] : undefined
  const icons = rule?.icons.length
    ? rule.icons.flatMap((id) => {
      const icon = navigationIconById(id)
      return icon ? [icon] : []
    })
    : pointType ? navigationIconCatalog : untypedIcons
  const query = search.trim().toLocaleLowerCase()
  const filtered = query ? icons.filter(({ name }) => name.toLocaleLowerCase().includes(query)) : icons
  const recent = recentIds.flatMap((id) => {
    const icon = filtered.find((icon) => icon.id === id)
    return icon ? [icon] : []
  })
  return recent.length ? [...recent, ...filtered.filter(({ id }) => !recentIds.includes(id))] : filtered
}

export function navigationPointIconUrl(point: Pick<AuthoredNavigationPoint, 'iconId'>): string {
  return navigationIconById(point.iconId)?.url ?? ''
}
