import { bindIconTestQuery, setIconTestQuery } from './fixtures/icon-query.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareIconPosition, iconDisplayName, iconPosition, managedNavigationIconSchema, navigationIconLibrarySchema, validateIconLibraryUpdate } from '../src/domain/navigation-icon-library.ts'
import { initialNavigationIconLibrary, navigationIconCatalog } from '../src/domain/navigation-icon-catalog.ts'
import { navigationIconById, navigationPickerIcons } from '../src/domain/navigation-icons.ts'
import { useNavigationIconLibraryStore } from '../src/stores/navigation-icon-library.ts'
import { useNavigationIconManagerStore } from '../src/stores/navigation-icon-manager.ts'
import { createNavigationIconRepository } from '../scripts/lib/navigation-icon-repository.ts'
import type { NavigationIconLibrary } from '../src/domain/types.ts'
import wiki from '../data/generated/wiki.json' with { type: 'json' }
import bossIcons from '../data/generated/wiki-boss-icons.json' with { type: 'json' }
import weeklyIcons from '../data/generated/map-boss-icons.json' with { type: 'json' }

beforeEach(() => { setActivePinia(createPinia()); bindIconTestQuery() })

describe('managed navigation icons', () => {
  it('keeps echo portraits in echo data and limits official navigation artwork to bosses', () => {
    const official = navigationIconCatalog.filter(icon => icon.source === 'wiki' || icon.source === 'map')
    expect(official.map(icon => icon.id).sort()).toEqual([...bossIcons, ...weeklyIcons].map(icon => icon.id).sort())
    for (const echo of wiki.echoes) {
      expect(echo.iconUrl).toMatch(/^https:\/\//u)
      expect(official.some(icon => icon.id === echo.id)).toBe(false)
    }
    for (const sonata of wiki.sonatas) {
      expect(sonata.iconUrl).toMatch(/^https:\/\//u)
      expect(official.some(icon => icon.id === sonata.id)).toBe(false)
    }
  })
  it.each(['unpack-map-2-3-13', 'unpack-map-3-3-2', 'unpack-map-4-3-1', 'unpack-map-4-6-3'])('protects built-in icon %s from removal', id => {
    const store = useNavigationIconLibraryStore()
    expect(() => store.importDraft({ ...store.draft, categories: [], icons: store.draft.icons.filter(icon => icon.id !== id) })).toThrow('内置图标')
  })
  it('validates decimal source IDs, bounds, duplicates and fixed membership', () => {
    expect(iconPosition('unpack-map-2-3-13')).toEqual({ atlas: 2, column: 3, row: 13 })
    for (const id of ['3-3-2', 'unpack-map-03-3-2', 'unpack-map-3-03-2', 'unpack-map-3-0-2', 'unpack-map-3-13-2', 'unpack-map-1-14-1', 'unpack-map-1-1-16', 'unpack-map-5-1-1']) {
      expect(managedNavigationIconSchema.shape.id.safeParse(id).success).toBe(false)
    }
    expect(managedNavigationIconSchema.shape.id.safeParse('unpack-map-2-3-13').success).toBe(true)
    const library: NavigationIconLibrary = { version: 1, overrides: [], categories: [], placeholderUrl: initialNavigationIconLibrary.placeholderUrl, icons: initialNavigationIconLibrary.icons.map(icon => ({ ...icon, name: '' })) }
    expect(iconDisplayName({ id: 'unpack-map-3-3-2', name: '' })).toBe('3-3-2')
    for (const id of ['03-3-2', '3-03-2', '3-0-2', '3-13-2', '1-14-1', '1-1-16', '5-1-1']) {
      expect(navigationIconLibrarySchema.safeParse({ ...library, icons: [{ ...library.icons[0], id }] }).success).toBe(false)
    }
    expect(() => validateIconLibraryUpdate({ ...library, icons: library.icons.filter(icon => icon.id !== 'unpack-map-3-4-4') }, library)).toThrow('固定图标 ID')
    expect(navigationIconLibrarySchema.safeParse({ ...library, icons: [...library.icons, ...library.icons] }).success).toBe(false)
    expect(['unpack-map-1-10-1', 'unpack-map-1-2-2', 'unpack-map-1-2-1'].map(id => ({ id })).sort(compareIconPosition).map(i => i.id)).toEqual(['unpack-map-1-2-1', 'unpack-map-1-10-1', 'unpack-map-1-2-2'])
  })

  it('renames through actions, falls back to ID, and keeps unnamed icons available without breaking references', () => {
    const store = useNavigationIconLibraryStore()
    store.rename('unpack-map-3-3-4', '自定义信标')
    expect(store.dirty).toBe(true)
    expect(navigationPickerIcons(undefined, '自定义信标', [], store.catalog)).toEqual([])
    store.accept(store.draft)
    expect(navigationPickerIcons('service', '自定义信标', [], store.catalog).map(i => i.id)).toEqual(['unpack-map-3-3-4'])
    store.rename('unpack-map-3-3-4', '   ')
    store.accept(store.draft)
    expect(store.catalog.find(i => i.id === 'unpack-map-3-3-4')?.name).toBe('3-3-4')
    expect(navigationPickerIcons(undefined, 'unpack-map-3-3-4', ['unpack-map-3-3-4'], store.catalog).map(icon => icon.id)).toEqual(['unpack-map-3-3-4'])
    expect(navigationIconById('unpack-map-3-3-4')?.url).toBe(initialNavigationIconLibrary.icons.find(icon => icon.id === 'unpack-map-3-3-4')?.url)
  })

  it('imports atomically, preserves valid selection and normalizes query fields', () => {
    const library = useNavigationIconLibraryStore()
    const manager = useNavigationIconManagerStore()
    setIconTestQuery({ atlas: '03', status: 'invalid', icon: 'bogus', background: 'invalid' })
    expect(manager.filters).toEqual({ view: 'categories', source: 'all', status: 'all', selectedId: null, category: 'all' })
    manager.select('unpack-map-3-3-2')
    manager.rename('同名图标')
    library.rename('unpack-map-2-3-13', '同名图标')
    expect(manager.duplicateName).toBe(true)
    manager.setSearch('unpack-map-2-3-13')
    expect(manager.filtered.map(i => i.id)).toEqual(['unpack-map-2-3-13'])
    const before = library.draft
    expect(() => library.importDraft({ version: 1, icons: [] })).toThrow()
    expect(library.draft).toBe(before)
    library.discard()
    expect(library.dirty).toBe(false)
  })

  it('keeps all custom sources on the CDN and all portraits in the Wiki catalogue', () => {
    expect(initialNavigationIconLibrary.icons).toHaveLength(351)
    expect(navigationIconCatalog.filter(i => i.source === 'unpacked').some(i => i.url.includes('web-static.kurobbs.com'))).toBe(false)
    expect(navigationIconCatalog.filter(i => i.source === 'wiki')).toHaveLength(33)
    expect(navigationIconCatalog.find(i => i.id === 'unpack-map-2-3-13')?.name).toBe('中枢信标')
  })

  it('saves atomically and rejects concurrent or invalid updates without losing the saved data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'navigation-icon-test-'))
    try {
      const path = join(dir, 'icons.json')
      const initial: NavigationIconLibrary = { version: 1, overrides: [], categories: [], placeholderUrl: initialNavigationIconLibrary.placeholderUrl, icons: initialNavigationIconLibrary.icons }
      await writeFile(path, JSON.stringify(initial))
      const repository = createNavigationIconRepository(path)
      const base = await repository.read()
      const renamed = { ...initial, icons: initial.icons.map((icon, index) => index === 0 ? { ...icon, name: '新的名称' } : icon), categories: [{ id: 'category-travel', name: '传送', icons: [{ iconId: 'unpack-map-3-3-2' }] }] }
      const results = await Promise.allSettled([repository.save(renamed, base.revision), repository.save(initial, base.revision)])
      expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
      const saved = await repository.read()
      expect(saved.library.icons[0]?.name).toBe('新的名称')
      expect(saved.library.categories).toEqual(renamed.categories)
      await expect(repository.save({ version: 1, icons: [] }, saved.revision)).rejects.toThrow()
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved.library)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
