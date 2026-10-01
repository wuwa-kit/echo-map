import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const pointEditorSourceUrl = new URL('../src/views/PointEditorView.vue', import.meta.url)
const pointEditorMapSourceUrl = new URL('../src/components/PointEditorMap.vue', import.meta.url)

describe('point editor progressive disclosure', () => {
  it('separates modes and keeps the library available beside the map', async () => {
    const source = await readFile(pointEditorSourceUrl, 'utf8')
    expect(source).toContain('lg:grid-cols-[260px_minmax(240px,1fr)_360px]')
    expect(source).toContain('声骸录入 · C1 / C3')
    expect(source).toContain('定位点维护')
    expect(source).toContain('@click="newPoint(editorMode)"')
    expect(source).not.toContain('newPopoverRef')
  })

  it('uses independent forms and keeps coordinate verification explicit', async () => {
    const source = await readFile(pointEditorSourceUrl, 'utf8')
    expect(source).toContain('<EchoEditorFields')
    expect(source).toContain('<NavigationEditorFields')
    expect(source).toContain('Z=0 为占位高度，尚未实测')
    expect(source).toContain('v-if="nearbyPoints.length || matchSettingsExpanded"')
    expect(source).toContain('v-if="!noteExpanded && !draft.note"')
  })

  it('uses the shared point renderer and map interaction defaults', async () => {
    const source = await readFile(pointEditorMapSourceUrl, 'utf8')

    expect(source).toContain("createPointLayers(() => {")
    expect(source).toContain("echoGrouping: 'individual'")
    expect(source).toContain('createMapView(state.value, projection)')
    expect(source).toContain('defaultControls({ attribution: false, rotate: false, zoom: false })')
    expect(source).toContain('defaultInteractions({ pinchRotate: false, altShiftDragRotate: false })')
    expect(source).toContain('mapFeaturesPointIds(map.getFeaturesAtPixel')
    expect(source).toContain('selectionLayer')
    expect(source).not.toContain('createEditorMarkerStyles')
    expect(source).not.toContain('declutter: true')
  })

  it('moves the shared map controls onto the editor canvas and removes the right-side location form', async () => {
    const [viewSource, mapSource] = await Promise.all([
      readFile(pointEditorSourceUrl, 'utf8'),
      readFile(pointEditorMapSourceUrl, 'utf8'),
    ])

    expect(mapSource).toContain('<MapNavigationCascader')
    expect(mapSource).toContain('<GravitySwitcher')
    expect(mapSource).toContain('<FloorSwitcher')
    expect(mapSource).toContain('<MapCoordinateDisplay :text="pointerCoordinateText" />')
    expect(viewSource).not.toContain('locationExpanded')
    expect(viewSource).not.toContain('locationSummary')
    expect(viewSource).not.toContain('>地图</div><WuSelect')
    expect(viewSource).toContain('@floor-layout-toggled="toggleFloorLayout"')
  })

  it('provides explicit point location without draft-driven viewport changes', async () => {
    const [viewSource, mapSource] = await Promise.all([
      readFile(pointEditorSourceUrl, 'utf8'),
      readFile(pointEditorMapSourceUrl, 'utf8'),
    ])

    expect(viewSource).toContain('@click="locateCurrentPoint"')
    expect(viewSource).toContain(':disabled="busy || !hasMapPosition"')
    expect(mapSource).toContain('defineExpose({ locateDraft })')
    expect(mapSource).not.toContain('focusDraft')
    expect(mapSource).not.toContain('watch([() => props.draft.id, () => props.draft.coordinate.x')
  })
})
