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

function improveWithTwoOpt(order: number[], points: RoutePoint[], context: RouteContext): number[] {
  const result = [...order]
  let improved = true
  let passes = 0
  while (improved && passes < 8) {
    improved = false
    passes += 1
    for (let left = 0; left < result.length - 1; left += 1) {
      let reversalCost = 0
      for (let right = left + 1; right < result.length; right += 1) {
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

function improveWithRelocation(order: number[], points: RoutePoint[], context: RouteContext): number[] {
  const result = [...order]
  const pointAt = (index: number): RoutePoint | null => points[result[index] ?? -1] ?? null
  const edgeCost = (from: RoutePoint | null, to: RoutePoint | null): number => to ? travelCost(from, to, context) : 0

  for (let pass = 0; pass < 8; pass += 1) {
    let improved = false
    for (let left = 0; left < result.length; left += 1) {
      const first = pointAt(left)
      if (!first) continue
      const previous = pointAt(left - 1)
      const lengths = new Set([1, 2, 3].filter((length) => left + length <= result.length))
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
        lengths.add(end - left)
      }

      let bestDelta = -1e-6
      let bestLength = 0
      let bestGap = -1
      for (const length of lengths) {
        const last = pointAt(left + length - 1)
        const next = pointAt(left + length)
        const removalDelta = edgeCost(previous, next) - edgeCost(previous, first) - edgeCost(last, next)
        for (let gap = 0; gap <= result.length; gap += 1) {
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

export function optimizeRoute(input: RoutePlanInput): RouteResult {
  if (input.points.length === 0) {
    throw new Error('当前筛选条件下没有已录入 XYZ 的声骸点')
  }
  const context: RouteContext = {
    connectors: input.connectors,
    startPoints: input.startPoints,
    bestStarts: new Map(input.points.map((point) => [point, bestStart(point, input.startPoints, input)])),
  }
  return input.points.length <= 15 ? exactRoute(input, context) : heuristicRoute(input, context)
}
