import type { GravityType, RoutePlanResult, RoutePoint, RouteResult } from '../domain/types.ts'

// Keep crop geometry and page breaks in reference pixels, independent of the
// output density. A smaller download must not split routes or change map views.
const LAYOUT_WIDTH = 2000
const LAYOUT_RATIO = 5
const LAYOUT_MARGIN = 12
const LAYOUT_GAP = 12
const LAYOUT_BANNER_HEIGHT = 64
export const EXPORT_RATIO = 4
const OUTPUT_SCALE = EXPORT_RATIO / LAYOUT_RATIO
const outputPixel = (value: number) => Math.round(value * OUTPUT_SCALE)
export const EXPORT_WIDTH = outputPixel(LAYOUT_WIDTH)
export const EXPORT_MARGIN = outputPixel(LAYOUT_MARGIN)
export const EXPORT_GAP = outputPixel(LAYOUT_GAP)
export const EXPORT_BANNER_HEIGHT = outputPixel(LAYOUT_BANNER_HEIGHT)
export const EXPORT_MAX_PIXELS = 256 * 1024 * 1024
export const EXPORT_SIZE_ERROR = '图片尺寸过大，生成失败'
const FULL_WIDTH = LAYOUT_WIDTH - LAYOUT_MARGIN * 2
const HALF_WIDTH = (FULL_WIDTH - LAYOUT_GAP) / 2
// Export markers are smaller than the main map; retain room for their borders.
const MAP_PADDING = 22
const PLACE_NAME_SPACE = 28
const MAX_MAP_HEIGHT = 1800
// Even the smallest crop occupies this much output area. Bound synchronous
// splitting by the same capacity as the final canvas, before allocating nodes.
const MIN_CARD_PIXELS = Math.floor(HALF_WIDTH * OUTPUT_SCALE) * outputPixel((MAP_PADDING * 2 + PLACE_NAME_SPACE) * LAYOUT_RATIO)
const MAX_EXPORT_CARDS = Math.floor(EXPORT_MAX_PIXELS / MIN_CARD_PIXELS)

export interface ExportNode {
  point: RoutePoint
  targetId: string | null
}

export interface ExportCard {
  number: number
  section: number
  part: number
  parts: number
  start: RoutePoint | null
  floorTransition: boolean
  routeGroupId: string
  groupNumber: number
  groupCount: number
  groupLabel: string
  mapName: string
  gravityType: GravityType
  stateId: number
  levelId: string | null
  nodes: ExportNode[]
  targetIds: string[]
  resolution: number
  center: [number, number]
  mapSize: [number, number]
  width: number
  mapHeight: number
  height: number
  x: number
  y: number
}

