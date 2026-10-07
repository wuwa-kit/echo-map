import { calculateTileExtent, officialToMapCoordinate } from '../src/map/projection.ts'
import { readMapDataset, writeMapDataset } from './lib/map-data.ts'

// Rebuild derived geometry from retained source coordinates, without refetching assets.
const dataset = await readMapDataset()
await writeMapDataset({
  ...dataset,
  states: dataset.states.map((state) => ({ ...state, tileExtent: calculateTileExtent(state.tileIds) })),
  regionLabels: dataset.regionLabels.map((label) => ({
    ...label,
    coordinate: officialToMapCoordinate(label.coordinate.rawX, label.coordinate.rawY),
  })),
  echoLocations: dataset.echoLocations.map((point) => ({
    ...point,
    coordinate: officialToMapCoordinate(point.coordinate.rawX, point.coordinate.rawY),
  })),
})
