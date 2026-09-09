import type { RouteConnector, RoutePoint, RouteResult } from '../domain/types.ts'

export interface RoutePlanInput {
  points: RoutePoint[]
  startPoints: RoutePoint[]
  connectors: RouteConnector[]
}

interface DistanceContext {
  connectors: RouteConnector[]
}

interface RouteContext extends DistanceContext {
  startPoints: RoutePoint[]
  bestStarts: Map<RoutePoint, { index: number; cost: number }>
}

type SpatialAxis = 0 | 1 | 2

interface SpatialNode {
  index: number
  axis: SpatialAxis
  active: boolean
  activeCount: number
  parent: SpatialNode | null
  left: SpatialNode | null
  right: SpatialNode | null
}

interface SpatialIndex {
  isActive: (index: number) => boolean
  nearest: (target: RoutePoint) => { index: number, cost: number } | null
  remove: (index: number) => void
}

const LARGE_ROUTE_THRESHOLD = 256
// Large route groups share one map and floor, so a removable 3D index can replace repeated full scans.
// Bound both seed routes and local-search reach to keep future data growth from restoring quadratic work.
const LARGE_ROUTE_MAX_SEEDS = 8
const LARGE_ROUTE_LOCAL_PASSES = 2
const LARGE_ROUTE_LOCAL_WINDOW = 64
// Full fragments are joined by endpoint cost; only isolated fragments scan every insertion gap.
const LARGE_ROUTE_GLOBAL_RELOCATION_MAX_LENGTH = 1

function coordinateDistance(left: RoutePoint['coordinate'], right: RoutePoint['coordinate']): number {
  const dx = left.x - right.x
  const dy = left.y - right.y
  const dz = left.z - right.z
  return Math.hypot(dx, dy, dz)
}

export function movementCost(left: RoutePoint, right: RoutePoint, context: DistanceContext): number {
  if (left.stateId !== right.stateId) {
    return Number.POSITIVE_INFINITY
  }
  if (left.levelId === right.levelId) {
    return coordinateDistance(left.coordinate, right.coordinate)
  }

  let best = Number.POSITIVE_INFINITY
  for (const connector of context.connectors) {
    if (connector.stateId !== left.stateId) {
      continue
    }
    if (connector.fromLevelId === left.levelId && connector.toLevelId === right.levelId) {
      best = Math.min(best,
        coordinateDistance(left.coordinate, connector.from)
        + connector.traversalCost
        + coordinateDistance(connector.to, right.coordinate))
    }
    if (connector.toLevelId === left.levelId && connector.fromLevelId === right.levelId) {
      best = Math.min(best,
        coordinateDistance(left.coordinate, connector.to)
        + connector.traversalCost
        + coordinateDistance(connector.from, right.coordinate))
    }
  }
  return best
}

function travelCost(left: RoutePoint | null, right: RoutePoint, context: RouteContext): number {
  const startCost = context.bestStarts.get(right)?.cost ?? Number.POSITIVE_INFINITY
  if (!left) return startCost
  const walkCost = movementCost(left, right, context)
  return context.startPoints.length > 0 ? Math.min(walkCost, startCost) : walkCost
}

function routeCost(order: number[], points: RoutePoint[], context: RouteContext): number {
  if (order.length === 0) {
    return 0
  }

  let total = travelCost(null, points[order[0] as number] as RoutePoint, context)
  for (let index = 1; index < order.length; index += 1) {
    total += travelCost(points[order[index - 1] as number] as RoutePoint, points[order[index] as number] as RoutePoint, context)
  }
  return total
}

function bestStart(point: RoutePoint, startPoints: RoutePoint[], context: DistanceContext): { index: number; cost: number } {
  if (startPoints.length === 0) {
    return { index: -1, cost: 0 }
  }

  let index = -1
  let cost = Number.POSITIVE_INFINITY
  startPoints.forEach((startPoint, candidateIndex) => {
    const candidateCost = movementCost(startPoint, point, context)
    if (candidateCost < cost) {
      cost = candidateCost
      index = candidateIndex
    }
  })
  return { index, cost }
}

