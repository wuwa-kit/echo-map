export type WuTooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

interface Rectangle {
  left: number
  top: number
  width: number
  height: number
}

export function tooltipPosition({
  anchor, viewport, size, placement, gap, margin,
}: {
  anchor: Rectangle
  viewport: Rectangle
  size: { width: number, height: number }
  placement: WuTooltipPlacement
  gap: number
  margin: number
}): { left: number, top: number } {
  const padding = Math.max(0, margin)
  const distance = Math.max(0, gap)
  const leftEdge = viewport.left + padding
  const topEdge = viewport.top + padding
  const rightEdge = viewport.left + viewport.width - padding
  const bottomEdge = viewport.top + viewport.height - padding
  const spaces = {
    top: anchor.top - topEdge - distance,
    right: rightEdge - anchor.left - anchor.width - distance,
    bottom: bottomEdge - anchor.top - anchor.height - distance,
    left: anchor.left - leftEdge - distance,
  }
  const opposite: Record<WuTooltipPlacement, WuTooltipPlacement> = {
    top: 'bottom', right: 'left', bottom: 'top', left: 'right',
  }
  const required = placement === 'top' || placement === 'bottom' ? size.height : size.width
  const alternative = opposite[placement]
  const resolved = spaces[placement] >= required || spaces[placement] >= spaces[alternative] ? placement : alternative
  const desiredLeft = resolved === 'right' ? anchor.left + anchor.width + distance
    : resolved === 'left' ? anchor.left - distance - size.width
      : anchor.left + (anchor.width - size.width) / 2
  const desiredTop = resolved === 'bottom' ? anchor.top + anchor.height + distance
    : resolved === 'top' ? anchor.top - distance - size.height
      : anchor.top + (anchor.height - size.height) / 2

  return {
    left: Math.max(leftEdge, Math.min(desiredLeft, rightEdge - size.width)),
    top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - size.height)),
  }
}
