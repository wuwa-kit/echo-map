import type { RouteConnector, RoutePoint, RouteResult } from '../domain/types.ts'

export interface RoutePlanInput {
  points: RoutePoint[]
  startPoints: RoutePoint[]
  connectors: RouteConnector[]
  zWeight: number
}

interface DistanceContext {
  connectors: RouteConnector[]
  zWeight: number
}

function coordinateDistance(left: RoutePoint['coordinate'], right: RoutePoint['coordinate'], zWeight: number): number {
  const dx = left.x - right.x
  const dy = left.y - right.y
  const dz = (left.z - right.z) * zWeight
  return Math.hypot(dx, dy, dz)
}

export function movementCost(left: RoutePoint, right: RoutePoint, context: DistanceContext): number {
  if (left.stateId !== right.stateId) {
    return Number.POSITIVE_INFINITY
  }
  if (left.levelId === right.levelId) {
    return coordinateDistance(left.coordinate, right.coordinate, context.zWeight)
  }

  let best = Number.POSITIVE_INFINITY
  for (const connector of context.connectors) {
    if (connector.stateId !== left.stateId) {
      continue
    }
    if (connector.fromLevelId === left.levelId && connector.toLevelId === right.levelId) {
      best = Math.min(best,
        coordinateDistance(left.coordinate, connector.from, context.zWeight)
        + connector.traversalCost
        + coordinateDistance(connector.to, right.coordinate, context.zWeight))
    }
    if (connector.toLevelId === left.levelId && connector.fromLevelId === right.levelId) {
      best = Math.min(best,
        coordinateDistance(left.coordinate, connector.to, context.zWeight)
        + connector.traversalCost
        + coordinateDistance(connector.from, right.coordinate, context.zWeight))
    }
  }
  return best
}

function routeCost(order: number[], points: RoutePoint[], start: RoutePoint | null, context: DistanceContext): number {
  if (order.length === 0) {
    return 0
  }

  let total = start ? movementCost(start, points[order[0] as number] as RoutePoint, context) : 0
  for (let index = 1; index < order.length; index += 1) {
    total += movementCost(points[order[index - 1] as number] as RoutePoint, points[order[index] as number] as RoutePoint, context)
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

function exactRoute(input: RoutePlanInput): RouteResult {
  const { points, startPoints } = input
  const context: DistanceContext = { connectors: input.connectors, zWeight: input.zWeight }
  const count = points.length
  const stateCount = 1 << count
  const cellCount = stateCount * count
  const costs = new Float64Array(cellCount)
  costs.fill(Number.POSITIVE_INFINITY)
  const previous = new Int16Array(cellCount)
  previous.fill(-1)
  const starts = new Int16Array(cellCount)
  starts.fill(-1)

  for (let index = 0; index < count; index += 1) {
    const start = bestStart(points[index] as RoutePoint, startPoints, context)
    const cell = (1 << index) * count + index
    costs[cell] = start.cost
    starts[cell] = start.index
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
        const candidate = currentCost + movementCost(points[last] as RoutePoint, points[next] as RoutePoint, context)
        if (candidate < (costs[nextCell] as number)) {
          costs[nextCell] = candidate
          previous[nextCell] = last
          starts[nextCell] = starts[cell] as number
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

  const startIndex = starts[fullMask * count + last] as number
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

  return {
    points: order.map((index) => points[index] as RoutePoint),
    totalCost,
    algorithm: 'exact',
    startPointId: startIndex >= 0 ? (startPoints[startIndex]?.id ?? null) : null,
  }
}

function greedyOrder(points: RoutePoint[], start: RoutePoint | null, context: DistanceContext): number[] {
  const remaining = new Set(points.map((_, index) => index))
  const order: number[] = []
  let current = start
  while (remaining.size > 0) {
    let bestIndex = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (const index of remaining) {
      const cost = current ? movementCost(current, points[index] as RoutePoint, context) : 0
      if (cost < bestCost) {
        bestCost = cost
        bestIndex = index
      }
    }
    if (bestIndex < 0 || !Number.isFinite(bestCost)) {
      throw new Error('当前点位之间缺少可用的楼层连接关系')
    }
    order.push(bestIndex)
    remaining.delete(bestIndex)
    current = points[bestIndex] as RoutePoint
  }
  return order
}

function improveWithTwoOpt(order: number[], points: RoutePoint[], start: RoutePoint | null, context: DistanceContext): number[] {
  const result = [...order]
  let improved = true
  let passes = 0
  while (improved && passes < 8) {
    improved = false
    passes += 1
    for (let left = 0; left < result.length - 1; left += 1) {
      for (let right = left + 1; right < result.length; right += 1) {
        const leftPoint = points[result[left] as number] as RoutePoint
        const rightPoint = points[result[right] as number] as RoutePoint
        const previousPoint = left === 0 ? start : points[result[left - 1] as number] as RoutePoint
        const nextPoint = right === result.length - 1 ? null : points[result[right + 1] as number] as RoutePoint
        const before = (previousPoint ? movementCost(previousPoint, leftPoint, context) : 0)
          + (nextPoint ? movementCost(rightPoint, nextPoint, context) : 0)
        const after = (previousPoint ? movementCost(previousPoint, rightPoint, context) : 0)
          + (nextPoint ? movementCost(leftPoint, nextPoint, context) : 0)
        if (after + 1e-6 < before) {
          const reversed = result.slice(left, right + 1).reverse()
          result.splice(left, reversed.length, ...reversed)
          improved = true
        }
      }
    }
  }
  return result
}

function heuristicRoute(input: RoutePlanInput): RouteResult {
  const context: DistanceContext = { connectors: input.connectors, zWeight: input.zWeight }
  const starts: Array<{ point: RoutePoint | null; index: number }> = input.startPoints.length > 0
    ? input.startPoints.map((point, index) => ({ point, index }))
    : [{ point: null, index: -1 }]
  let bestOrder: number[] = []
  let bestCost = Number.POSITIVE_INFINITY
  let bestStartIndex = -1
  for (const start of starts) {
    const order = improveWithTwoOpt(greedyOrder(input.points, start.point, context), input.points, start.point, context)
    const cost = routeCost(order, input.points, start.point, context)
    if (cost < bestCost) {
      bestOrder = order
      bestCost = cost
      bestStartIndex = start.index
    }
  }

  if (!Number.isFinite(bestCost)) {
    throw new Error('无法为当前点位生成连通路线')
  }
  return {
    points: bestOrder.map((index) => input.points[index] as RoutePoint),
    totalCost: bestCost,
    algorithm: 'nearest-neighbor-2opt',
    startPointId: bestStartIndex >= 0 ? (input.startPoints[bestStartIndex]?.id ?? null) : null,
  }
}

export function optimizeRoute(input: RoutePlanInput): RouteResult {
  if (input.points.length === 0) {
    throw new Error('当前筛选条件下没有已录入 XYZ 的声骸点')
  }
  if (input.zWeight <= 0 || !Number.isFinite(input.zWeight)) {
    throw new Error('高度权重必须大于 0')
  }

  return input.points.length <= 15 ? exactRoute(input) : heuristicRoute(input)
}
