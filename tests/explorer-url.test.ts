import { describe, expect, it } from 'vitest'
import {
  createExplorerQueryValues,
  DEFAULT_ROUTE_Z_WEIGHT,
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
      sonataIds: [],
      hiddenPointGroupIds: [],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      routeZWeight: DEFAULT_ROUTE_Z_WEIGHT,
      viewport: null,
    })

    expect(Object.values(values).every((value) => value === undefined)).toBe(true)
  })

  it('parses hook defaults and a complete viewport', () => {
    expect(parseExplorerQueryValues({
      map: String(DEFAULT_STATE_ID),
      hiddenTypes: 'IconMap_WYQ,CS_02,IconMap_WYQ',
      provisional: '1',
      panel: '0',
      height: String(DEFAULT_ROUTE_Z_WEIGHT),
      x: '3072',
      y: '-1536',
      zoom: '1.3785',
    })).toMatchObject({
      stateId: DEFAULT_STATE_ID,
      hiddenPointGroupIds: ['IconMap_WYQ', 'CS_02'],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      routeZWeight: DEFAULT_ROUTE_Z_WEIGHT,
      viewport: { center: [3072, -1536], zoom: 1.3785 },
    })
  })

  it('round-trips the compact floor layout and ignores unknown styles', () => {
    const snapshot = {
      stateId: DEFAULT_STATE_ID, countryId: null, levelId: '-1/58', compactFloors: true,
      echoIds: [], sonataIds: [], hiddenPointGroupIds: [], showProvisional: true,
      controlPanelCollapsed: false, mobileSheet: null, routeZWeight: DEFAULT_ROUTE_Z_WEIGHT, viewport: null,
    }
    const query = createExplorerQueryValues(snapshot)
    expect(query.floorStyle).toBe('icons')
    expect(parseExplorerQueryValues(query)).toMatchObject({ compactFloors: true, levelId: '-1/58' })
    expect(createExplorerQueryValues({ ...snapshot, compactFloors: false }).floorStyle).toBeUndefined()
    for (const floorStyle of [undefined, null, '', 'list', 'unknown', '1']) {
      expect(parseExplorerQueryValues({ floorStyle }).compactFloors).toBe(false)
    }
  })

  it('serializes only hidden point groups in stable order', () => {
    const values = createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      echoIds: [],
      sonataIds: [],
      hiddenPointGroupIds: ['IconMap_WYQ', 'CS_02'],
      showProvisional: true,
      controlPanelCollapsed: false,
      mobileSheet: null,
      routeZWeight: DEFAULT_ROUTE_Z_WEIGHT,
      viewport: null,
    })

    expect(values.hiddenTypes).toBe('CS_02,IconMap_WYQ')
  })

  it.each(['filters', 'route'] as const)('round-trips the %s sheet without changing the desktop panel preference', (mobileSheet) => {
    const query = createExplorerQueryValues({
      stateId: DEFAULT_STATE_ID,
      countryId: null,
      levelId: null,
      echoIds: [],
      sonataIds: [],
      hiddenPointGroupIds: [],
      showProvisional: true,
      controlPanelCollapsed: true,
      mobileSheet,
      routeZWeight: DEFAULT_ROUTE_Z_WEIGHT,
      viewport: null,
    })
    expect(query.sheet).toBe(mobileSheet)
    expect(query.panel).toBe('1')
    expect(parseExplorerQueryValues(query)).toMatchObject({ mobileSheet, controlPanelCollapsed: true })
  })

  it.each([undefined, null, '', 'unknown', '1'])('ignores invalid or missing sheet values: %s', (sheet) => {
    expect(parseExplorerQueryValues({ sheet, panel: '1' })).toMatchObject({
      mobileSheet: null,
      controlPanelCollapsed: true,
    })
  })
})
