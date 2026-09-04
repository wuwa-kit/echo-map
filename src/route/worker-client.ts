import type { RouteResult } from '../domain/types.ts'
import type { RoutePlanInput } from './optimizer.ts'

interface WorkerResponse {
  id: number
  result?: RouteResult
  error?: string
}

let requestId = 0

export function planRouteInWorker(input: RoutePlanInput): Promise<RouteResult> {
  const worker = new Worker(new URL('./route.worker.ts', import.meta.url), { type: 'module' })
  const id = requestId += 1

  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return
      }
      worker.terminate()
      if (event.data.result) {
        resolve(event.data.result)
      } else {
        reject(new Error(event.data.error ?? '路线计算失败'))
      }
    })
    worker.addEventListener('error', (event) => {
      worker.terminate()
      reject(new Error(event.message))
    })
    worker.postMessage({ id, input })
  })
}
