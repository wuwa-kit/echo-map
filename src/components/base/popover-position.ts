export type WuPopoverPlacement = 'bottom-start' | 'bottom' | 'bottom-end' | 'top-start' | 'top' | 'top-end'
export type WuPopoverWidth = number | 'trigger' | 'content' | 'viewport'

interface Rectangle {
  left: number
  top: number
  width: number
  height: number
}

export function popoverWidth(
  width: WuPopoverWidth,
  anchorWidth: number,
  contentWidth: number,
  viewportWidth: number,
  margin: number,
): number {
  const available = Math.max(0, viewportWidth - Math.max(0, margin) * 2)
  const desired = typeof width === 'number' ? width
    : width === 'trigger' ? anchorWidth : width === 'viewport' ? available : contentWidth
  return Math.max(0, Math.min(desired, available))
}

export function popoverPosition({
  anchor, viewport, size, placement, gap, margin, maxHeight,
}: {
  anchor: Rectangle
  viewport: Rectangle
  size: { width: number, height: number }
  placement: WuPopoverPlacement
  gap: number
  margin: number
  maxHeight: number
}): { left: number, top: number, maxHeight: number } {
  const padding = Math.max(0, margin)
  const distance = Math.max(0, gap)
  const leftEdge = viewport.left + padding
  const topEdge = viewport.top + padding
  const bottomEdge = viewport.top + viewport.height - padding
  const below = Math.max(0, bottomEdge - anchor.top - anchor.height - distance)
  const above = Math.max(0, anchor.top - distance - topEdge)
  const height = Math.min(size.height, Math.max(0, maxHeight))
  const preferBelow = placement.startsWith('bottom')
  const placeBelow = preferBelow ? below >= height || below >= above : !(above >= height || above >= below)
  const availableHeight = Math.min(Math.max(0, maxHeight), placeBelow ? below : above)
  const desiredLeft = placement.endsWith('-start') ? anchor.left
    : placement.endsWith('-end') ? anchor.left + anchor.width - size.width
      : anchor.left + (anchor.width - size.width) / 2
  const desiredTop = placeBelow ? anchor.top + anchor.height + distance
    : anchor.top - distance - Math.min(height, availableHeight)
  return {
    left: Math.max(leftEdge, Math.min(desiredLeft, viewport.left + viewport.width - padding - size.width)),
    top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - Math.min(height, availableHeight))),
    maxHeight: availableHeight,
  }
}
