import { abortable, createRouteExportRenderer } from '../map/route-export.ts'
import type { RouteExportSnapshot } from '../map/route-export.ts'
import { EXPORT_WIDTH, createExportLayout } from './export-layout.ts'
import type { ExportLayout } from './export-layout.ts'
import { encodeJpeg } from './jpeg-encoder.ts'
import { createFullExportLayouts, EXPORT_SIZE_ERROR, JPEG_MAX_SIDE } from './full-export-layout.ts'
import type { FullExportLayout } from './full-export-layout.ts'
import { createRegionalExportPlan } from './export-region-groups.ts'

export interface RouteExportProgress { completed: number; total: number; message: string }
export interface ExportedRouteImage { image: Blob; width: number; height: number; columns: 2 }
export interface RouteExportImages {
  routes: ExportedRouteImage[]
  maps: (ExportedRouteImage & { stateId: number; title: string; part: number; parts: number })[]
  pages: Blob[]
  layout: ExportLayout
}

function drawingCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    canvas.width = canvas.height = 0
    throw new Error('当前浏览器无法生成图片')
  }
  // JPEG has no alpha channel; keep map gaps on the same opaque background.
  context.fillStyle = '#0b1714'
  context.fillRect(0, 0, width, height)
  return { canvas, context }
}

function drawBanners(context: CanvasRenderingContext2D, banners: readonly { label: string; x: number; y: number; width: number; height: number }[], offsetY = 0): void {
  if (!banners.length) return
  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '600 22px "Map FangXinShu", sans-serif'
  for (const banner of banners) {
    const y = banner.y - offsetY
    context.fillStyle = '#163e2e'
    context.fillRect(banner.x, y, banner.width, banner.height)
    context.fillStyle = '#65f1c2'
    context.fillRect(banner.x, y + banner.height - 2, banner.width, 2)
    context.fillStyle = '#e7f1ec'
    context.fillText(banner.label, banner.x + banner.width / 2, y + banner.height / 2, banner.width - 32)
  }
  context.restore()
}

async function jpegCanvasSideLimit(signal: AbortSignal): Promise<number> {
  async function supported(side: number): Promise<boolean> {
    for (const [width, height] of [[1, side], [side, 1]]) {
      signal.throwIfAborted()
      let drawing: ReturnType<typeof drawingCanvas> | null = null
      try {
        drawing = drawingCanvas(width ?? 1, height ?? 1)
        await abortable(encodeJpeg(drawing.canvas), signal)
      } catch {
        signal.throwIfAborted()
        return false
      } finally { if (drawing) drawing.canvas.width = drawing.canvas.height = 0 }
    }
    return true
  }
  // A one-pixel strip tests each axis without allocating a giant image.
  if (await supported(JPEG_MAX_SIDE)) return JPEG_MAX_SIDE
  let low = 1, high = JPEG_MAX_SIDE
  if (!await supported(low)) throw new Error(EXPORT_SIZE_ERROR)
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (await supported(middle)) low = middle
    else high = middle
  }
  return low
}

async function prepareRouteLayouts(layout: ExportLayout, signal: AbortSignal, maxHeight: number): Promise<{ layouts: FullExportLayout[]; maxHeight: number }> {
  let limit = maxHeight
  for (let attempt = 0; attempt < 8; attempt += 1) {
    signal.throwIfAborted()
    const layouts = createFullExportLayouts(layout, { maxHeight: limit })
    const tallest = layouts.reduce((result, candidate) => candidate.height > result.height ? candidate : result)
    let drawing: ReturnType<typeof drawingCanvas> | null = null
    try {
      // Test the real two-column surface. A one-pixel side probe cannot detect
      // allocation limits caused by the decoded pixel area.
      drawing = drawingCanvas(tallest.width, tallest.height)
      await abortable(encodeJpeg(drawing.canvas), signal)
      return { layouts, maxHeight: limit }
    } catch {
      signal.throwIfAborted()
      limit = Math.floor(Math.min(limit, tallest.height) / 2)
    } finally { if (drawing) drawing.canvas.width = drawing.canvas.height = 0 }
  }
  throw new Error(EXPORT_SIZE_ERROR)
}

