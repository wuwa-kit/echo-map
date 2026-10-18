type SizeElement = {
  offsetWidth: number
  offsetHeight: number
  style: { width: string; height: string }
}

// Offset sizes exclude the scale/translate used by opening animations.
export function floatingExitSize() {
  let release: (() => void) | undefined
  function restore(): void { release?.(); release = undefined }
  function capture(element: SizeElement | null): void {
    if (!element || release || !element.offsetWidth || !element.offsetHeight) return
    const { width, height } = element.style
    const measuredWidth = element.offsetWidth
    const measuredHeight = element.offsetHeight
    element.style.width = `${measuredWidth}px`
    element.style.height = `${measuredHeight}px`
    release = () => { element.style.width = width; element.style.height = height }
  }
  return { capture, restore }
}
