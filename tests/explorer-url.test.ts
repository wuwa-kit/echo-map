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
      echoIds: [],
      sonataIds: [],
      hiddenPointGroupIds: [],
      showProvisional: true,
      controlPanelCollapsed: false,
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
      routeZWeight: DEFAULT_ROUTE_Z_WEIGHT,
      viewport: { center: [3072, -1536], zoom: 1.3785 },
    })
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
      routeZWeight: DEFAULT_ROUTE_Z_WEIGHT,
      viewport: null,
    })

    expect(values.hiddenTypes).toBe('CS_02,IconMap_WYQ')
  })
})
