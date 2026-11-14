import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planRouteInWorker } from '../src/route/worker-client.ts'
import type { RoutePlanInput } from '../src/route/optimizer.ts'

vi.mock('../src/route/route.worker.ts?worker&url', () => ({ default: 'https://cdn.example.com/route.worker.js' }))

class TestWorker extends EventTarget {
  static instances: TestWorker[] = []
  postMessage = vi.fn<(message: { id: number, input: RoutePlanInput }) => void>()
  terminate = vi.fn()

  readonly url: string | URL

  constructor(url: string | URL) {
    super()
    this.url = url
    TestWorker.instances.push(this)
  }
}

const input: RoutePlanInput = { points: [], startPoints: [], connectors: [] }

describe('route worker lifetime', () => {
  beforeEach(() => {
    TestWorker.instances = []
    vi.stubGlobal('Worker', TestWorker)
    vi.stubGlobal('location', new URL('http://localhost/'))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads a cross-origin worker through a released blob entry', async () => {
    const create = vi.spyOn(URL, 'createObjectURL')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const controller = new AbortController()
    const task = planRouteInWorker(input, controller.signal)
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    const blob = create.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    if (!(blob instanceof Blob)) throw new Error('Worker 入口不是 Blob')
    expect(await blob.text()).toBe('import "https://cdn.example.com/route.worker.js"')
    expect(TestWorker.instances[0]?.url).toBe(create.mock.results[0]?.value)
    expect(revoke).toHaveBeenCalledWith(TestWorker.instances[0]?.url)
  })

  it('uses the worker URL directly on the same origin', async () => {
    vi.stubGlobal('location', new URL('https://cdn.example.com/'))
    const create = vi.spyOn(URL, 'createObjectURL')
    const controller = new AbortController()
    const task = planRouteInWorker(input, controller.signal)
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(String(TestWorker.instances[0]?.url)).toBe('https://cdn.example.com/route.worker.js')
    expect(create).not.toHaveBeenCalled()
  })

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
