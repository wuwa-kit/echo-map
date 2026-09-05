export type MapPadding = [top: number, right: number, bottom: number, left: number]

// Keep a usable map area even when a keyboard or panel takes up most of the viewport.
export function fitMapPadding(width: number, height: number, padding: readonly number[]): MapPadding {
  const values = padding.map((value) => Number.isFinite(value) ? Math.max(0, value) : 0)
  const [top = 0, right = 0, bottom = 0, left = 0] = values
  function scaleFor(size: number, total: number): number {
    const available = Math.max(0, size - Math.min(96, size / 2))
    return total > available ? available / total : 1
  }
  const horizontal = scaleFor(width, left + right)
  const vertical = scaleFor(height, top + bottom)
  return [top * vertical, right * horizontal, bottom * vertical, left * horizontal]
}
