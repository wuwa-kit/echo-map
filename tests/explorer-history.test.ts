import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { readLastExplorerQuery, createExplorerEntryGuard, saveLastExplorerQuery } from '../src/url/explorer-history.ts'
import { useExplorerSessionStore } from '../src/stores/explorer-session.ts'
import { DEFAULT_STATE_ID, parseExplorerQueryValues } from '../src/url/explorer-url.ts'
import { resolveExplorerState } from '../src/url/resolve-explorer-state.ts'
import { readMapDataset } from '../scripts/lib/map-data.ts'

function setup() {
  const session = useExplorerSessionStore()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'explorer', component: {} }, { path: '/assets', component: {} }],
  })
  router.beforeResolve(createExplorerEntryGuard(session))
  return { router, session }
}

const defaultSnapshot = {
  stateId: DEFAULT_STATE_ID, countryId: null, levelId: null,
  echoIds: [], sonataFilterIds: [], echoCostFilters: [], showProvisional: true,
  hideNonTeleportPoints: false, controlPanelCollapsed: false, mobileSheet: null, viewport: null,
}

describe('local explorer session and share entry', () => {
  let stored: string | null
  beforeEach(() => {
    setActivePinia(createPinia())
    stored = null
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('restores local state without writing it into the address bar', async () => {
    saveLastExplorerQuery({ map: '9', canvasScale: '75', mode: 'edit', editorTab: 'echo' })
    const { router, session } = setup()
    await router.push('/')
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(session.query).toMatchObject({ map: '9', canvasScale: '75' })
    expect(session.settings).toMatchObject({ mode: 'edit', editorTab: 'echo' })
  })

  it('replaces rather than merges a shared snapshot and removes its query and hash', async () => {
    saveLastExplorerQuery({ map: '9', echoes: '123', panel: '1', mode: 'edit' })
    const { router, session } = setup()
    await router.push('/?map=8&canvasScale=80&unknown=1#map')
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(readLastExplorerQuery()).toEqual({ map: '8', canvasScale: '80' })
    expect(session.settings.mode).toBe('use')
    expect(session.revision).toBe(1)
  })

  it('imports links while already on the homepage and when returning from another page', async () => {
    const { router, session } = setup()
    await router.push('/')
    await router.push('/?share=1&canvasScale=85')
    expect(session.query).toEqual({ canvasScale: '85' })
    expect(router.currentRoute.value.fullPath).toBe('/')
    await router.push('/assets?asset=one')
    expect(router.currentRoute.value.fullPath).toBe('/assets?asset=one')
    await router.push('/')
    expect(session.query.canvasScale).toBe('85')
    await router.push('/assets')
    await router.push('/?map=9')
    expect(session.query).toEqual({ map: '9' })
    expect(session.revision).toBe(2)
  })

  it.each(['/?unknown=1', '/#map'])('cleans %s without overwriting local state', async path => {
    saveLastExplorerQuery({ map: '9' })
    const { router, session } = setup()
    await router.push(path)
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(session.query).toEqual({ map: '9' })
  })

  it('shares default state explicitly so recipients can replace their saved filters', async () => {
    const { router, session } = setup()
    await router.push('/')
    const href = router.resolve({ path: '/', query: session.shareQuery(defaultSnapshot) }).href
    expect(href).toBe('/?share=1')
    session.importQuery({ map: '9', panel: '1', mode: 'edit' })
    await router.push(href)
    expect(readLastExplorerQuery()).toEqual({})
    expect(session.settings.mode).toBe('use')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('persists map and editor changes and shares current state without navigating', async () => {
    const { router, session } = setup()
    await router.push('/')
    session.setSetting('mode', 'edit')
    session.setSetting('editorTab', 'echo')
    session.setSetting('pointsManager', 'open')
    session.saveMap({ ...defaultSnapshot, canvasScale: 95 })
    const query = session.shareQuery({ ...defaultSnapshot, canvasScale: 80 })
    expect(query).toMatchObject({ share: '1', mode: 'edit', editorTab: 'echo', pointsManager: 'open', canvasScale: '80' })
    expect(readLastExplorerQuery()).toMatchObject({ canvasScale: '95', mode: 'edit', editorTab: 'echo' })
    expect(router.currentRoute.value.fullPath).toBe('/')
    setActivePinia(createPinia())
    const reloaded = useExplorerSessionStore()
    reloaded.initialize()
    expect(reloaded.query.canvasScale).toBe('95')
    expect(reloaded.settings.editorTab).toBe('echo')
  })

  it('validates imported state against the dataset and saves the normalized snapshot', async () => {
    const { router, session } = setup()
    await router.push('/?share=1&map=999999&floor=unknown&echoes=999999&canvasScale=0&zoom=Infinity&mode=invalid&editorTab=invalid&pointsMap=unknown&editorSonatas=unknown&editorCosts=1,2,3')
    const dataset = await readMapDataset()
    session.validateSettings(dataset)
    const resolved = resolveExplorerState(dataset, parseExplorerQueryValues(session.query), DEFAULT_STATE_ID)
    session.saveMap(resolved)
    expect(resolved).toMatchObject({ stateId: DEFAULT_STATE_ID, levelId: null, canvasScale: 100, echoIds: [], viewport: null })
    expect(session.settings).toMatchObject({ mode: 'use', editorTab: 'navigation', pointsMap: '', editorSonatas: '', editorCosts: '1,3' })
    expect(readLastExplorerQuery()).toEqual({ editorCosts: '1,3' })
  })

  it.each([null, '{}', 'broken JSON', '[]', '{"map":9}', '{"map":null}'])(
    'falls back to defaults for invalid storage: %s', async value => {
      stored = value
      const { router, session } = setup()
      await router.push('/')
      expect(router.currentRoute.value.fullPath).toBe('/')
      expect(session.query).toEqual({})
    },
  )

  it('keeps imported state in memory when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage unavailable') },
      setItem: () => { throw new Error('Storage unavailable') },
    })
    const { router, session } = setup()
    await router.push('/?canvasScale=75&mode=edit')
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(session.query.canvasScale).toBe('75')
    session.saveMap({ ...defaultSnapshot, canvasScale: 80 })
    session.setSetting('editorTab', 'echo')
    expect(session.query).toMatchObject({ canvasScale: '80', mode: 'edit', editorTab: 'echo' })
  })

  it('does not import a navigation rejected by another guard', async () => {
    const { router, session } = setup()
    await router.push('/')
    router.beforeEach(to => to.query.share ? false : undefined)
    await router.push('/?share=1&map=9')
    expect(session.revision).toBe(0)
    expect(session.query).toEqual({})
  })
})
