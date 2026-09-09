import { describe, expect, it } from 'vitest'
import {
  createExplorerQueryValues,
  DEFAULT_STATE_ID,
  parseExplorerQueryValues,
} from '../src/url/explorer-url.ts'

describe('explorer query state', () => {
  it('omits every field for the default page state', () => {
    const values = createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      compactFloors: false,
      echoIds: [],
      sonataFilterIds: [],
      echoCostFilters: [],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      viewport: null,
    })

    expect(Object.values(values).every((value) => value === undefined)).toBe(true)
  })

  it('parses hook defaults and a complete viewport', () => {
    expect(parseExplorerQueryValues({
      map: String(DEFAULT_STATE_ID),
      provisional: '1',
      panel: '0',
      x: '3072',
      y: '-1536',
      zoom: '1.3785',
    })).toMatchObject({
      stateId: DEFAULT_STATE_ID,
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      viewport: { center: [3072, -1536], zoom: 1.3785 },
    })
  })

  it('round-trips the compact floor layout and ignores unknown styles', () => {
    const snapshot = {
      stateId: DEFAULT_STATE_ID, countryId: null, levelId: '-1/58', compactFloors: true,
      echoIds: [], sonataFilterIds: [], echoCostFilters: [], showProvisional: true,
      controlPanelCollapsed: false, mobileSheet: null, viewport: null,
    }
    const query = createExplorerQueryValues(snapshot)
    expect(query.floorStyle).toBe('icons')
    expect(parseExplorerQueryValues(query)).toMatchObject({ compactFloors: true, levelId: '-1/58' })
    expect(createExplorerQueryValues({ ...snapshot, compactFloors: false }).floorStyle).toBeUndefined()
    for (const floorStyle of [undefined, null, '', 'list', 'unknown', '1']) {
      expect(parseExplorerQueryValues({ floorStyle }).compactFloors).toBe(false)
    }
  })

  it('round-trips the combined filters and route sheet without changing the desktop panel preference', () => {
    const mobileSheet = 'filters' as const
    const query = createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      echoIds: [],
      sonataFilterIds: [],
      echoCostFilters: [],
      showProvisional: true,
      controlPanelCollapsed: true,
      mobileSheet,
      viewport: null,
    })
    expect(query.sheet).toBe(mobileSheet)
    expect(query.panel).toBe('1')
    expect(parseExplorerQueryValues(query)).toMatchObject({ mobileSheet, controlPanelCollapsed: true })
  })

  it.each([undefined, null, '', 'route', 'unknown', '1'])('ignores invalid or missing sheet values: %s', (sheet) => {
    expect(parseExplorerQueryValues({ sheet, panel: '1' })).toMatchObject({
      mobileSheet: null,
      controlPanelCollapsed: true,
    })
  })

  it('round-trips candidate filters independently from selected targets', () => {
    const query = createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      echoIds: ['wiki-echo-11105'],
      sonataFilterIds: ['wiki-sonata-11947', 'wiki-sonata-11948'],
      echoCostFilters: [1, 3],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      viewport: null,
    })

    expect(query).toMatchObject({ echoes: '11105', sonatas: '11947,11948', costs: '1,3' })
    expect(parseExplorerQueryValues(query)).toMatchObject({
      echoIds: ['wiki-echo-11105'],
      sonataFilterIds: ['wiki-sonata-11947', 'wiki-sonata-11948'],
      echoCostFilters: [1, 3],
    })
    expect(parseExplorerQueryValues({ costs: '2,3,3' }).echoCostFilters).toEqual([3])
  })

  it('ignores invalid and obsolete long-form wiki IDs', () => {
    expect(parseExplorerQueryValues({ echoes: '11105,wiki-echo-19910,unknown,11105' }).echoIds)
      .toEqual(['wiki-echo-11105'])
    expect(parseExplorerQueryValues({ sonatas: '11947,wiki-sonata-11948,unknown,11947' }).sonataFilterIds)
      .toEqual(['wiki-sonata-11947'])
    expect(createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      echoIds: ['unknown-echo'],
      sonataFilterIds: ['unknown-sonata'],
      echoCostFilters: [],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      viewport: null,
    })).toMatchObject({ echoes: undefined, sonatas: undefined })
  })
})