function spatialAxis(depth: number): SpatialAxis {
  const axis = depth % 3
  if (axis === 0 || axis === 1) return axis
  return 2
}

function coordinateComponent(point: RoutePoint, axis: SpatialAxis): number {
  if (axis === 0) return point.coordinate.x
  if (axis === 1) return point.coordinate.y
  return point.coordinate.z
}

function squaredCoordinateDistance(left: RoutePoint, right: RoutePoint): number {
  const dx = left.coordinate.x - right.coordinate.x
  const dy = left.coordinate.y - right.coordinate.y
  const dz = left.coordinate.z - right.coordinate.z
  return dx * dx + dy * dy + dz * dz
}

function createSpatialIndex(points: RoutePoint[]): SpatialIndex {
  const nodes = new Array<SpatialNode | undefined>(points.length)

  function build(indices: number[], depth: number, parent: SpatialNode | null): SpatialNode | null {
    if (indices.length === 0) return null
    const axis = spatialAxis(depth)
    const sorted = [...indices].sort((left, right) => (
      coordinateComponent(points[left] as RoutePoint, axis) - coordinateComponent(points[right] as RoutePoint, axis)
      || left - right
    ))
    const middle = Math.floor(sorted.length / 2)
    const index = sorted[middle]
    if (index === undefined) return null
    const node: SpatialNode = {
      index,
      axis,
      active: true,
      activeCount: 1,
      parent,
      left: null,
      right: null,
    }
    nodes[index] = node
    node.left = build(sorted.slice(0, middle), depth + 1, node)
    node.right = build(sorted.slice(middle + 1), depth + 1, node)
    node.activeCount += (node.left?.activeCount ?? 0) + (node.right?.activeCount ?? 0)
    return node
  }

  const root = build(points.map((_, index) => index), 0, null)

  return {
    isActive(index): boolean {
      return nodes[index]?.active ?? false
    },
    nearest(target): { index: number, cost: number } | null {
      let bestIndex = -1
      let bestSquaredCost = Number.POSITIVE_INFINITY

      function visit(node: SpatialNode | null): void {
        if (!node || node.activeCount === 0) return
        const point = points[node.index] as RoutePoint
        const delta = coordinateComponent(target, node.axis) - coordinateComponent(point, node.axis)
        const near = delta <= 0 ? node.left : node.right
        const far = delta <= 0 ? node.right : node.left
        visit(near)
        if (node.active) {
          const cost = squaredCoordinateDistance(target, point)
          if (cost < bestSquaredCost || (cost === bestSquaredCost && node.index < bestIndex)) {
            bestIndex = node.index
            bestSquaredCost = cost
          }
        }
        if (delta * delta <= bestSquaredCost) visit(far)
      }

      visit(root)
      return bestIndex < 0 ? null : { index: bestIndex, cost: Math.sqrt(bestSquaredCost) }
    },
    remove(index): void {
      let node = nodes[index]
      if (!node?.active) return
      node.active = false
      while (node) {
        node.activeCount -= 1
        node = node.parent ?? undefined
      }
    },
  }
}

function createResult(points: RoutePoint[], algorithm: RouteResult['algorithm'], context: RouteContext): RouteResult {
  let totalCost = 0
  const visits: RouteResult['points'] = points.map((point, index) => {
    const previous = points[index - 1] ?? null
    const start = context.bestStarts.get(point)
    const teleportFrom = start && (!previous || start.cost < movementCost(previous, point, context))
      ? context.startPoints[start.index]
      : undefined
    totalCost += travelCost(previous, point, context)
    return teleportFrom ? { ...point, teleportFrom } : point
  })
  return { points: visits, totalCost, algorithm, startPointId: visits[0]?.teleportFrom?.id ?? null }
}

