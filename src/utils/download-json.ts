import { serializeJson } from './json.ts'

export function downloadJson(file: { filename: string; data: unknown } | null): void {
  if (!file) return
  const url = URL.createObjectURL(new Blob([`${serializeJson(file.data, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
