import { abortable, createRouteExportRenderer } from '../map/route-export.ts'
import type { RouteExportSnapshot } from '../map/route-export.ts'
import { EXPORT_WIDTH, EXPORT_MAX_PIXELS, createExportLayout } from './export-layout.ts'
import type { ExportLayout } from './export-layout.ts'
import { encodeJpeg } from './jpeg-encoder.ts'
import { createFullExportLayout, EXPORT_SIZE_ERROR, JPEG_MAX_SIDE } from './full-export-layout.ts'
import { createRegionalExportPlan } from './export-region-groups.ts'

export interface RouteExportProgress { completed: number; total: number; message: string }
export interface RouteExportImages {
  full: Blob | null
  fullSize: { width: number; height: number } | null
  fullColumns: number | null
  maps: { stateId: number, title: string, image: Blob, width: number, height: number, columns: number }[]
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

async function prepareFullCanvas(layout: ExportLayout, signal: AbortSignal, maxSide: number) {
  let arrangement = createFullExportLayout(layout, { maxSide })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    signal.throwIfAborted()
    let drawing: ReturnType<typeof drawingCanvas> | null = null
    try {
      // Avoid allocating more than 1 GiB for a single RGBA surface. Changing
      // columns fixes side limits, but cannot make unlimited pixel area viable.
      if (arrangement.width * arrangement.height > EXPORT_MAX_PIXELS) throw new Error(EXPORT_SIZE_ERROR)
      drawing = drawingCanvas(arrangement.width, arrangement.height)
      // Probe the actual browser encoder before loading/rendering every card.
      // Canvas and JPEG implementations can have lower limits than the format.
      await abortable(encodeJpeg(drawing.canvas), signal)
      return { ...drawing, arrangement }
    } catch {
      if (drawing) drawing.canvas.width = drawing.canvas.height = 0
      signal.throwIfAborted()
      if (attempt === 1) break
      arrangement = createFullExportLayout(layout, { maxSide, minColumns: arrangement.columns + 1 })
    }
  }
  throw new Error(EXPORT_SIZE_ERROR)
}

function layoutForCards(layout: ExportLayout, cards: ExportLayout['cards']): ExportLayout {
  const groupIds = new Set(cards.map(({ routeGroupId }) => routeGroupId))
  return { ...layout, cards, banners: layout.banners.filter(({ routeGroupId }) => groupIds.has(routeGroupId)), pages: [], pageHeights: [], height: 0, sections: new Set(cards.map(({ section }) => section)).size }
}