function exactRoute(input: RoutePlanInput, context: RouteContext): RouteResult {
  const { points } = input
  const count = points.length
  const stateCount = 1 << count
  const cellCount = stateCount * count
  const costs = new Float64Array(cellCount)
  costs.fill(Number.POSITIVE_INFINITY)
  const previous = new Int16Array(cellCount)
  previous.fill(-1)

  for (let index = 0; index < count; index += 1) {
    const cell = (1 << index) * count + index
    costs[cell] = travelCost(null, points[index] as RoutePoint, context)
  }

  for (let mask = 1; mask < stateCount; mask += 1) {
    for (let last = 0; last < count; last += 1) {
      if ((mask & (1 << last)) === 0) {
        continue
      }
      const cell = mask * count + last
      const currentCost = costs[cell] as number
      if (!Number.isFinite(currentCost)) {
        continue
      }
      for (let next = 0; next < count; next += 1) {
        if ((mask & (1 << next)) !== 0) {
          continue
        }
        const nextMask = mask | (1 << next)
        const nextCell = nextMask * count + next
        const candidate = currentCost + travelCost(points[last] as RoutePoint, points[next] as RoutePoint, context)
        if (candidate < (costs[nextCell] as number)) {
          costs[nextCell] = candidate
          previous[nextCell] = last
        }
      }
    }
  }

  const fullMask = stateCount - 1
  let last = -1
  let totalCost = Number.POSITIVE_INFINITY
  for (let index = 0; index < count; index += 1) {
    const value = costs[fullMask * count + index] as number
    if (value < totalCost) {
      totalCost = value
      last = index
    }
  }
  if (last < 0 || !Number.isFinite(totalCost)) {
    throw new Error('当前点位之间缺少可用的楼层连接关系')
  }

  const order: number[] = []
  let mask = fullMask
  while (last >= 0) {
    order.push(last)
    const cell = mask * count + last
    const nextLast = previous[cell] as number
    mask ^= 1 << last
    last = nextLast
  }
  order.reverse()

  return createResult(order.map((index) => points[index] as RoutePoint), 'exact', context)
}

function greedyOrder(points: RoutePoint[], start: RoutePoint | null, context: RouteContext): number[] | null {
  const remaining = new Set(points.map((_, index) => index))
  const order: number[] = []
  let current = start
  while (remaining.size > 0) {
    let bestIndex = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (const index of remaining) {
      // Each seed chooses its first target; all later legs may teleport again.
      const cost = order.length === 0 && current
        ? movementCost(current, points[index] as RoutePoint, context)
        : travelCost(current, points[index] as RoutePoint, context)
      if (cost < bestCost) {
        bestCost = cost
        bestIndex = index
      }
    }
    if (bestIndex < 0 || !Number.isFinite(bestCost)) {
      return null
    }
    order.push(bestIndex)
    remaining.delete(bestIndex)
    current = points[bestIndex] as RoutePoint
  }
  return order
}

function uniformRouteContext(points: RoutePoint[]): boolean {
  const first = points[0]
  return first !== undefined && points.every((point) => point.stateId === first.stateId && point.levelId === first.levelId)
}

function greedySpatialOrder(points: RoutePoint[], start: RoutePoint | null, context: RouteContext): number[] | null {
  const spatial = createSpatialIndex(points)
  const teleportCandidates = context.startPoints.length === 0 ? [] : points.map((point, index) => ({
    index,
    cost: context.bestStarts.get(point)?.cost ?? Number.POSITIVE_INFINITY,
  })).sort((left, right) => left.cost - right.cost || left.index - right.index)
  let teleportCursor = 0
  const order: number[] = []

  function nextTeleport(): { index: number, cost: number } | null {
    while (teleportCursor < teleportCandidates.length) {
      const candidate = teleportCandidates[teleportCursor]
      if (candidate && spatial.isActive(candidate.index)) return candidate
      teleportCursor += 1
    }
    return null
  }

  const firstPoint = points[0]
  const initial = start && firstPoint && start.stateId === firstPoint.stateId && start.levelId === firstPoint.levelId
    ? spatial.nearest(start)
    : nextTeleport() ?? (firstPoint ? { index: 0, cost: 0 } : null)
  if (!initial || !Number.isFinite(initial.cost)) return null
  order.push(initial.index)
  spatial.remove(initial.index)

  while (order.length < points.length) {
    const currentIndex = order[order.length - 1]
    const current = currentIndex === undefined ? null : points[currentIndex]
    if (!current) return null
    const walking = spatial.nearest(current)
    const teleport = nextTeleport()
    const candidate = teleport && (!walking || teleport.cost < walking.cost) ? teleport : walking
    if (!candidate || !Number.isFinite(candidate.cost)) return null
    order.push(candidate.index)
    spatial.remove(candidate.index)
  }
  return order
}

