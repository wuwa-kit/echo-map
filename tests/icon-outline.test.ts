import { afterEach, describe, expect, it, vi } from 'vitest'
import Icon from 'ol/style/Icon.js'
import ImageState from 'ol/ImageState.js'
import { alphaOutline, createIconOutlineCache } from '../src/map/icon-outline.ts'

let imageId = 0
class LoadedImage {
  width = 8
  height = 8
  complete = true
  src = `outline-${imageId++}`
}

function pixels() {
  const data = new Uint8ClampedArray(8 * 8 * 4)
  for (let y = 2; y < 6; y += 1) {
    for (let x = 2; x < 6; x += 1) {
      if (x === 2 || x === 5 || y === 2 || y === 5) data[(y * 8 + x) * 4 + 3] = 255
    }
  }
  // Faint halo at the image edges must not inflate the visible outline.
  data[3] = 31
  data[data.length - 1] = 31
  return { width: 8, height: 8, data }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('visible icon outline', () => {
  it('ignores transparent margins and faint halos while covering hollow artwork', () => {
    expect(alphaOutline(pixels())).toEqual([[2, 2], [6, 2], [6, 6], [2, 6]])
  })

  it('keeps the occupied pixel area and handles empty artwork', () => {
    const data = new Uint8ClampedArray(16)
    expect(alphaOutline({ width: 2, height: 2, data })).toEqual([])
    data[3] = 32
    expect(alphaOutline({ width: 2, height: 2, data })).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]])
  })

  it('reads each loaded image once regardless of scale or display opacity', () => {
    vi.stubGlobal('Image', LoadedImage)
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => pixels()) }
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
    const image = new Image()
    const icon = new Icon({ img: image, scale: 0.28, opacity: 0.48 })
    const cache = createIconOutlineCache()
    const outline = cache.get(icon)
    expect(outline).toEqual([[2, 2], [6, 2], [6, 6], [2, 6]])
    icon.setScale(2)
    icon.setOpacity(1)
    expect(cache.get(icon)).toBe(outline)
    expect(cache.get(new Icon({ img: image }))).toBe(outline)
    expect(context.getImageData).toHaveBeenCalledTimes(1)
    cache.dispose()
  })

  it('does not cache the loading fallback and caches a CORS failure only for that image', () => {
    vi.stubGlobal('Image', LoadedImage)
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => pixels()) }
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
    const icon = new Icon({ img: new Image() })
    const state = vi.spyOn(icon, 'getImageState').mockReturnValue(ImageState.LOADING)
    const cache = createIconOutlineCache()
    expect(cache.get(icon)).toBeNull()
    expect(context.getImageData).not.toHaveBeenCalled()
    state.mockReturnValue(ImageState.LOADED)
    context.getImageData.mockImplementationOnce(() => { throw new DOMException('Blocked pixels', 'SecurityError') })
    expect(cache.get(icon)).toBeNull()
    expect(cache.get(icon)).toBeNull()
    expect(context.getImageData).toHaveBeenCalledTimes(1)
    expect(cache.get(new Icon({ img: new Image() }))).toEqual([[2, 2], [6, 2], [6, 6], [2, 6]])
    cache.dispose()
  })
})
