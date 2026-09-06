import Style from 'ol/style/Style.js'
import RegularShape from 'ol/style/RegularShape.js'
import Fill from 'ol/style/Fill.js'
import Stroke from 'ol/style/Stroke.js'
import type { AuthoredPoint, EchoDefinition } from '../domain/types.ts'
import { createEchoMarkerStyles } from './echo-marker.ts'

export function createEditorMarkerStyles(onChange: () => void) {
  const icons = createEchoMarkerStyles(onChange)
  const navigation = new Style({
    image: new RegularShape({ points: 4, radius: 10, fill: new Fill({ color: '#75d8ba' }), stroke: new Stroke({ color: '#ecfff5', width: 2 }) }),
  })
  const selection = new Style({
    // The outline must not compete with its own portrait in the layer's declutter tree.
    image: new RegularShape({ points: 4, radius: 37, declutterMode: 'none', stroke: new Stroke({ color: '#f0c477', width: 2, lineDash: [5, 4] }) }),
  })

  function get(point: AuthoredPoint, echoes: readonly EchoDefinition[], selected: boolean): Style[] {
    const styles = point.kind === 'echo' ? icons.get(point.members, echoes).styles : [navigation]
    return selected ? [selection, ...styles] : styles
  }

  return { get, dispose: icons.dispose }
}
