import { wiki, weeklyBossIcons } from '../data/static-data.ts'
import { normalBossIcons } from './normal-boss-icons.ts'
import type { NavigationIconLibrary, ManagedNavigationIcon } from './types.ts'

export const iconSources = [{ id: 'placeholder', name: '内置图标' }, { id: 'map', name: '官方地图' }, { id: 'wiki', name: '官方 Wiki' }, { id: 'echo-catalog', name: '声骸图鉴' }, { id: 'unpacked', name: '解包资源' }] as const
export type IconSource = typeof iconSources[number]['id']
export const officialIconPool: (ManagedNavigationIcon & { source: IconSource })[] = [
  ...weeklyBossIcons.map(icon => ({ ...icon, source: 'map' as const })),
  ...normalBossIcons,
]
export const echoCatalogIconPool = wiki.echoes.filter(echo => (echo.cost === 1 || echo.cost === 3) && echo.sonataIds.length > 0)
  .map(echo => ({ id: echo.id, name: echo.name, url: echo.iconUrl, source: 'echo-catalog' as const }))
export const echoCatalogCosts = new Map(wiki.echoes.map(echo => [echo.id, echo.cost]))

export function navigationIconPool(library: NavigationIconLibrary): (ManagedNavigationIcon & { source: IconSource })[] {
  return [
    { id: 'icon-not-found', name: '图标未找到', url: library.placeholderUrl, source: 'placeholder' },
    ...echoCatalogIconPool,
    ...library.icons.map(icon => ({ ...icon, source: 'unpacked' as const })),
    ...officialIconPool.map(icon => ({ ...icon, ...library.overrides.find(entry => entry.id === icon.id) })),
  ]
}
