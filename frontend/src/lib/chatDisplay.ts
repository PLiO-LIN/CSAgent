export interface ChatActionInput {
  content?: string
  displayContent?: string
  contentTemplate?: string
  displayTemplate?: string
  clientMeta?: Record<string, any>
  variables?: TemplateVariables
}

export type ChatSendInput = string | ChatActionInput
export type TemplateVariables = Record<string, string | number | boolean | null | undefined>
export type ChatSendHandler = (input: ChatSendInput) => void | Promise<void>
export type EntityAliases = Record<string, string>

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stringifyTemplateValue(value: TemplateVariables[string]) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function fillTemplate(template: string, variables: TemplateVariables = {}) {
  return String(template ?? '')
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => stringifyTemplateValue(variables[key]))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function resolveChatActionInput(input: ChatSendInput) {
  if (typeof input === 'string') {
    const text = input.trim()
    return { content: text, displayContent: text }
  }

  const variables = input.variables || {}
  const content = input.contentTemplate
    ? fillTemplate(input.contentTemplate, variables)
    : String(input.content || '').trim()
  const displayContent = input.displayTemplate
    ? fillTemplate(input.displayTemplate, variables)
    : String(input.displayContent || content).trim()

  return {
    content,
    displayContent: displayContent || content,
    clientMeta: input.clientMeta && typeof input.clientMeta === 'object' ? input.clientMeta : undefined,
  }
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function registerAlias(aliases: EntityAliases, id: unknown, name: unknown) {
  const key = String(id ?? '').trim()
  const value = String(name ?? '').trim()
  if (!key || !value || key === value) return
  aliases[key] = value
}

function pickReadableName(value: Record<string, any>, fallbackName = '') {
  return firstText(
    value.display_name,
    value.displayName,
    value.title,
    value.label,
    value.name,
    value.summary,
    value.description,
    fallbackName,
  )
}

export function extractEntityAliases(card: any): EntityAliases {
  const aliases: EntityAliases = {}
  const seen = new WeakSet<object>()

  const visit = (value: any, fallbackName = '') => {
    if (!value) return
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, fallbackName))
      return
    }
    if (typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)

    const readableName = pickReadableName(value, fallbackName)
    Object.entries(value).forEach(([key, child]) => {
      const lowerKey = key.toLowerCase()
      if (lowerKey === 'id' || lowerKey.endsWith('id') || lowerKey.endsWith('_id')) {
        registerAlias(aliases, child, readableName)
      }
      if (Array.isArray(child)) {
        child.forEach(item => visit(item, readableName))
        return
      }
      if (child && typeof child === 'object') {
        visit(child, readableName)
      }
    })
  }

  visit(card)
  return aliases
}

export function applyEntityAliases(text: string, aliases: EntityAliases): string {
  let result = String(text ?? '')
  if (!result) return ''

  result = result.replace(/^\s*_card_id:\s*.+$/gm, '')

  const entries = Object.entries(aliases)
    .map(([id, name]) => [id.trim(), name.trim()] as const)
    .filter(([id, name]) => id && name && id !== name)
    .sort((a, b) => b[0].length - a[0].length)

  for (const [id, name] of entries) {
    result = result.replace(new RegExp(escapeRegExp(id), 'g'), name)
  }

  return result
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}