function improveWithTwoOpt(
  order: number[],
  points: RoutePoint[],
  context: RouteContext,
  maxPasses = 8,
  maxSpan = Number.POSITIVE_INFINITY,
): number[] {
  const result = [...order]
  let improved = true
  let passes = 0
  while (improved && passes < maxPasses) {
    improved = false
    passes += 1
    for (let left = 0; left < result.length - 1; left += 1) {
      let reversalCost = 0
      for (let right = left + 1; right < result.length && right <= left + maxSpan; right += 1) {
        const leftPoint = points[result[left] as number] as RoutePoint
        const rightPoint = points[result[right] as number] as RoutePoint
        const beforeRight = points[result[right - 1] as number] as RoutePoint
        // Teleport costs depend on the destination, so reversing inner edges is not free.
        reversalCost += travelCost(rightPoint, beforeRight, context) - travelCost(beforeRight, rightPoint, context)
        const previousPoint = left === 0 ? null : points[result[left - 1] as number] as RoutePoint
        const nextPoint = right === result.length - 1 ? null : points[result[right + 1] as number] as RoutePoint
        const before = travelCost(previousPoint, leftPoint, context)
          + (nextPoint ? travelCost(rightPoint, nextPoint, context) : 0)
        const after = travelCost(previousPoint, rightPoint, context)
          + (nextPoint ? travelCost(leftPoint, nextPoint, context) : 0)
          + reversalCost
        if (after + 1e-6 < before) {
          const reversed = result.slice(left, right + 1).reverse()
          result.splice(left, reversed.length, ...reversed)
          improved = true
          break
        }
      }
    }
  }
  return result
}

function improveWithRelocation(
  order: number[],
  points: RoutePoint[],
  context: RouteContext,
  maxPasses = 8,
  maxGapDistance = Number.POSITIVE_INFINITY,
  globalSegmentMaxLength = 0,
): number[] {
  const result = [...order]
  const pointAt = (index: number): RoutePoint | null => points[result[index] ?? -1] ?? null
  const edgeCost = (from: RoutePoint | null, to: RoutePoint | null): number => to ? travelCost(from, to, context) : 0

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false
    for (let left = 0; left < result.length; left += 1) {
      const first = pointAt(left)
      if (!first) continue
      const previous = pointAt(left - 1)
      const lengths = new Set([1, 2, 3].filter((length) => left + length <= result.length))
      let walkingSegmentLength: number | null = null
      // Moving a walking segment preserves its internal edges, unlike 2-opt reversal.
      // Include complete segments so a large local group can rejoin a nearby stop.
      if (!previous || travelCost(previous, first, context) < movementCost(previous, first, context)) {
        let end = left + 1
        while (end < result.length) {
          const before = pointAt(end - 1)
          const next = pointAt(end)
          if (!before || !next || travelCost(before, next, context) < movementCost(before, next, context)) break
          end += 1
        }
        walkingSegmentLength = end - left
        lengths.add(walkingSegmentLength)
      }

      let bestDelta = -1e-6
      let bestLength = 0
      let bestGap = -1
      for (const length of lengths) {
        const last = pointAt(left + length - 1)
        const next = pointAt(left + length)
        const removalDelta = edgeCost(previous, next) - edgeCost(previous, first) - edgeCost(last, next)
        const gapDistance = length === walkingSegmentLength && length <= globalSegmentMaxLength
          ? Number.POSITIVE_INFINITY
          : maxGapDistance
        const firstGap = Math.max(0, left - gapDistance)
        const lastGap = Math.min(result.length, left + length + gapDistance)
        for (let gap = firstGap; gap <= lastGap; gap += 1) {
          if (gap >= left && gap <= left + length) continue
          const beforeInsertion = pointAt(gap - 1)
          const afterInsertion = pointAt(gap)
          const delta = removalDelta + edgeCost(beforeInsertion, first) + edgeCost(last, afterInsertion)
            - edgeCost(beforeInsertion, afterInsertion)
          if (delta < bestDelta) {
            bestDelta = delta
            bestLength = length
            bestGap = gap
          }
        }
      }
      if (bestGap >= 0) {
        const segment = result.splice(left, bestLength)
        result.splice(bestGap > left ? bestGap - bestLength : bestGap, 0, ...segment)
        improved = true
      }
    }
    if (!improved) break
  }
  return result
}

