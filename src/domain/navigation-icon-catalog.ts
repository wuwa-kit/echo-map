import libraryJson from '../../data/manual/navigation-icons.json' with { type: 'json' }
import mapBossJson from '../../data/generated/map-boss-icons.json' with { type: 'json' }
import { normalBossIcons } from './normal-boss-icons.ts'
import { navigationIconLibrarySchema, iconDisplayName } from './navigation-icon-library.ts'
import type { NavigationIconDefinition, NavigationIconLibrary } from './types.ts'
import { navigationIconPool } from './navigation-icon-pool.ts'

export const initialNavigationIconLibrary = navigationIconLibrarySchema.parse(libraryJson)
export const builtinBossGroups: readonly { id: string; name: string; icons: (NavigationIconDefinition & { source: 'map' | 'wiki' })[] }[] = [
  { id: 'normal-boss', name: '普通 BOSS', icons: normalBossIcons },
  { id: 'weekly-boss', name: '周本 BOSS', icons: mapBossJson.map(icon => ({ ...icon, source: 'map' as const })) },
]

export function buildNavigationIconCatalog(library: NavigationIconLibrary): NavigationIconDefinition[] {
  return [
    ...navigationIconPool(library).map(icon => ({ ...icon, name: iconDisplayName(icon) })),
  ]
}

export const navigationIconCatalog: readonly NavigationIconDefinition[] = buildNavigationIconCatalog(initialNavigationIconLibrary)
