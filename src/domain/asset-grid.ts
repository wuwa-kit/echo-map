import type { AssetGroup } from './asset-browser.ts'

export function assetGroupWindow(groups: readonly AssetGroup[], width: number, scrollTop: number, viewportHeight: number) {
  const metrics = assetGridWindow(0, width, 0, viewportHeight)
  const stride = metrics.rowHeight + 10
  const lower = Math.max(0, scrollTop - stride * 2), upper = scrollTop + viewportHeight + stride * 2
  let height = 0
  const visible: { group: AssetGroup; top: number; titleVisible: boolean; offset: number; assets: AssetGroup['assets'] }[] = []
  for (const group of groups) {
    if (!group.assets.length) continue
    const top = height, titleHeight = (group.name ? 40 : 0) + (group.categoryTitle ? 40 : 0)
    const rows = Math.ceil(group.assets.length / metrics.columns)
    const gridTop = top + titleHeight
    height = gridTop + rows * stride + 14
    if (height < lower || top > upper) continue
    const start = Math.max(0, Math.floor((lower - gridTop) / stride))
    const end = Math.min(rows, Math.ceil((upper - gridTop) / stride))
    visible.push({ group, top, titleVisible: !!(group.name || group.categoryTitle) && top + titleHeight >= lower, offset: gridTop + start * stride, assets: group.assets.slice(start * metrics.columns, Math.max(start, end) * metrics.columns) })
  }
  return { ...metrics, height: Math.max(0, height - 24), visible }
}

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
