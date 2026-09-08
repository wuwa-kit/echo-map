import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planRouteInWorker } from '../src/route/worker-client.ts'
import type { RoutePlanInput } from '../src/route/optimizer.ts'

class TestWorker extends EventTarget {
  static instances: TestWorker[] = []
  postMessage = vi.fn<(message: { id: number, input: RoutePlanInput }) => void>()
  terminate = vi.fn()

  constructor() {
    super()
    TestWorker.instances.push(this)
  }
}

const input: RoutePlanInput = { points: [], startPoints: [], connectors: [] }

describe('route worker lifetime', () => {
  beforeEach(() => {
    TestWorker.instances = []
    vi.stubGlobal('Worker', TestWorker)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('terminates a cancelled worker and rejects the pending request', async () => {
    const controller = new AbortController()
    const task = planRouteInWorker(input, controller.signal)
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(TestWorker.instances[0]?.terminate).toHaveBeenCalledOnce()
  })

  it('releases cancellation listeners when a worker completes', async () => {
    const controller = new AbortController()
    const task = planRouteInWorker(input, controller.signal)
    const worker = TestWorker.instances[0]
    const message = worker?.postMessage.mock.calls[0]?.[0]
    if (!worker || !message) {
      throw new Error('Worker 未收到计算请求')
    }
    const result = { points: [], totalCost: 0, algorithm: 'exact', startPointId: null }
    worker.dispatchEvent(new MessageEvent('message', { data: { id: message.id, result } }))
    await expect(task).resolves.toEqual(result)
    controller.abort()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('does not start an already cancelled request', () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => planRouteInWorker(input, controller.signal)).toThrow()
    expect(TestWorker.instances).toHaveLength(0)
  })
})
