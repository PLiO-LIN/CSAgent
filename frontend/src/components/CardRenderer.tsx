import type { ChatSendHandler } from '../lib/chatDisplay'
import TemplateCardRenderer from './TemplateCardRenderer'
import { isTemplateCard } from '../lib/cardTemplateRuntime'

interface Props {
  card: any
  onAction?: ChatSendHandler
}

function startCase(value: string) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatScalar(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function renderValue(label: string, value: unknown, depth = 0): JSX.Element | null {
  const title = startCase(label)
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (Array.isArray(value)) {
    const items = value.filter(item => item !== null && item !== undefined && item !== '')
    if (!items.length) return null
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</div>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${label}-${index}`} className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.78)] px-3 py-2 text-xs text-slate-600">
              {isPlainObject(item)
                ? <div className="space-y-2">{Object.entries(item).map(([key, child]) => renderValue(key, child, depth + 1)).filter(Boolean)}</div>
                : formatScalar(item)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isPlainObject(value)) {
    const rows = Object.entries(value)
      .filter(([key]) => key !== 'actions')
      .map(([key, child]) => renderValue(key, child, depth + 1))
      .filter(Boolean)
    if (!rows.length) return null
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</div>
        <div className="space-y-2 rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.58)] px-3 py-3">
          {rows}
        </div>
      </div>
    )
  }

  const text = formatScalar(value)
  const isUrl = /^https?:\/\//i.test(text)
  return (
    <div className={`flex ${depth > 0 ? 'items-start justify-between gap-3' : 'items-center justify-between gap-3'} rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.58)] px-3 py-2`}>
      <div className="min-w-0 text-xs font-medium text-slate-500">{title}</div>
      {isUrl ? (
        <a href={text} target="_blank" rel="noreferrer" className="truncate text-xs font-medium text-[var(--studio-blue-600)] hover:underline">
          {text}
        </a>
      ) : (
        <div className="min-w-0 text-right text-xs text-slate-700 break-all">{text}</div>
      )}
    </div>
  )
}

export default function CardRenderer({ card, onAction }: Props) {
  if (isTemplateCard(card)) {
    return <TemplateCardRenderer card={card} onAction={onAction} />
  }

  const payload = isPlainObject(card) ? card : { value: card }
  const title = String(payload.title || payload.name || payload.display_name || payload.type || 'Card').trim()
  const subtitle = String(payload.summary || payload.description || '').trim()
  const actions = Array.isArray(payload.actions) ? payload.actions.filter(isPlainObject) : []
  const rows = Object.entries(payload)
    .filter(([key]) => !['actions', 'title', 'name', 'display_name', 'summary', 'description'].includes(key))
    .map(([key, value]) => renderValue(key, value))
    .filter(Boolean)

  return (
    <div className="my-3 overflow-hidden rounded-[22px] border border-[rgba(15,111,255,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,255,0.94))] shadow-[0_14px_28px_rgba(13,63,145,0.07)]">
      <div className="border-b border-[rgba(15,111,255,0.08)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {payload.type && <div className="rounded-full bg-[rgba(15,111,255,0.10)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--studio-blue-600)]">{String(payload.type)}</div>}
        </div>
        {subtitle && <div className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</div>}
      </div>
      <div className="space-y-3 px-4 py-4">
        {rows.length ? rows : <div className="text-xs text-slate-400">卡片暂无可展示字段。</div>}
        {actions.length > 0 && (
          <div className="space-y-2 border-t border-[rgba(15,111,255,0.08)] pt-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((action, index) => {
                const label = String(action.label || action.title || action.name || `动作 ${index + 1}`).trim()
                return (
                  <button
                    key={`${label}-${index}`}
                    onClick={() => onAction?.({
                      content: action.content || action.message || '',
                      displayContent: action.displayContent || label,
                      contentTemplate: action.contentTemplate,
                      displayTemplate: action.displayTemplate,
                      clientMeta: action.clientMeta,
                      variables: isPlainObject(action.variables) ? action.variables : undefined,
                    })}
                    className="studio-secondary-btn text-xs"
                    disabled={!onAction || !(action.content || action.message || action.contentTemplate)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
