import { EXPORT_BANNER_HEIGHT, EXPORT_GAP, EXPORT_MARGIN, EXPORT_WIDTH, EXPORT_SIZE_ERROR } from './export-layout.ts'
import type { ExportLayout } from './export-layout.ts'

export const JPEG_MAX_SIDE = 65535
export { EXPORT_SIZE_ERROR } from './export-layout.ts'
const COLUMN_WIDTH = (EXPORT_WIDTH - EXPORT_MARGIN * 2 - EXPORT_GAP) / 2
const COLUMN_STEP = COLUMN_WIDTH + EXPORT_GAP

export interface FullExportLayout {
  width: number
  height: number
  columns: number
  positions: { x: number; y: number }[]
  banners: { routeGroupId: string; label: string; x: number; y: number; width: number; height: number }[]
}

// Pack the full image independently of mobile page boundaries, including at
// two columns. Page padding and column resets must not interrupt the waterfall.
// The original cards and mobile pages retain their dimensions and coordinates.
export function createFullExportLayout(layout: ExportLayout, { minColumns = 2, maxSide = JPEG_MAX_SIDE }: { minColumns?: number; maxSide?: number } = {}): FullExportLayout {
  const limit = Math.min(maxSide, JPEG_MAX_SIDE)
  if (layout.cards.some((card) => card.width > limit || card.height > limit)
    || layout.cards.reduce((area, card) => area + card.width * card.height, 0) > limit * limit) throw new Error(EXPORT_SIZE_ERROR)
  const maxColumns = Math.floor((limit - EXPORT_MARGIN * 2 + EXPORT_GAP) / COLUMN_STEP)
  for (let columns = Math.max(2, minColumns); columns <= maxColumns; columns += 1) {
    const width = EXPORT_MARGIN * 2 + columns * COLUMN_STEP - EXPORT_GAP
    const bottoms = Array.from({ length: columns }, () => EXPORT_MARGIN)
    const banners: FullExportLayout['banners'] = []
    let activeGroupLabel: string | null = null
    const positions = layout.cards.map((card) => {
      if (card.groupLabel !== activeGroupLabel) {
        activeGroupLabel = card.groupLabel
        if (card.groupLabel) {
          const y = banners.length ? Math.max(...bottoms) : 0
          banners.push({ routeGroupId: card.routeGroupId, label: card.groupLabel, x: 0, y, width, height: EXPORT_BANNER_HEIGHT })
          bottoms.fill(y + EXPORT_BANNER_HEIGHT + EXPORT_GAP)
        }
      }
      const span = card.width > COLUMN_WIDTH ? 2 : 1
      let bestColumn = 0, top = Infinity
      for (let column = 0; column <= columns - span; column += 1) {
        const candidate = Math.max(...bottoms.slice(column, column + span))
        if (candidate < top) { bestColumn = column; top = candidate }
      }
      for (let column = bestColumn; column < bestColumn + span; column += 1) bottoms[column] = top + card.height + EXPORT_GAP
      return { x: EXPORT_MARGIN + bestColumn * COLUMN_STEP, y: top }
    })
    const height = Math.max(...bottoms) - EXPORT_GAP + EXPORT_MARGIN
    if (height <= limit) return { width, height, columns, positions, banners }
  }
  throw new Error(EXPORT_SIZE_ERROR)
}
