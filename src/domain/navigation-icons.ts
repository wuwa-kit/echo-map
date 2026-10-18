import type { AuthoredNavigationPoint, NavigationIconDefinition, NavigationPointType, NavigationIconLibrary } from './types.ts'
import { navigationPointTypes } from './navigation-point-types.ts'
import { navigationIconCatalog } from './navigation-icon-catalog.ts'
import { orderedIconCategories } from './navigation-icon-library.ts'

export function navigationIconById(id: string | undefined): NavigationIconDefinition | undefined {
  return id ? navigationIconCatalog.find(icon => icon.id === id) : undefined
}

export function navigationTypeIcons(pointType: NavigationPointType | undefined, search = '', recentIds: readonly string[] = [], catalog = navigationIconCatalog): readonly NavigationIconDefinition[] {
  const rule = pointType ? navigationPointTypes[pointType] : undefined
  const typed = new Set(Object.values(navigationPointTypes).flatMap(type => type.icons))
  const ids = rule?.icons.length ? new Set(rule.icons) : null
  const scoped = ids ? (rule?.icons ?? []).flatMap(id => {
    const icon = catalog.find(icon => icon.id === id)
    return icon ? [icon] : []
  }) : catalog.filter(icon => pointType ? true : !typed.has(icon.id))
  return navigationPickerIcons(pointType, search, recentIds, scoped)
}

export function navigationPickerIcons(pointType: NavigationPointType | undefined, search = '', recentIds: readonly string[] = [], catalog = navigationIconCatalog): readonly NavigationIconDefinition[] {
  const rule = pointType ? navigationPointTypes[pointType] : undefined
  const available = catalog
  const preferred = new Set(rule?.icons ?? [])
  const icons = [...available.filter(icon => preferred.has(icon.id)), ...available.filter(icon => !preferred.has(icon.id))]
  const query = search.trim().toLocaleLowerCase()
  const filtered = query ? icons.filter(({ name, id }) => `${name} ${id}`.toLocaleLowerCase().includes(query)) : icons
  const recent = recentIds.flatMap((id) => {
    const icon = filtered.find((icon) => icon.id === id)
    return icon ? [icon] : []
  })
  return recent.length ? [...recent, ...filtered.filter(({ id }) => !recentIds.includes(id))] : filtered
}

export function navigationPointIconUrl(point: Pick<AuthoredNavigationPoint, 'iconId'>): string {
  return navigationIconById(point.iconId)?.url ?? ''
}

export function navigationPickerGroups(library: NavigationIconLibrary, catalog: readonly NavigationIconDefinition[], pointType?: NavigationPointType, search = '', recentIds: readonly string[] = []) {
  const byId = new Map(catalog.map(icon => [icon.id, icon]))
  const rule = pointType ? navigationPointTypes[pointType] : undefined
  if (rule?.builtIn) return [{ id: pointType, name: rule.name, icons: navigationTypeIcons(pointType, search, recentIds, catalog) }]
  const groups = [
    ...orderedIconCategories(library.categories).map(category => ({ id: category.id, name: category.name, icons: category.icons.flatMap(member => {
      const icon = byId.get(member.iconId)
      return icon ? [icon] : []
    }) })),
    { id: 'placeholder', name: '其他', icons: catalog.filter(icon => icon.source === 'placeholder') },
  ]
  const query = search.trim().toLocaleLowerCase()
  return groups.map(group => ({ ...group, icons: navigationPickerIcons(pointType, '', recentIds, group.icons).filter(icon =>
    !query || `${group.name} ${icon.name} ${byId.get(icon.id)?.name ?? ''} ${icon.id}`.toLocaleLowerCase().includes(query),
  ) })).filter(group => group.icons.length)
}
