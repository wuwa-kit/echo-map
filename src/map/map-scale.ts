// One game coordinate unit per CSS pixel at zoom 0, independent of the base map.
export const MAP_RESOLUTION_AT_ZOOM_ZERO = 1

export function gameScaleForResolution(resolution: number): number {
  return Number.isFinite(resolution) && resolution > 0
    ? resolution / MAP_RESOLUTION_AT_ZOOM_ZERO : Number.NaN
}

export function mapResolutionForScale(gameUnitsPerPixel: number): number {
  return Number.isFinite(gameUnitsPerPixel) && gameUnitsPerPixel > 0
    ? gameUnitsPerPixel * MAP_RESOLUTION_AT_ZOOM_ZERO : Number.NaN
}

export function mapZoomForResolution(resolution: number): number {
  return -Math.log2(gameScaleForResolution(resolution))
}

export function mapResolutionForZoom(zoom: number): number {
  return Number.isFinite(zoom) ? mapResolutionForScale(2 ** -zoom) : Number.NaN
}
