import { shallowRef } from 'vue'
import { useNavigationIconManagerStore } from '../../src/stores/navigation-icon-manager.ts'

const query = shallowRef<Record<string, unknown>>({})
export function readIconTestQuery(): Record<string, unknown> { return query.value }
export function setIconTestQuery(value: Record<string, unknown>): void { query.value = value }
export function bindIconTestQuery(): void {
  query.value = {}
  useNavigationIconManagerStore().bindQuery({ read: () => query.value, write: setIconTestQuery })
}
