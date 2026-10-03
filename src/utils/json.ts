export function serializeJson(value: unknown, space?: number): string {
  if (value === null) return 'null'
  // JSON.stringify preserves array positions as null when the replacer returns undefined.
  const text = JSON.stringify(value, (_key: string, entry: unknown) => entry === null ? undefined : entry, space)
  if (text === undefined) throw new TypeError('无法将该值序列化为 JSON')
  return text
}
