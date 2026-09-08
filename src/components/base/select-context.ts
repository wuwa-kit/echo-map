import { createInjectionState } from '@vueuse/core'

export type WuSelectValue = string | number | null

export interface WuSelectOptionRecord {
  id: string
  value: WuSelectValue
  label: string
  disabled: boolean
}

export interface WuSelectContext {
  chooseOption: (option: WuSelectOptionRecord) => void
  isSelectedValue: (value: WuSelectValue) => boolean
  registerOption: (option: WuSelectOptionRecord) => void
  unregisterOption: (id: string) => void
  updateOption: (option: WuSelectOptionRecord) => void
}

const [useProvideWuSelectContext, useInjectedWuSelectContext] = createInjectionState(
  (context: WuSelectContext) => context,
)

export { useProvideWuSelectContext }

export function useWuSelectContext(): WuSelectContext {
  const context = useInjectedWuSelectContext()
  if (!context) {
    throw new Error('WuOption 必须在 WuSelect 内使用')
  }
  return context
}
