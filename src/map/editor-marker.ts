import RegularShape from 'ol/style/RegularShape.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import CircleStyle from 'ol/style/Circle.js'

export function createEditorArrivalStyle(): Style {
  return new Style({
    image: new CircleStyle({ radius: 9, stroke: new Stroke({ color: '#64e7ed', width: 3 }) }),
  })
}

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
