import RegularShape from 'ol/style/RegularShape.js'
import Stroke from 'ol/style/Stroke.js'
import Style from 'ol/style/Style.js'
import CircleStyle from 'ol/style/Circle.js'
import Text from 'ol/style/Text.js'
import Fill from 'ol/style/Fill.js'

export function createEditorArrivalStyle(): Style {
  return new Style({
    image: new CircleStyle({ radius: 9, stroke: new Stroke({ color: '#64e7ed', width: 3 }) }),
  })
}

export function createEditorSelectionStyle(label = ''): Style {
  return new Style({
    text: new Text({ text: label, offsetY: -46, font: '12px sans-serif', fill: new Fill({ color: '#f0c477' }), stroke: new Stroke({ color: '#102019', width: 4 }) }),
    // The selection halo is additive; the point artwork comes from the shared map renderer.
    image: new RegularShape({
      points: 4,
      radius: 37,
      declutterMode: 'none',
      stroke: new Stroke({ color: '#f0c477', width: 2, lineDash: [5, 4] }),
    }),
  })
}
