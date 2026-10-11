import { describe, expect, it } from 'vitest'
import Style from 'ol/style/Style.js'
import CircleStyle from 'ol/style/Circle.js'
import Text from 'ol/style/Text.js'
import { createMarkerZoomStyles, markerZoomScale } from '../src/map/marker-zoom.ts'

describe('near-view marker scaling', () => {
  it.each([[4, 1], [1, 1], [0.5, Math.SQRT2], [0.25, 2], [0.01, 2], [0, 1], [NaN, 1]])('scales resolution %s to %s', (resolution, expected) => {
    expect(markerZoomScale(resolution)).toBeCloseTo(expected)
  })

  it('scales artwork, badge displacement and label offsets without mutating shared styles', () => {
    const image = new CircleStyle({ radius: 10, scale: [0.5, 0.75], displacement: [8, -6] })
    const base = new Style({ image, text: new Text({ text: '编辑中', offsetY: -46 }), zIndex: 12 })
    const zoom = createMarkerZoomStyles()
    const enlarged = zoom(base, 0.25)
    expect(enlarged).toBeInstanceOf(Style)
    if (!(enlarged instanceof Style)) throw new Error('需要点位样式')
    expect(enlarged.getImage()?.getScaleArray()).toEqual([1, 1.5])
    expect(enlarged.getImage()?.getDisplacement()).toEqual([16, -12])
    expect(enlarged.getText()?.getOffsetY()).toBe(-92)
    expect(enlarged.getZIndex()).toBe(12)
    expect(image.getScaleArray()).toEqual([0.5, 0.75])
    expect(zoom(base, 0.25)).toBe(enlarged)
    expect(enlarged.getImage()?.getScaleArray()).toEqual([1, 1.5])
    expect(zoom(base, 1)).toBe(base)
    base.setImage(new CircleStyle({ radius: 15, scale: 0.4 }))
    expect(zoom(base, 0.25)).not.toBe(enlarged)
    const label = new Style({ text: new Text({ text: '地名' }) })
    expect(zoom(label, 0.25)).toBe(label)
  })
})