function layoutForCards(layout: ExportLayout, cards: ExportLayout['cards']): ExportLayout {
  const groupIds = new Set(cards.map(({ routeGroupId }) => routeGroupId))
  return { ...layout, cards, banners: layout.banners.filter(({ routeGroupId }) => groupIds.has(routeGroupId)), pages: [], pageHeights: [], height: 0, sections: new Set(cards.map(({ section }) => section)).size }
}

interface PlannedPart {
  arrangement: FullExportLayout
  positions: Map<number, { x: number; y: number }>
}

function plannedParts(layouts: readonly FullExportLayout[]): PlannedPart[] {
  return layouts.map((arrangement) => ({
    arrangement,
    positions: new Map(arrangement.positions.map(({ cardNumber, x, y }) => [cardNumber, { x, y }])),
  }))
}

function locatePart(parts: readonly PlannedPart[], cardNumber: number): { index: number; part: PlannedPart; position: { x: number; y: number } } | null {
  for (const [index, part] of parts.entries()) {
    const position = part.positions.get(cardNumber)
    if (position) return { index, part, position }
  }
  return null
}

export async function exportRouteImages(snapshot: RouteExportSnapshot, signal: AbortSignal, onProgress: (progress: RouteExportProgress) => void): Promise<RouteExportImages> {
  signal.throwIfAborted()
  const countryIdByPointId = new Map([...snapshot.locations, ...snapshot.navigationPoints].map(({ id, countryId }) => [id, countryId]))
  const regionalPlan = createRegionalExportPlan(snapshot.routePlan ?? snapshot.route, snapshot.dataset, countryIdByPointId, snapshot.gravity)
  const layout = createExportLayout(regionalPlan, snapshot.gravity)
  onProgress({ completed: 0, total: layout.cards.length, message: '正在检查双列路线图尺寸' })
  const maxSide = await jpegCanvasSideLimit(signal)
  const prepared = await prepareRouteLayouts(layout, signal, maxSide)
  const routeParts = plannedParts(prepared.layouts)
  const mapCards = new Map<number, ExportLayout['cards']>()
  for (const card of layout.cards) {
    const cards = mapCards.get(card.stateId) ?? []
    cards.push(card)
    mapCards.set(card.stateId, cards)
  }
  const mapPlans = [...mapCards].map(([stateId, cards]) => {
    const parts = plannedParts(createFullExportLayouts(layoutForCards(layout, cards), { maxHeight: prepared.maxHeight }))
    return {
      stateId,
      title: cards[0]?.mapName || snapshot.dataset.states.find(({ id }) => id === stateId)?.name || `地图 ${stateId}`,
      parts,
    }
  })
  const mapPlansByStateId = new Map(mapPlans.map((plan) => [plan.stateId, plan]))
  let renderer: ReturnType<typeof createRouteExportRenderer> | null = null
  const routes: RouteExportImages['routes'] = []
  const pages: Blob[] = []
  const maps: RouteExportImages['maps'] = []
  let completed = 0
  interface ActiveDrawing {
    index: number
    drawing: ReturnType<typeof drawingCanvas>
    part: PlannedPart
  }
  let activeRoute: ActiveDrawing | null = null
  let activeMap: (ActiveDrawing & { stateId: number; title: string; parts: number }) | null = null
  async function finishRoute(): Promise<void> {
    if (!activeRoute) return
    const active = activeRoute
    try {
      routes.push({
        image: await abortable(encodeJpeg(active.drawing.canvas), signal),
        width: active.part.arrangement.width,
        height: active.part.arrangement.height,
        columns: active.part.arrangement.columns,
      })
    } catch {
      signal.throwIfAborted()
      throw new Error(EXPORT_SIZE_ERROR)
    } finally {
      active.drawing.canvas.width = active.drawing.canvas.height = 0
      activeRoute = null
    }
  }
  async function prepareRoute(cardNumber: number): Promise<{ drawing: ReturnType<typeof drawingCanvas>; position: { x: number; y: number } }> {
    const target = locatePart(routeParts, cardNumber)
    if (!target) throw new Error('路线图片子图位置缺失')
    if (activeRoute?.index !== target.index) {
      await finishRoute()
      const drawing = drawingCanvas(target.part.arrangement.width, target.part.arrangement.height)
      drawBanners(drawing.context, target.part.arrangement.banners)
      activeRoute = { index: target.index, drawing, part: target.part }
    }
    if (!activeRoute) throw new Error('路线图片分卷不存在')
    return { drawing: activeRoute.drawing, position: target.position }
  }
  async function finishMap(): Promise<void> {
    if (!activeMap) return
    const active = activeMap
    try {
      maps.push({
        stateId: active.stateId,
        title: active.title,
        part: active.index + 1,
        parts: active.parts,
        image: await abortable(encodeJpeg(active.drawing.canvas), signal),
        width: active.part.arrangement.width,
        height: active.part.arrangement.height,
        columns: active.part.arrangement.columns,
      })
    } catch {
      signal.throwIfAborted()
      throw new Error(EXPORT_SIZE_ERROR)
    } finally {
      active.drawing.canvas.width = active.drawing.canvas.height = 0
      activeMap = null
    }
  }
  async function prepareMap(stateId: number, cardNumber: number): Promise<{ drawing: ReturnType<typeof drawingCanvas>; position: { x: number; y: number } }> {
    const plan = mapPlansByStateId.get(stateId)
    if (!plan) throw new Error('路线地图分卷不存在')
    const target = locatePart(plan.parts, cardNumber)
    if (!target) throw new Error('分地图路线子图位置缺失')
    if (activeMap?.stateId !== stateId || activeMap.index !== target.index) {
      await finishMap()
      const drawing = drawingCanvas(target.part.arrangement.width, target.part.arrangement.height)
      drawBanners(drawing.context, target.part.arrangement.banners)
      activeMap = { stateId, title: plan.title, parts: plan.parts.length, index: target.index, drawing, part: target.part }
    }
    if (!activeMap) throw new Error('路线地图分卷不存在')
    return { drawing: activeMap.drawing, position: target.position }
  }
  function releaseDrawings(): void {
    if (activeRoute) activeRoute.drawing.canvas.width = activeRoute.drawing.canvas.height = 0
    if (activeMap) activeMap.drawing.canvas.width = activeMap.drawing.canvas.height = 0
  }
  try {
    renderer = createRouteExportRenderer(snapshot)
    await abortable(document.fonts.ready, signal)
    for (const page of layout.pages) {
      signal.throwIfAborted()
      const output = drawingCanvas(EXPORT_WIDTH, page.height)
      try {
        drawBanners(output.context, page.banners, page.y)
        for (const card of page.cards) {
          signal.throwIfAborted()
          onProgress({ completed, total: layout.cards.length, message: `正在绘制路线 ${card.section} · 子图 ${card.part}/${card.parts}` })
          let image: HTMLCanvasElement
          try { image = await renderer.render(card, signal) }
          catch (error) {
            signal.throwIfAborted()
            throw new Error(`路线 ${card.section} 第 ${card.part} 张：${error instanceof Error ? error.message : '资源加载失败'}`)
          }
          try {
            output.context.drawImage(image, card.x, card.y - page.y)
            const routeDrawing = await prepareRoute(card.number)
            routeDrawing.drawing.context.drawImage(image, routeDrawing.position.x, routeDrawing.position.y)
            const mapDrawing = await prepareMap(card.stateId, card.number)
            mapDrawing.drawing.context.drawImage(image, mapDrawing.position.x, mapDrawing.position.y)
          } finally { image.width = image.height = 0 }
          completed += 1
        }
        pages.push(await abortable(encodeJpeg(output.canvas), signal))
      } finally { output.canvas.width = output.canvas.height = 0 }
    }
    await finishRoute()
    await finishMap()
    onProgress({ completed, total: layout.cards.length, message: `正在完成 ${routes.length} 张双列路线图和手机分卷` })
    return { routes, maps, pages, layout }
  } finally {
    renderer?.dispose()
    releaseDrawings()
  }
}
