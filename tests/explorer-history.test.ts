import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  readLastExplorerQuery,
  restoreLastExplorerQuery,
  saveLastExplorerQuery,
} from '../src/url/explorer-history.ts'
import { createExplorerQueryValues, DEFAULT_STATE_ID } from '../src/url/explorer-url.ts'

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'explorer', component: {} },
      { path: '/assets', component: {} },
      { path: '/editor', component: {} },
    ],
  })
  router.beforeEach(restoreLastExplorerQuery)
  return router
}

describe('last explorer query', () => {
  let stored: string | null

  beforeEach(() => {
    stored = null
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('restores an empty homepage before it is entered and preserves the hash', async () => {
    saveLastExplorerQuery({ map: '9', echoes: '123', x: '10', y: '20', zoom: '3' })
    const router = createTestRouter()
    await router.push('/#map')
    expect(router.currentRoute.value.query).toEqual({ map: '9', echoes: '123', x: '10', y: '20', zoom: '3' })
    expect(router.currentRoute.value.hash).toBe('#map')
  })

  it.each(['/?map=8', '/?unknown=1', '/?map=', '/assets', '/editor'])(
    'does not fill or save parameters for %s', async (path) => {
      saveLastExplorerQuery({ map: '9', panel: '1' })
      const router = createTestRouter()
      await router.push(path)
      expect(router.currentRoute.value.fullPath).toBe(path)
      expect(readLastExplorerQuery()).toEqual({ map: '9', panel: '1' })
    },
  )

  it('skips query updates inside the homepage but restores when returning from another page', async () => {
    saveLastExplorerQuery({ map: '9' })
    const router = createTestRouter()
    await router.push('/?panel=1')
    await router.replace('/')
    expect(router.currentRoute.value.fullPath).toBe('/')
    await router.push('/editor')
    await router.push('/')
    expect(router.currentRoute.value.query).toEqual({ map: '9' })
  })

  it.each([null, '{}', 'broken JSON', '[]', '{"map":9}', '{"map":null}', '{"unknown":"1","map":" "}'])(
    'leaves the default homepage usable for empty or invalid storage: %s', async (value) => {
      stored = value
      const router = createTestRouter()
      await router.push('/')
      expect(router.currentRoute.value.fullPath).toBe('/')
    },
  )

  it('only restores supported query fields', () => {
    stored = '{"map":"9","unknown":"1","sources":"official"}'
    expect(readLastExplorerQuery()).toEqual({ map: '9' })
  })

  it('overwrites the previous snapshot when the full default state is saved', async () => {
    saveLastExplorerQuery({ map: '9', panel: '1' })
    saveLastExplorerQuery(createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      echoIds: [],
      sonataFilterIds: [],
      echoCostFilters: [],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      viewport: null,
    }))
    const router = createTestRouter()
    await router.push('/')
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(readLastExplorerQuery()).toEqual({})
  })

  it('continues without persistence when storage access fails', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage unavailable') },
      setItem: () => { throw new Error('Storage unavailable') },
    })
    expect(() => saveLastExplorerQuery({ map: '9' })).not.toThrow()
    const router = createTestRouter()
    await router.push('/')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
