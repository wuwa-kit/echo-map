export type UnknownRecord = Record<string, unknown>

export function asRecord(value: unknown, context: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} 应为对象`)
  }

  return value as UnknownRecord
}

export function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} 应为数组`)
  }

  return value
}

export function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) {
    return fallback
  }

  return String(value)
}

export function asNumber(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

export function nested(record: UnknownRecord, ...keys: string[]): unknown {
  let current: unknown = record
  for (const key of keys) {
    current = asRecord(current, keys.join('.'))[key]
  }
  return current
}
