/// <reference lib="webworker" />

import { optimizeRoute } from './optimizer.ts'
import type { RoutePlanInput } from './optimizer.ts'

interface WorkerRequest {
  id: number
  input: RoutePlanInput
}

interface WorkerResponse {
  id: number
  result?: ReturnType<typeof optimizeRoute>
  error?: string
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    response = { id: event.data.id, result: optimizeRoute(event.data.input) }
  } catch (error) {
    response = { id: event.data.id, error: error instanceof Error ? error.message : String(error) }
  }
  self.postMessage(response)
})