export async function exportRouteImages(snapshot: RouteExportSnapshot, signal: AbortSignal, onProgress: (progress: RouteExportProgress) => void): Promise<RouteExportImages> {
  signal.throwIfAborted()
  const countryIdByPointId = new Map([...snapshot.locations, ...snapshot.navigationPoints].map(({ id, countryId }) => [id, countryId]))
  const regionalPlan = createRegionalExportPlan(snapshot.routePlan ?? snapshot.route, snapshot.dataset, countryIdByPointId, snapshot.gravity)
  const layout = createExportLayout(regionalPlan, snapshot.gravity)
  onProgress({ completed: 0, total: layout.cards.length, message: '正在检查图片尺寸与拼接列数' })
  const maxSide = await jpegCanvasSideLimit(signal)
  let full: Awaited<ReturnType<typeof prepareFullCanvas>> | null = null
  try {
    full = await prepareFullCanvas(layout, signal, maxSide)
  } catch (error) {
    signal.throwIfAborted()
    if (!(error instanceof Error) || error.message !== EXPORT_SIZE_ERROR) throw error
  }
  const mapCards = new Map<number, ExportLayout['cards']>()
  for (const card of layout.cards) {
    const cards = mapCards.get(card.stateId) ?? []
    cards.push(card)
    mapCards.set(card.stateId, cards)
  }
  const mapPlans = [...mapCards].map(([stateId, cards]) => ({
    stateId,
    title: cards[0]?.mapName || snapshot.dataset.states.find(({ id }) => id === stateId)?.name || `地图 ${stateId}`,
    cards,
  }))
  let renderer: ReturnType<typeof createRouteExportRenderer> | null = null
  const pages: Blob[] = []
  const maps: RouteExportImages['maps'] = []
  let completed = 0
  interface MapDrawing {
    stateId: number
    title: string
    cardNumbers: Map<number, number>
    drawing: ReturnType<typeof drawingCanvas>
    arrangement: ReturnType<typeof createFullExportLayout>
    bannersDrawn: boolean
  }
  let currentMap: MapDrawing | null = null
  async function finishMap(): Promise<void> {
    if (!currentMap) return
    const active = currentMap
    try {
      maps.push({
        stateId: active.stateId, title: active.title,
        image: await abortable(encodeJpeg(active.drawing.canvas), signal),
        width: active.arrangement.width, height: active.arrangement.height, columns: active.arrangement.columns,
      })
    } catch {
      signal.throwIfAborted()
      throw new Error(EXPORT_SIZE_ERROR)
    } finally {
      active.drawing.canvas.width = active.drawing.canvas.height = 0
      currentMap = null
    }
  }
  async function prepareMap(stateId: number): Promise<MapDrawing> {
    if (currentMap?.stateId === stateId) return currentMap
    await finishMap()
    const plan = mapPlans.find((candidate) => candidate.stateId === stateId)
    if (!plan) throw new Error('路线地图分卷不存在')
    const prepared = await prepareFullCanvas(layoutForCards(layout, plan.cards), signal, maxSide)
    const next: MapDrawing = {
      stateId, title: plan.title, drawing: prepared,
      arrangement: prepared.arrangement,
      cardNumbers: new Map(plan.cards.map((card, index) => [card.number, index])),
      bannersDrawn: false,
    }
    currentMap = next
    return next
  }
  function releaseCurrentMap(): void {
    if (currentMap) currentMap.drawing.canvas.width = currentMap.drawing.canvas.height = 0
  }
  try {
    const firstMap = mapPlans[0]
    if (!firstMap) throw new Error('路线地图分卷不存在')
    await prepareMap(firstMap.stateId)
    renderer = createRouteExportRenderer(snapshot)
    await abortable(document.fonts.ready, signal)
    if (full) drawBanners(full.context, full.arrangement.banners)
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
            if (full) {
              const position = full.arrangement.positions[card.number - 1]
              if (!position) throw new Error('路线子图位置缺失')
              try { full.context.drawImage(image, position.x, position.y) }
              catch {
                full.canvas.width = full.canvas.height = 0
                full = null
              }
            }
            const mapDrawing = await prepareMap(card.stateId)
            if (!mapDrawing.bannersDrawn) {
              drawBanners(mapDrawing.drawing.context, mapDrawing.arrangement.banners)
              mapDrawing.bannersDrawn = true
            }
            const mapIndex = mapDrawing.cardNumbers.get(card.number)
            const mapPosition = mapIndex === undefined ? undefined : mapDrawing.arrangement.positions[mapIndex]
            if (!mapPosition) throw new Error('分地图路线子图位置缺失')
            try { mapDrawing.drawing.context.drawImage(image, mapPosition.x, mapPosition.y) }
            catch { throw new Error(EXPORT_SIZE_ERROR) }
          }
          finally { image.width = image.height = 0 }
          completed += 1
        }
        pages.push(await abortable(encodeJpeg(output.canvas), signal))
      } finally { output.canvas.width = output.canvas.height = 0 }
    }
    await finishMap()
    onProgress({ completed, total: layout.cards.length, message: '正在完成 JPG 长图与手机分卷' })
    let fullImage: Blob | null = null
    if (full) {
      try { fullImage = await abortable(encodeJpeg(full.canvas), signal) }
      catch {
        signal.throwIfAborted()
        full.canvas.width = full.canvas.height = 0
        full = null
      }
    }
    return {
      full: fullImage,
      fullSize: full ? { width: full.arrangement.width, height: full.arrangement.height } : null,
      fullColumns: full?.arrangement.columns ?? null,
      maps, pages, layout,
    }
  } finally {
    renderer?.dispose()
    releaseCurrentMap()
    if (full) full.canvas.width = full.canvas.height = 0
  }
}