function stitchWalkingSegments(order: number[], points: RoutePoint[], context: RouteContext): number[] {
  const segments: number[][] = []
  let segment: number[] = []
  for (const pointIndex of order) {
    const previousIndex = segment[segment.length - 1]
    if (previousIndex !== undefined) {
      const previous = points[previousIndex] as RoutePoint
      const point = points[pointIndex] as RoutePoint
      if (travelCost(previous, point, context) < movementCost(previous, point, context)) {
        segments.push(segment)
        segment = []
      }
    }
    segment.push(pointIndex)
  }
  if (segment.length > 0) segments.push(segment)
  if (segments.length < 2) return [...order]

  const joins: { from: number, to: number, saving: number }[] = []
  for (let from = 0; from < segments.length; from += 1) {
    const fromOrder = segments[from] as number[]
    const endIndex = fromOrder[fromOrder.length - 1]
    if (endIndex === undefined) continue
    const end = points[endIndex] as RoutePoint
    for (let to = 0; to < segments.length; to += 1) {
      if (from === to) continue
      const startIndex = (segments[to] as number[])[0]
      if (startIndex === undefined) continue
      const start = points[startIndex] as RoutePoint
      const saving = travelCost(null, start, context) - travelCost(end, start, context)
      if (saving > 1e-6) joins.push({ from, to, saving })
    }
  }
  joins.sort((left, right) => right.saving - left.saving || left.from - right.from || left.to - right.to)

  const parents = segments.map((_, index) => index)
  const incoming = new Int32Array(segments.length).fill(-1)
  const outgoing = new Int32Array(segments.length).fill(-1)
  function root(index: number): number {
    let result = index
    while ((parents[result] as number) !== result) result = parents[result] as number
    while ((parents[index] as number) !== index) {
      const parent = parents[index] as number
      parents[index] = result
      index = parent
    }
    return result
  }
  for (const { from, to } of joins) {
    if ((outgoing[from] as number) >= 0 || (incoming[to] as number) >= 0) continue
    const fromRoot = root(from)
    const toRoot = root(to)
    if (fromRoot === toRoot) continue
    outgoing[from] = to
    incoming[to] = from
    parents[toRoot] = fromRoot
  }

  const result: number[] = []
  for (let current = 0; current < segments.length; current += 1) {
    if ((incoming[current] as number) >= 0) continue
    let next = current
    while (next >= 0) {
      result.push(...(segments[next] as number[]))
      next = outgoing[next] as number
    }
  }
  return result
}

