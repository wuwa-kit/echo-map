import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const pointEditorSourceUrl = new URL('../src/views/PointEditorView.vue', import.meta.url)
const pointEditorMapSourceUrl = new URL('../src/components/PointEditorMap.vue', import.meta.url)

describe('point editor progressive disclosure', () => {
  it('keeps the left rail narrow and opens the library in a popover', async () => {
    const source = await readFile(pointEditorSourceUrl, 'utf8')

    expect(source).toContain('lg:grid-cols-[72px_minmax(240px,1fr)_340px]')
    expect(source).toContain('ref="libraryPopoverRef"')
    expect(source).toContain('@click="openLibrary"')
    expect(source).toContain('ref="newPopoverRef"')
  })

  it('reveals secondary editing controls only when needed', async () => {
    const source = await readFile(pointEditorSourceUrl, 'utf8')

    expect(source).toContain("draft.kind === 'echo' && (nearbyPoints.length || matchSettingsExpanded)")
    expect(source).toContain('v-if="membersExpanded"')
    expect(source).toContain('v-if="navigationExpanded"')
    expect(source).toContain('v-if="!noteExpanded && !draft.note"')
    expect(source).toContain('ref="morePopoverRef"')
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
})
