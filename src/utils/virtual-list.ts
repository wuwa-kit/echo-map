export function virtualListWindow(count: number, rowHeight: number, scrollTop: number, viewportHeight: number, overscan = 4) {
  const height = count * rowHeight
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, height - viewportHeight))
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((top + Math.max(0, viewportHeight)) / rowHeight) + overscan)
  return { start, end, height, before: start * rowHeight, after: (count - end) * rowHeight }
}
