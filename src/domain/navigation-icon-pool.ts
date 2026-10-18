import mapIcons from '../../data/generated/map-boss-icons.json' with { type: 'json' }
import wikiBossIcons from '../../data/generated/wiki-boss-icons.json' with { type: 'json' }
import type { NavigationIconLibrary, ManagedNavigationIcon } from './types.ts'

export const iconSources = [{ id: 'placeholder', name: '内置图标' }, { id: 'map', name: '官方地图' }, { id: 'wiki', name: '官方 Wiki' }, { id: 'unpacked', name: '解包资源' }] as const
export type IconSource = typeof iconSources[number]['id']
export const officialIconPool: (ManagedNavigationIcon & { source: IconSource })[] = [
  ...mapIcons.map(icon => ({ ...icon, source: 'map' as const })),
  ...wikiBossIcons.map(icon => ({ ...icon, source: 'wiki' as const })),
]
export function navigationIconPool(library: NavigationIconLibrary): (ManagedNavigationIcon & { source: IconSource })[] {
  return [
    { id: 'icon-not-found', name: '图标未找到', url: library.placeholderUrl, source: 'placeholder' },
    ...library.icons.map(icon => ({ ...icon, source: 'unpacked' as const })),
    ...officialIconPool.map(icon => ({ ...icon, ...library.overrides.find(entry => entry.id === icon.id) })),
  ]
}
