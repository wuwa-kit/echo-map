import { useRouteQuery } from '@vueuse/router'
import {
  createExplorerQueryValues,
  DEFAULT_STATE_ID,
  parseExplorerQueryValues,
} from '../url/explorer-url.ts'
import type { ExplorerUrlSnapshot, ExplorerUrlState } from '../url/explorer-url.ts'

export function useExplorerRouteQuery(): {
  read: () => ExplorerUrlState
  write: (state: ExplorerUrlSnapshot) => void
} {
  const sourcesQuery = useRouteQuery<string | undefined>('sources', undefined, { mode: 'replace' })
  const mapQuery = useRouteQuery<string | undefined>('map', String(DEFAULT_STATE_ID))
  const regionQuery = useRouteQuery('region')
  const floorQuery = useRouteQuery<string | undefined>('floor', undefined, { mode: 'replace' })
  const floorStyleQuery = useRouteQuery<string | undefined>('floorStyle', 'icons', { mode: 'replace' })
  const gravityQuery = useRouteQuery<string | undefined>('gravity', undefined, { mode: 'replace' })
  const echoesQuery = useRouteQuery('echoes')
  const sonatasQuery = useRouteQuery('sonatas')
  const costsQuery = useRouteQuery<string | undefined>('costs', undefined, { mode: 'replace' })
  const provisionalQuery = useRouteQuery<string | undefined>('provisional', '1')
  const panelQuery = useRouteQuery<string | undefined>('panel', '0')
  const sheetQuery = useRouteQuery<string | undefined>('sheet', undefined, { mode: 'replace' })
  const xQuery = useRouteQuery('x')
  const yQuery = useRouteQuery('y')
  const zoomQuery = useRouteQuery('zoom')

  function read(): ExplorerUrlState {
    return parseExplorerQueryValues({
      sources: sourcesQuery.value,
      map: mapQuery.value,
      region: regionQuery.value,
      floor: floorQuery.value,
      floorStyle: floorStyleQuery.value,
      gravity: gravityQuery.value,
      echoes: echoesQuery.value,
      sonatas: sonatasQuery.value,
      costs: costsQuery.value,
      provisional: provisionalQuery.value,
      panel: panelQuery.value,
      sheet: sheetQuery.value,
      x: xQuery.value,
      y: yQuery.value,
      zoom: zoomQuery.value,
    })
  }

  function write(state: ExplorerUrlSnapshot): void {
    const values = createExplorerQueryValues(state)
    sourcesQuery.value = values.sources
    mapQuery.value = values.map
    regionQuery.value = values.region
    floorQuery.value = values.floor
    floorStyleQuery.value = values.floorStyle
    gravityQuery.value = values.gravity
    echoesQuery.value = values.echoes
    sonatasQuery.value = values.sonatas
    costsQuery.value = values.costs
    provisionalQuery.value = values.provisional
    panelQuery.value = values.panel
    sheetQuery.value = values.sheet
    xQuery.value = values.x
    yQuery.value = values.y
    zoomQuery.value = values.zoom
  }

  return { read, write }
}
