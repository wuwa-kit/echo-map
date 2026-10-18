import { expect, it } from 'vitest'
import { floatingExitSize } from '../src/components/base/floating-exit-size.ts'

it('holds the unscaled exit size and restores responsive sizing on reopening', () => {
  const element = { offsetWidth: 420, offsetHeight: 216, style: { width: '', height: '' } }
  const size = floatingExitSize()
  size.capture(element)
  expect(element.style).toEqual({ width: '420px', height: '216px' })
  element.offsetHeight = 80
  size.capture(element)
  expect(element.style.height).toBe('216px')
  size.restore()
  expect(element.style).toEqual({ width: '', height: '' })
  element.offsetWidth = 360
  size.capture(element)
  expect(element.style.width).toBe('360px')
  size.restore()
})

it('preserves inline popover widths and ignores already hidden panels', () => {
  const element = { offsetWidth: 240, offsetHeight: 180, style: { width: '240px', height: '' } }
  const size = floatingExitSize()
  size.capture(element)
  size.restore()
  expect(element.style).toEqual({ width: '240px', height: '' })
  element.offsetHeight = 0
  size.capture(element)
  expect(element.style.height).toBe('')
})
