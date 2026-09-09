import type { RegionLabel } from '../domain/types.ts'
import type { ExportCard } from '../route/export-layout.ts'

type Pixel = [number, number]
interface BoxBounds { x: number; y: number; width: number; height: number }
export interface ExportPlaceName { name: string; anchor: Pixel; outside: boolean }
export interface PlaceNameBox extends BoxBounds { text: string; fontSize: number }

export function exportCardNumberBox(card: ExportCard): PlaceNameBox {
  const text = String(card.number).padStart(2, '0')
  return { text, x: 6, y: 6, width: text.length * 7 + 4, height: 16, fontSize: 11 }
}

function toPixel(card: ExportCard, x: number, y: number): Pixel {
  return [card.mapSize[0] / 2 + (x - card.center[0]) / card.resolution,
    card.mapSize[1] / 2 - (y - card.center[1]) / card.resolution]
}

export function nearbyExportPlaces(labels: readonly RegionLabel[], card: ExportCard, countries: ReadonlySet<number>): ExportPlaceName[] {
  const [width, height] = card.mapSize
  const candidates = labels.filter((label) => label.stateId === card.stateId && label.level >= 2
    && (!countries.size || countries.has(label.countryId)))
    .map((label) => {
      const anchor = toPixel(card, label.coordinate.mapX, label.coordinate.mapY)
      const dx = Math.max(0, -anchor[0], anchor[0] - width)
      const dy = Math.max(0, -anchor[1], anchor[1] - height)
      return { label, anchor, outside: dx > 0 || dy > 0,
        distance: Math.hypot(dx, dy) + Math.hypot(anchor[0] - width / 2, anchor[1] - height / 2) * 0.05 }
    }).sort((a, b) => a.distance - b.distance || a.label.id.localeCompare(b.label.id))
  // Labels already inside the crop are sufficient context. Only use off-screen
  // proximity references when the crop contains no label at all.
  const inside = candidates.filter(({ outside }) => !outside)
  const references = inside.length ? inside : candidates
  const local = references.find(({ label }) => label.level >= 3) ?? references[0]
  const regional = references.find(({ label }) => label.level === 2 && label.name !== local?.label.name)
  return [local, regional].flatMap((entry) => entry ? [{ name: entry.label.name, anchor: entry.anchor, outside: entry.outside }] : [])
}

function overlap(a: BoxBounds, b: BoxBounds): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
}

function crossesBox(from: Pixel, to: Pixel, box: BoxBounds): boolean {
  let start = 0, end = 1
  for (const [origin, delta, low, high] of [
    [from[0], to[0] - from[0], box.x - 4, box.x + box.width + 4],
    [from[1], to[1] - from[1], box.y - 4, box.y + box.height + 4],
  ]) {
    if (origin === undefined || delta === undefined || low === undefined || high === undefined) continue
    if (delta === 0) {
      if (origin < low || origin > high) return false
    } else {
      const left = (low - origin) / delta, right = (high - origin) / delta
      start = Math.max(start, Math.min(left, right))
      end = Math.min(end, Math.max(left, right))
      if (start > end) return false
    }
  }
  return true
}

export function placeExportNames(places: readonly ExportPlaceName[], card: ExportCard, measure: (text: string, fontSize: number) => number): PlaceNameBox[] {
  const [width, height] = card.mapSize
  const points = card.nodes.map(({ point }) => toPixel(card, ...point.mapCoordinate))
  const numberBox = exportCardNumberBox(card)
  const result: PlaceNameBox[] = []
  for (const place of places) {
    const angle = Math.atan2(place.anchor[1] - height / 2, place.anchor[0] - width / 2)
    const direction = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][(Math.round(angle / (Math.PI / 4)) + 8) % 8] ?? ''
    const suffix = place.outside ? ` ${direction}` : ''
    const fontSize = place.outside ? 8 : 10
    let name = place.name
    while (name.length > 1 && measure(`${name}${suffix}`, fontSize) > width - 24) name = name.slice(0, -1)
    const text = `${name}${name !== place.name ? '…' : ''}${suffix}`
    const boxWidth = Math.min(width - 12, measure(text, fontSize) + 4), boxHeight = fontSize + 4
    const clamp = (value: number, max: number) => Math.max(6, Math.min(max - 6, value))
    const preferred: Pixel = [clamp(place.anchor[0] - boxWidth / 2, width - boxWidth), clamp(place.anchor[1] - boxHeight / 2, height - boxHeight)]
    const candidates: Pixel[] = [preferred, [numberBox.x + numberBox.width + 4, 6]]
    for (const x of [6, (width - boxWidth) / 2, width - boxWidth - 6]) {
      for (const y of [6, (height - boxHeight) / 2, height - boxHeight - 6]) candidates.push([x, y])
    }
    const boxes = candidates.map(([x, y]) => {
      const box = { text, x, y, width: boxWidth, height: boxHeight, fontSize }
      let score = Math.hypot(x - preferred[0], y - preferred[1])
      for (const other of result) score += overlap(box, other) * 100000
      for (const [index, point] of points.entries()) {
        score += overlap(box, { x: point[0] - 20, y: point[1] - 20, width: 40, height: 40 }) * 1000
        const previous = points[index - 1]
        if (previous && crossesBox(previous, point, box)) score += 10000
      }
      return { box, score }
    }).filter(({ box }) => box.x + box.width <= width - 6 && overlap(box, numberBox) === 0)
      .sort((a, b) => a.score - b.score)
    const best = boxes[0]?.box
    if (best && !result.some((placed) => overlap(best, placed) > 0)) result.push(best)
  }
  return result
}

export function drawExportAnnotations(context: CanvasRenderingContext2D, places: readonly ExportPlaceName[], card: ExportCard): void {
  context.save()
  context.scale(card.width / card.mapSize[0], card.mapHeight / card.mapSize[1])
  context.textBaseline = 'middle'
  context.strokeStyle = 'rgba(7, 20, 18, 0.8)'
  context.lineWidth = 2
  context.lineJoin = 'round'
  context.fillStyle = '#f0f7f3'
  function drawText(box: PlaceNameBox): void {
    context.strokeText(box.text, box.x + 2, box.y + box.height / 2, box.width - 4)
    context.fillText(box.text, box.x + 2, box.y + box.height / 2, box.width - 4)
  }
  const placeFont = (fontSize: number) => `500 ${fontSize}px "Map FangXinShu", sans-serif`
  const boxes = placeExportNames(places, card, (text, fontSize) => {
    context.font = placeFont(fontSize)
    return context.measureText(text).width
  })
  for (const box of boxes) {
    context.font = placeFont(box.fontSize)
    drawText(box)
  }
  context.font = '600 11px sans-serif'
  drawText(exportCardNumberBox(card))
  context.restore()
}