export interface ExportBanner {
  routeGroupId: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface ExportLayout {
  cards: ExportCard[]
  banners: ExportBanner[]
  pages: { y: number; height: number; cards: ExportCard[]; banners: ExportBanner[] }[]
  pageHeights: number[]
  width: number
  height: number
  sections: number
}

function bounds(nodes: readonly ExportNode[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { point: { mapCoordinate: [x, y] } } of nodes) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

function fitCard(nodes: readonly ExportNode[], width: number): Pick<ExportCard, 'width' | 'height' | 'mapHeight' | 'mapSize' | 'center' | 'resolution'> {
  const [left, bottom, right, top] = bounds(nodes)
  const usableWidth = width / LAYOUT_RATIO - MAP_PADDING * 2
  const usableHeight = MAX_MAP_HEIGHT / LAYOUT_RATIO - MAP_PADDING * 2 - PLACE_NAME_SPACE
  const resolution = Math.max(0.75, Math.min(3, Math.max((right - left) / usableWidth, (top - bottom) / usableHeight)))
  const mapHeight = Math.ceil(((top - bottom) / resolution + MAP_PADDING * 2 + PLACE_NAME_SPACE) * LAYOUT_RATIO)
  return {
    width, height: mapHeight, mapHeight, resolution,
    center: [(left + right) / 2, (bottom + top) / 2 + PLACE_NAME_SPACE / 2 * resolution],
    mapSize: [Math.ceil(width / LAYOUT_RATIO), Math.ceil(mapHeight / LAYOUT_RATIO)],
  }
}

function intermediate(from: RoutePoint, to: RoutePoint, t: number): ExportNode {
  const interpolate = (a: number, b: number) => a + (b - a) * t
  return {
    targetId: null,
    point: {
      ...from, id: `crop:${from.id}:${to.id}:${t}`, name: '续接', echoId: null, members: undefined,
      isTeleportArrival: undefined,
      coordinate: { x: interpolate(from.coordinate.x, to.coordinate.x), y: interpolate(from.coordinate.y, to.coordinate.y), z: interpolate(from.coordinate.z, to.coordinate.z) },
      mapCoordinate: [interpolate(from.mapCoordinate[0], to.mapCoordinate[0]), interpolate(from.mapCoordinate[1], to.mapCoordinate[1])],
    },
  }
}

export function createExportLayout(routeSource: RouteResult | RoutePlanResult, gravityType: GravityType = 1): ExportLayout {
  const groups = 'groups' in routeSource ? routeSource.groups : [{
    id: 'current', stateId: routeSource.points[0]?.stateId ?? 0, levelId: routeSource.points[0]?.levelId ?? null,
    gravityType, label: '', mapName: '', echoCount: 0,
    matchingLocationCount: routeSource.points.length, incompleteLocationCount: 0, route: routeSource,
  }]
  if (!groups.some(({ route }) => route.points.length > 0)) throw new Error('请先生成路线')
  const sections: {
    nodes: ExportNode[]
    start: RoutePoint | null
    floorTransition: boolean
    stateId: number
    levelId: string | null
    routeGroupId: string
    groupNumber: number
    groupLabel: string
    mapName: string
    gravityType: GravityType
  }[] = []
  for (const [groupIndex, group] of groups.entries()) {
    let previous: RoutePoint | undefined
    for (const point of group.route.points) {
      const floorTransition = Boolean(previous && (previous.levelId !== point.levelId || previous.stateId !== point.stateId))
      const previousSection = sections.at(-1)
      if (point.teleportFrom || floorTransition || previousSection?.routeGroupId !== group.id) {
        sections.push({
          nodes: point.teleportFrom ? [{ point: point.teleportFrom, targetId: null }] : [], start: point.teleportFrom ?? null,
          floorTransition: floorTransition && !point.teleportFrom, stateId: point.stateId, levelId: point.levelId,
          routeGroupId: group.id, groupNumber: groupIndex + 1, groupLabel: group.label,
          mapName: group.mapName, gravityType: group.gravityType,
        })
      }
      sections.at(-1)?.nodes.push({ point, targetId: point.id })
      previous = point
    }
  }
  const cards: ExportCard[] = []
  for (const [sectionIndex, section] of sections.entries()) {
    const [minX, minY, maxX, maxY] = bounds(section.nodes)
    const wide = maxX - minX > (HALF_WIDTH / LAYOUT_RATIO - MAP_PADDING * 2) * 3
      && maxX - minX > (maxY - minY) * 2.2
    const width = wide ? FULL_WIDTH : HALF_WIDTH
    const usableWidth = width / LAYOUT_RATIO - MAP_PADDING * 2
    const usableHeight = MAX_MAP_HEIGHT / LAYOUT_RATIO - MAP_PADDING * 2 - PLACE_NAME_SPACE
    const resolution = Math.max(0.75, Math.min(3, Math.max((maxX - minX) / usableWidth, (maxY - minY) / usableHeight)))
    const maxWidth = usableWidth * resolution
    const maxHeight = usableHeight * resolution
    function* denseNodes(): Generator<ExportNode> {
      let last: RoutePoint | undefined
      for (const node of section.nodes) {
        if (last) {
          const steps = Math.ceil(Math.max(Math.abs(last.mapCoordinate[0] - node.point.mapCoordinate[0]) / maxWidth, Math.abs(last.mapCoordinate[1] - node.point.mapCoordinate[1]) / maxHeight) / 0.65)
          // A crop spans at most two interpolation steps along a long edge.
          if (!Number.isFinite(steps) || steps > MAX_EXPORT_CARDS * 2) throw new Error(EXPORT_SIZE_ERROR)
          for (let step = 1; step < steps; step += 1) yield intermediate(last, node.point, step / steps)
        }
        yield node
        last = node.point
      }
    }
    const chunks: ExportNode[][] = []
    let chunk: ExportNode[] = []
    function finishChunk(): void {
      if (cards.length + chunks.length >= MAX_EXPORT_CARDS) throw new Error(EXPORT_SIZE_ERROR)
      chunks.push(chunk)
    }
    for (const node of denseNodes()) {
      const candidate = [...chunk, node]
      const [left, bottom, right, top] = bounds(candidate)
      if (chunk.length > 1 && (right - left > maxWidth || top - bottom > maxHeight || candidate.filter(({ targetId }) => targetId).length > 12)) {
        finishChunk()
        const last = chunk.at(-1)
        const before = chunk.at(-2)
        // Repeat the end of the previous edge and its landmark on the next card.
        chunk = before && last ? [intermediate(before.point, last.point, 0.85), { point: last.point, targetId: null }] : []
      }
      chunk.push(node)
    }
    if (chunk.length) finishChunk()
    for (const [index, nodes] of chunks.entries()) {
      const [left, , right] = bounds(nodes)
      // Section geometry determines continuity; each finished crop only needs
      // two columns if its own route cannot fit one at the maximum resolution.
      const cardWidth = right - left > (HALF_WIDTH / LAYOUT_RATIO - MAP_PADDING * 2) * 3 ? FULL_WIDTH : HALF_WIDTH
      cards.push({ number: cards.length + 1, section: sectionIndex + 1, part: index + 1, parts: chunks.length, start: section.start, floorTransition: section.floorTransition,
        routeGroupId: section.routeGroupId, groupNumber: section.groupNumber, groupCount: groups.length,
        groupLabel: section.groupLabel, mapName: section.mapName, gravityType: section.gravityType,
        stateId: section.stateId, levelId: section.levelId,
        nodes, targetIds: nodes.flatMap(({ targetId }) => targetId ? [targetId] : []),
        ...fitCard(nodes, cardWidth), x: LAYOUT_MARGIN, y: 0,
      })
    }
  }
  const pages: ExportLayout['pages'] = []
  const banners: ExportBanner[] = []
  let pageCards: ExportCard[] = []
  let pageBanners: ExportBanner[] = []
  let columns: [number, number] = [LAYOUT_MARGIN, LAYOUT_MARGIN]
  let height = 0
  function finishPage(): void {
    if (!pageCards.length) return
    const only = pageCards.length === 1 ? pageCards[0] : undefined
    if (only) {
      Object.assign(only, fitCard(only.nodes, FULL_WIDTH))
      const bottom = only.y - height + only.height + LAYOUT_GAP
      columns = [bottom, bottom]
    }
    const pageHeight = Math.max(...columns) - LAYOUT_GAP + LAYOUT_MARGIN
    pages.push({ y: height, height: pageHeight, cards: pageCards, banners: pageBanners })
    height += pageHeight
    pageCards = []
    pageBanners = []
    columns = [LAYOUT_MARGIN, LAYOUT_MARGIN]
  }
  let activeGroupId: string | null = null
  function addPageBanner(card: ExportCard): void {
    activeGroupId = card.routeGroupId
    const label = card.groupLabel || card.mapName
    if (!label) return
    const top = pageCards.length ? Math.max(...columns) : 0
    const banner: ExportBanner = {
      routeGroupId: card.routeGroupId, label,
      x: 0, y: height + top, width: LAYOUT_WIDTH, height: LAYOUT_BANNER_HEIGHT,
    }
    banners.push(banner)
    pageBanners.push(banner)
    columns = [top + banner.height + LAYOUT_GAP, top + banner.height + LAYOUT_GAP]
  }
  for (const card of cards) {
    if (!pageCards.length) addPageBanner(card)
    else if (card.routeGroupId !== activeGroupId) {
      const bannerHeight = card.groupLabel || card.mapName ? LAYOUT_BANNER_HEIGHT + LAYOUT_GAP : 0
      if (Math.max(...columns) + bannerHeight + card.height + LAYOUT_MARGIN > 4000) finishPage()
      addPageBanner(card)
    }
    const full = card.width === FULL_WIDTH
    let column = columns[0] <= columns[1] ? 0 : 1
    let top = full ? Math.max(...columns) : columns[column] ?? LAYOUT_MARGIN
    if (top + card.height + LAYOUT_MARGIN > 4000) {
      finishPage()
      addPageBanner(card)
      column = 0
      top = full ? Math.max(...columns) : columns[column] ?? LAYOUT_MARGIN
    }
    card.x = LAYOUT_MARGIN + (full ? 0 : column * (HALF_WIDTH + LAYOUT_GAP))
    card.y = height + top
    pageCards.push(card)
    const bottom = top + card.height + LAYOUT_GAP
    if (full) columns = [bottom, bottom]
    else if (column === 0) columns[0] = bottom
    else columns[1] = bottom
  }
  finishPage()
  // Round shared rectangle edges, so cards and page boundaries stay aligned
  // without fractional canvas sizes, clipping or accumulated rounding drift.
  for (const card of cards) {
    card.width = outputPixel(card.x + card.width) - outputPixel(card.x)
    card.height = outputPixel(card.y + card.height) - outputPixel(card.y)
    card.mapHeight = card.height
    card.x = outputPixel(card.x)
    card.y = outputPixel(card.y)
  }
  for (const banner of banners) {
    banner.width = outputPixel(banner.x + banner.width) - outputPixel(banner.x)
    banner.height = outputPixel(banner.y + banner.height) - outputPixel(banner.y)
    banner.x = outputPixel(banner.x)
    banner.y = outputPixel(banner.y)
  }
  for (const page of pages) {
    page.height = outputPixel(page.y + page.height) - outputPixel(page.y)
    page.y = outputPixel(page.y)
  }
  return { width: EXPORT_WIDTH, height: outputPixel(height), cards, banners, pages, pageHeights: pages.map(({ height }) => height), sections: sections.length }
}