function heuristicRoute(input: RoutePlanInput, context: RouteContext): RouteResult {
  const starts: (RoutePoint | null)[] = input.startPoints.length > 0 ? input.startPoints : [null]
  let bestOrder: number[] = []
  let bestCost = Number.POSITIVE_INFINITY
  const seenOrders = new Set<string>()
  for (const start of starts) {
    const seed = greedyOrder(input.points, start, context)
    if (!seed || seenOrders.has(seed.join(','))) continue
    seenOrders.add(seed.join(','))
    const order = improveWithTwoOpt(seed, input.points, context)
    const cost = routeCost(order, input.points, context)
    if (cost < bestCost) {
      bestOrder = order
      bestCost = cost
    }
  }

  if (!Number.isFinite(bestCost)) {
    throw new Error('无法为当前点位生成连通路线')
  }
  const order = improveWithTwoOpt(improveWithRelocation(bestOrder, input.points, context), input.points, context)
  return createResult(order.map((index) => input.points[index] as RoutePoint), 'nearest-neighbor-2opt', context)
}

function largeRouteStarts(input: RoutePlanInput, context: RouteContext): (RoutePoint | null)[] {
  if (input.startPoints.length === 0) return [null]
  if (input.startPoints.length <= LARGE_ROUTE_MAX_SEEDS) return input.startPoints
  const rankedTargets = input.points.map((point, index) => ({
    index,
    start: context.bestStarts.get(point),
  })).sort((left, right) => (
    (left.start?.cost ?? Number.POSITIVE_INFINITY) - (right.start?.cost ?? Number.POSITIVE_INFINITY)
    || left.index - right.index
  ))
  const selected = new Set<number>()
  for (const { start } of rankedTargets) {
    if (!start || start.index < 0 || !Number.isFinite(start.cost)) continue
    selected.add(start.index)
    if (selected.size === LARGE_ROUTE_MAX_SEEDS) break
  }
  return selected.size > 0
    ? [...selected].map((index) => input.startPoints[index] as RoutePoint)
    : [null]
}

function largeHeuristicRoute(input: RoutePlanInput, context: RouteContext): RouteResult {
  const spatial = uniformRouteContext(input.points)
  let bestOrder: number[] = []
  let bestCost = Number.POSITIVE_INFINITY
  const seenOrders = new Set<string>()
  for (const start of largeRouteStarts(input, context)) {
    const seed = spatial
      ? greedySpatialOrder(input.points, start, context)
      : greedyOrder(input.points, start, context)
    if (!seed || seenOrders.has(seed.join(','))) continue
    seenOrders.add(seed.join(','))
    const order = improveWithTwoOpt(
      seed, input.points, context, LARGE_ROUTE_LOCAL_PASSES, LARGE_ROUTE_LOCAL_WINDOW,
    )
    const cost = routeCost(order, input.points, context)
    if (cost < bestCost) {
      bestOrder = order
      bestCost = cost
    }
  }
  if (!Number.isFinite(bestCost)) throw new Error('无法为当前点位生成连通路线')
  const stitched = stitchWalkingSegments(bestOrder, input.points, context)
  const relocated = improveWithRelocation(
    stitched, input.points, context, LARGE_ROUTE_LOCAL_PASSES, LARGE_ROUTE_LOCAL_WINDOW,
    LARGE_ROUTE_GLOBAL_RELOCATION_MAX_LENGTH,
  )
  const locallyImproved = improveWithTwoOpt(
    relocated, input.points, context, LARGE_ROUTE_LOCAL_PASSES, LARGE_ROUTE_LOCAL_WINDOW,
  )
  const order = stitchWalkingSegments(locallyImproved, input.points, context)
  return createResult(order.map((index) => input.points[index] as RoutePoint), 'nearest-neighbor-2opt', context)
}

export function optimizeRoute(input: RoutePlanInput): RouteResult {
  if (input.points.length === 0) {
    throw new Error('当前筛选条件下没有已录入 XYZ 的声骸点')
  }
  const context: RouteContext = {
    connectors: input.connectors,
    startPoints: input.startPoints,
    bestStarts: new Map(input.points.map((point) => [point, bestStart(point, input.startPoints, input)])),
  }
  if (input.points.length <= 15) return exactRoute(input, context)
  return input.points.length <= LARGE_ROUTE_THRESHOLD
    ? heuristicRoute(input, context)
    : largeHeuristicRoute(input, context)
}
