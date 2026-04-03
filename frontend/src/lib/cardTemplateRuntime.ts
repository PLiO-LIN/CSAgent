export function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isTemplateCard(card: any) {
  return isPlainObject(card) && isPlainObject(card.payload) && isPlainObject(card.ui_schema)
}

export function resolveTemplatePath(source: any, expr: unknown): any {
  const text = String(expr ?? '').trim()
  if (!text) return undefined
  if (text === '$') return source
  if (!text.startsWith('$.')) return expr

  let current = source
  let cursor = text.slice(2)
  while (cursor) {
    if (cursor.startsWith('[')) {
      const end = cursor.indexOf(']')
      if (end < 0) return undefined
      const token = cursor.slice(1, end).trim()
      cursor = cursor.slice(end + 1)
      if (cursor.startsWith('.')) cursor = cursor.slice(1)
      if (!Array.isArray(current)) return undefined
      const index = Number(token)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined
      current = current[index]
      continue
    }

    const dotIndex = cursor.indexOf('.')
    const bracketIndex = cursor.indexOf('[')
    let stop = cursor.length
    if (dotIndex >= 0) stop = Math.min(stop, dotIndex)
    if (bracketIndex >= 0) stop = Math.min(stop, bracketIndex)
    const segment = cursor.slice(0, stop)
    cursor = cursor.slice(stop)
    if (cursor.startsWith('.')) cursor = cursor.slice(1)

    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined
      current = current[index]
      continue
    }
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }

  return current
}

export function displayScalar(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value) || isPlainObject(value)) {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function toArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (isPlainObject(value)) {
    return Object.entries(value).map(([label, item]) => ({ label, value: item }))
  }
  return []
}

export function templateText(source: any, expr: unknown, fallback = '') {
  const value = typeof expr === 'string' ? resolveTemplatePath(source, expr) : expr
  const text = String(value ?? '').trim()
  return text || fallback
}

export function normalizeActionList(value: unknown): Array<Record<string, any>> {
  if (!Array.isArray(value)) return []
  return value.filter(isPlainObject).map(item => ({ ...item }))
}
