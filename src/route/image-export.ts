import { abortable, createRouteExportRenderer } from '../map/route-export.ts'
import type { RouteExportSnapshot } from '../map/route-export.ts'
import { EXPORT_WIDTH, EXPORT_MAX_PIXELS, createExportLayout } from './export-layout.ts'
import type { ExportLayout } from './export-layout.ts'
import { encodeJpeg } from './jpeg-encoder.ts'
import { createFullExportLayout, EXPORT_SIZE_ERROR, JPEG_MAX_SIDE } from './full-export-layout.ts'

export interface RouteExportProgress { completed: number; total: number; message: string }
export interface RouteExportImages {
  full: Blob
  fullSize: { width: number; height: number }
  fullColumns: number
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

async function prepareFullCanvas(layout: ExportLayout, signal: AbortSignal) {
  const maxSide = await jpegCanvasSideLimit(signal)
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

export async function exportRouteImages(snapshot: RouteExportSnapshot, signal: AbortSignal, onProgress: (progress: RouteExportProgress) => void): Promise<RouteExportImages> {
  signal.throwIfAborted()
  const layout = createExportLayout(snapshot.route)
  onProgress({ completed: 0, total: layout.cards.length, message: '正在检查图片尺寸与拼接列数' })
  const full = await prepareFullCanvas(layout, signal)
  let renderer: ReturnType<typeof createRouteExportRenderer> | null = null
  const pages: Blob[] = []
  let completed = 0
  try {
    renderer = createRouteExportRenderer(snapshot)
    await abortable(document.fonts.ready, signal)
    for (const page of layout.pages) {
      signal.throwIfAborted()
      const output = drawingCanvas(EXPORT_WIDTH, page.height)
      try {
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
            const position = full.arrangement.positions[card.number - 1]
            if (!position) throw new Error('路线子图位置缺失')
            try { full.context.drawImage(image, position.x, position.y) }
            catch { throw new Error(EXPORT_SIZE_ERROR) }
          }
          finally { image.width = image.height = 0 }
          completed += 1
        }
        pages.push(await abortable(encodeJpeg(output.canvas), signal))
      } finally { output.canvas.width = output.canvas.height = 0 }
    }
    onProgress({ completed, total: layout.cards.length, message: '正在完成 JPG 长图与手机分卷' })
    let fullImage: Blob
    try { fullImage = await abortable(encodeJpeg(full.canvas), signal) }
    catch {
      signal.throwIfAborted()
      throw new Error(EXPORT_SIZE_ERROR)
    }
    return { full: fullImage, fullSize: { width: full.arrangement.width, height: full.arrangement.height }, fullColumns: full.arrangement.columns, pages, layout }
  } finally {
    renderer?.dispose()
    full.canvas.width = full.canvas.height = 0
  }
}
