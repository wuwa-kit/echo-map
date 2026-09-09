import { EXPORT_BANNER_HEIGHT, EXPORT_GAP, EXPORT_MARGIN, EXPORT_MAX_PIXELS, EXPORT_WIDTH, EXPORT_SIZE_ERROR } from './export-layout.ts'
import type { ExportCard, ExportLayout } from './export-layout.ts'

export const JPEG_MAX_SIDE = 65535
export { EXPORT_SIZE_ERROR } from './export-layout.ts'
const COLUMN_WIDTH = (EXPORT_WIDTH - EXPORT_MARGIN * 2 - EXPORT_GAP) / 2
const COLUMN_STEP = COLUMN_WIDTH + EXPORT_GAP

export interface FullExportLayout {
  width: number
  height: number
  columns: 2
  positions: { cardNumber: number; x: number; y: number }[]
  banners: { routeGroupId: string; label: string; x: number; y: number; width: number; height: number }[]
}

interface LayoutBuilder extends Omit<FullExportLayout, 'height'> {
  activeGroupId: string | null
  bottoms: [number, number]
}

function emptyLayout(): LayoutBuilder {
  return {
    width: EXPORT_WIDTH,
    columns: 2,
    positions: [],
    banners: [],
    activeGroupId: null,
    bottoms: [EXPORT_MARGIN, EXPORT_MARGIN],
  }
}

function addCard(source: LayoutBuilder, card: ExportCard): LayoutBuilder {
  const layout: LayoutBuilder = {
    ...source,
    positions: [...source.positions],
    banners: [...source.banners],
    bottoms: [...source.bottoms],
  }
  if (card.routeGroupId !== layout.activeGroupId) {
    layout.activeGroupId = card.routeGroupId
    const label = card.groupLabel || card.mapName
    if (label) {
      const y = layout.positions.length ? Math.max(...layout.bottoms) : 0
      layout.banners.push({ routeGroupId: card.routeGroupId, label, x: 0, y, width: EXPORT_WIDTH, height: EXPORT_BANNER_HEIGHT })
      layout.bottoms = [y + EXPORT_BANNER_HEIGHT + EXPORT_GAP, y + EXPORT_BANNER_HEIGHT + EXPORT_GAP]
    }
  }
  const span = card.width > COLUMN_WIDTH ? 2 : 1
  const column = span === 2 || layout.bottoms[0] <= layout.bottoms[1] ? 0 : 1
  const y = span === 2 ? Math.max(...layout.bottoms) : layout.bottoms[column]
  layout.positions.push({ cardNumber: card.number, x: EXPORT_MARGIN + column * COLUMN_STEP, y })
  const bottom = y + card.height + EXPORT_GAP
  if (span === 2) layout.bottoms = [bottom, bottom]
  else layout.bottoms[column] = bottom
  return layout
}

function layoutHeight(layout: LayoutBuilder): number {
  return Math.max(...layout.bottoms) - EXPORT_GAP + EXPORT_MARGIN
}

// Preserve a two-column canvas at every route size. When the browser or JPEG
// height limit is reached, continue in a new image and repeat the active area's
// banner instead of making the image wider and its contents harder to read.
export function createFullExportLayouts(layout: ExportLayout, { maxHeight = JPEG_MAX_SIDE }: { maxHeight?: number } = {}): FullExportLayout[] {
  const limit = Math.min(Math.floor(maxHeight), JPEG_MAX_SIDE, Math.floor(EXPORT_MAX_PIXELS / EXPORT_WIDTH))
  if (limit <= 0 || layout.cards.some((card) => card.width > EXPORT_WIDTH - EXPORT_MARGIN * 2)) throw new Error(EXPORT_SIZE_ERROR)
  const result: FullExportLayout[] = []
  let current = emptyLayout()
  for (const card of layout.cards) {
    let candidate = addCard(current, card)
    if (layoutHeight(candidate) > limit && current.positions.length) {
      result.push({
        width: current.width,
        height: layoutHeight(current),
        columns: current.columns,
        positions: current.positions,
        banners: current.banners,
      })
      current = emptyLayout()
      candidate = addCard(current, card)
    }
    if (layoutHeight(candidate) > limit) throw new Error(EXPORT_SIZE_ERROR)
    current = candidate
  }
  if (current.positions.length) {
    result.push({
      width: current.width,
      height: layoutHeight(current),
      columns: current.columns,
      positions: current.positions,
      banners: current.banners,
    })
  }
  if (!result.length) throw new Error(EXPORT_SIZE_ERROR)
  return result
}
