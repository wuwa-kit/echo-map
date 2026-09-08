export function elementHasOverflow(element: Pick<HTMLElement, 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'>): boolean {
  const tolerance = 0.5
  return element.scrollWidth > element.clientWidth + tolerance
    || element.scrollHeight > element.clientHeight + tolerance
}
