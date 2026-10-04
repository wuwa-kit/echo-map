export function assetGridWindow(count: number, width: number, scrollTop: number, viewportHeight: number) {
  const columns = width >= 1200 ? 6 : width >= 850 ? 4 : width >= 580 ? 3 : 2
  const gap = 10
  const rowHeight = Math.max(0, (width - gap * (columns - 1)) / columns) * 0.75 + 46
  const stride = rowHeight + gap
  const rows = Math.ceil(count / columns)
  const startRow = Math.min(rows, Math.max(0, Math.floor(scrollTop / stride) - 2))
  const endRow = Math.min(rows, Math.max(startRow, Math.ceil((scrollTop + viewportHeight) / stride) + 2))
  return {
    columns, rowHeight,
    height: Math.max(0, rows * stride - gap),
    offset: startRow * stride,
    start: startRow * columns,
    end: Math.min(count, endRow * columns),
  }
}
