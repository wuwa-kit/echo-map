import type { RouteResult } from '../domain/types.ts'
import type { RoutePlanInput } from './optimizer.ts'
import workerUrl from './route.worker.ts?worker&url'

function createRouteWorker(): Worker {
  const url = new URL(workerUrl, location.href)
  if (url.origin === location.origin) return new Worker(url, { type: 'module' })
  const entry = URL.createObjectURL(new Blob([`import ${JSON.stringify(url.href)}`], { type: 'text/javascript' }))
  try {
    return new Worker(entry, { type: 'module' })
  } finally {
    URL.revokeObjectURL(entry)
  }
}

interface WorkerResponse {
  id: number
  result?: RouteResult
  error?: string
}

let requestId = 0

export function planRouteInWorker(input: RoutePlanInput, signal?: AbortSignal): Promise<RouteResult> {
  signal?.throwIfAborted()
  const worker = createRouteWorker()
  const id = requestId += 1

  return new Promise((resolve, reject) => {
    function cleanup(): void {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    function abort(): void {
      cleanup()
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return
      }
      cleanup()
      if (event.data.result) {
        resolve(event.data.result)
      } else {
        reject(new Error(event.data.error ?? '路线计算失败'))
      }
    })
    worker.addEventListener('error', (event) => {
      cleanup()
      reject(new Error(event.message))
    })
    try {
      worker.postMessage({ id, input })
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
