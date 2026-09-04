import { computed } from 'vue'
import { isJsonEqual } from '../utils/equal.ts'
import type { ComputedRef } from 'vue'

export type EqualityComparator<T> = (left: T, right: T) => boolean

export function useEqualComputed<T extends object>(
  getter: () => T,
  isEqual: EqualityComparator<T> = isJsonEqual,
): ComputedRef<T> {
  return computed<T>((previous) => {
    const next = getter()
    return previous !== undefined && isEqual(previous, next) ? previous : next
  })
}
