import { useRouteQuery } from '@vueuse/router'
import { saveLastExplorerQuery } from '../url/explorer-history.ts'
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
  const mapQuery = useRouteQuery<string | undefined>('map', String(DEFAULT_STATE_ID))
  const regionQuery = useRouteQuery('region')
  const floorQuery = useRouteQuery<string | undefined>('floor', undefined, { mode: 'replace' })
  const floorStyleQuery = useRouteQuery<string | undefined>('floorStyle', 'icons', { mode: 'replace' })
  const gravityQuery = useRouteQuery<string | undefined>('gravity', undefined, { mode: 'replace' })
  const echoesQuery = useRouteQuery('echoes')
  const sonatasQuery = useRouteQuery('sonatas')
  const costsQuery = useRouteQuery<string | undefined>('costs', undefined, { mode: 'replace' })
  const provisionalQuery = useRouteQuery<string | undefined>('provisional', '1')
  const hideNonTeleportQuery = useRouteQuery<string | undefined>('hideNonTeleport', '0', { mode: 'replace' })
  const panelQuery = useRouteQuery<string | undefined>('panel', '0')
  const sheetQuery = useRouteQuery<string | undefined>('sheet', undefined, { mode: 'replace' })
  const xQuery = useRouteQuery('x')
  const yQuery = useRouteQuery('y')
  const zoomQuery = useRouteQuery('zoom')

  function read(): ExplorerUrlState {
    return parseExplorerQueryValues({
      map: mapQuery.value,
      region: regionQuery.value,
      floor: floorQuery.value,
      floorStyle: floorStyleQuery.value,
      gravity: gravityQuery.value,
      echoes: echoesQuery.value,
      sonatas: sonatasQuery.value,
      costs: costsQuery.value,
      provisional: provisionalQuery.value,
      hideNonTeleport: hideNonTeleportQuery.value,
      panel: panelQuery.value,
      sheet: sheetQuery.value,
      x: xQuery.value,
      y: yQuery.value,
      zoom: zoomQuery.value,
    })
  }

  function write(state: ExplorerUrlSnapshot): void {
    const values = createExplorerQueryValues(state)
    saveLastExplorerQuery(values)
    mapQuery.value = values.map
    regionQuery.value = values.region
    floorQuery.value = values.floor
    floorStyleQuery.value = values.floorStyle
    gravityQuery.value = values.gravity
    echoesQuery.value = values.echoes
    sonatasQuery.value = values.sonatas
    costsQuery.value = values.costs
    provisionalQuery.value = values.provisional
    hideNonTeleportQuery.value = values.hideNonTeleport
    panelQuery.value = values.panel
    sheetQuery.value = values.sheet
    xQuery.value = values.x
    yQuery.value = values.y
    zoomQuery.value = values.zoom
  }

  return { read, write }
}
