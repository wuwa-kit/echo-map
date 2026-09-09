import RegularShape from 'ol/style/RegularShape.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'

export function createEditorSelectionStyle(): Style {
  return new Style({
    // The selection halo is additive; the point artwork comes from the shared map renderer.
    image: new RegularShape({
      points: 4,
      radius: 37,
      declutterMode: 'none',
      stroke: new Stroke({ color: '#f0c477', width: 2, lineDash: [5, 4] }),
    }),
  })
}
