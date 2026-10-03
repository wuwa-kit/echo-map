import type { AuthoredNavigationPoint, NavigationIconDefinition, NavigationPointType } from './types.ts'
import { navigationPointTypes } from './navigation-point-types.ts'
import { navigationIconCatalog } from './navigation-icon-catalog.ts'

const iconsById = new Map(navigationIconCatalog.map((icon) => [icon.id, icon]))

export function navigationIconById(id: string | undefined): NavigationIconDefinition | undefined {
  return id ? iconsById.get(id) : undefined
}

export function navigationTypeIcons(pointType: NavigationPointType | undefined, search = ''): readonly NavigationIconDefinition[] {
  const rule = pointType ? navigationPointTypes[pointType] : undefined
  const icons = rule?.icons.length
    ? rule.icons.flatMap((id) => {
      const icon = navigationIconById(id)
      return icon ? [icon] : []
    })
    : navigationIconCatalog
  const query = search.trim().toLocaleLowerCase()
  return query ? icons.filter(({ name }) => name.toLocaleLowerCase().includes(query)) : icons
}

export function navigationPointIconUrl(point: Pick<AuthoredNavigationPoint, 'iconId' | 'iconUrl'>): string {
  return navigationIconById(point.iconId)?.url ?? point.iconUrl ?? ''
}
