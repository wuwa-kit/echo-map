import type Style from 'ol/style/Style.js'
import { gameScaleForResolution } from './map-scale.ts'

export function markerZoomScale(resolution: number): number {
  const scale = gameScaleForResolution(resolution)
  return Number.isFinite(scale) ? Math.max(1, Math.min(2, 1 / Math.sqrt(scale))) : 1
}

export function createMarkerZoomStyles() {
  const cache = new WeakMap<Style, { image: ReturnType<Style['getImage']>; style: Style }>()
  return (styles: Style | Style[] | undefined, resolution: number): Style | Style[] | undefined => {
    const factor = markerZoomScale(resolution)
    if (!styles || factor === 1) return styles
    function zoom(base: Style): Style {
      const image = base.getImage()
      if (!image) return base
      let entry = cache.get(base)
      if (!entry || entry.image !== image) {
        entry = { image, style: base.clone() }
        cache.set(base, entry)
      }
      const result = entry.style
      const scaled = result.getImage()
      const [x = 1, y = 1] = image.getScaleArray()
      const [dx = 0, dy = 0] = image.getDisplacement()
      scaled?.setScale([x * factor, y * factor])
      scaled?.setDisplacement([dx * factor, dy * factor])
      scaled?.setOpacity(image.getOpacity())
      result.setZIndex(base.getZIndex())
      const text = base.getText()
      const scaledText = result.getText()
      if (text && scaledText) {
        scaledText.setOffsetX(text.getOffsetX() * factor)
        scaledText.setOffsetY(text.getOffsetY() * factor)
      }
      return result
    }
    return Array.isArray(styles) ? styles.map(zoom) : zoom(styles)
  }
}
