import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const pointDetailsSourceUrl = new URL('../src/components/PointDetails.vue', import.meta.url)
const mapPointPopupSourceUrl = new URL('../src/components/MapPointPopup.vue', import.meta.url)
const echoPointMemberSourceUrl = new URL('../src/components/EchoPointMember.vue', import.meta.url)
const pointEditorSourceUrl = new URL('../src/views/PointEditorView.vue', import.meta.url)
const routeLegDetailsSourceUrl = new URL('../src/components/RouteLegDetails.vue', import.meta.url)
const mapCanvasSourceUrl = new URL('../src/components/MapCanvas.vue', import.meta.url)

describe('point detail hints', () => {
  it('omits provisional-height and inferred-arrival notices', async () => {
    const [detailsSource, popupSource, memberSource, editorSource] = await Promise.all([
      readFile(pointDetailsSourceUrl, 'utf8'),
      readFile(mapPointPopupSourceUrl, 'utf8'),
      readFile(echoPointMemberSourceUrl, 'utf8'),
      readFile(pointEditorSourceUrl, 'utf8'),
    ])

    expect(detailsSource).not.toContain('Z=0 为占位值')
    expect(detailsSource).not.toContain('传送落点未单独录入')
    expect(detailsSource).not.toContain('传送落点未录入')
    expect(detailsSource).not.toContain('navigationRouteCoordinate')
    expect(detailsSource).not.toContain("'点位详情'")
    expect(detailsSource).not.toContain('图标 XYZ')
    expect(detailsSource).not.toContain('图标点位未录入 XYZ')
    expect(detailsSource).toContain('selectedNavigationPoint.gameCoordinate')
    expect(detailsSource).toContain('`XYZ ${coordinate.x}, ${coordinate.y}, ${coordinate.z}`')
    expect(detailsSource).toContain('<MapPointPopup')
    expect(detailsSource).toContain('<EchoPointMember')
    expect(detailsSource).toContain('max-h-320px')
    expect(detailsSource).toContain('store.selectPointCandidate(candidate.point.id)')
    expect(detailsSource).toContain('store.returnToPointCandidates()')
    expect(detailsSource).toContain('navigationPointCandidates.value.map')
    expect(detailsSource).toContain("selectedNavigationPoint.mode === 'fast-travel'")
    expect(detailsSource).toContain('>可传送</span>')
    expect(detailsSource).not.toContain('<span>点位类型</span>')
    expect(popupSource).toContain('v-if="showBack"')
    expect(popupSource).toContain('<slot name="title" />')
    expect(popupSource).toContain('<slot />')
    expect(popupSource).toContain("$emit('back')")
    expect(popupSource).toContain("$emit('close')")
    expect(memberSource).toContain('`C${props.cost}`')
    expect(memberSource).toContain('`${props.count}只`')
    expect(editorSource).not.toContain('官方 · Z=0')
    expect(editorSource).not.toContain('Z=0 不代表实际高度')
    expect(editorSource).not.toContain('实际落点留空时按图标点位规划')
  })

  it('shows copyable route leg identifiers and XYZ after clicking a line', async () => {
    const [detailsSource, mapSource] = await Promise.all([
      readFile(routeLegDetailsSourceUrl, 'utf8'),
      readFile(mapCanvasSourceUrl, 'utf8'),
    ])

    expect(mapSource).toContain('routeLayer.hitTest(event.coordinate, resolution)')
    expect(mapSource).toContain('<RouteLegDetailsPopup')
    expect(detailsSource).toContain('details.debugId')
    expect(detailsSource).toContain('coordinateText(details.from)')
    expect(detailsSource).toContain('coordinateText(details.to)')
    expect(detailsSource).toContain('传送前目标')
    expect(detailsSource).toContain('复制调试数据')
    expect(detailsSource).toContain('routeLegDebugData(props.details)')
  })
})
