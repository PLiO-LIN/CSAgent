import type { ChatSendHandler } from '../lib/chatDisplay'
import { displayScalar, isPlainObject, normalizeActionList, resolveTemplatePath, templateText, toArray } from '../lib/cardTemplateRuntime'

interface Props {
  card: any
  onAction?: ChatSendHandler
  onInspectPath?: (path: string) => void
}

function hoverProps(path: string, onInspectPath?: (path: string) => void) {
  if (!onInspectPath || !String(path || '').trim()) return {}
  return {
    onMouseEnter: () => onInspectPath(path),
    onMouseLeave: () => onInspectPath(''),
  }
}

function actionButtons(actions: Array<Record<string, any>>, onAction?: ChatSendHandler, variables: Record<string, any> = {}) {
  if (!actions.length) return null
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-[rgba(15,111,255,0.08)] pt-3">
      {actions.map((action, index) => {
        const label = String(action.label || action.title || action.name || `动作 ${index + 1}`).trim()
        const enabled = Boolean(onAction && (action.content || action.message || action.contentTemplate))
        return (
          <button
            key={`${label}-${index}`}
            onClick={() => onAction?.({
              content: action.content || action.message || '',
              displayContent: action.displayContent || label,
              contentTemplate: action.contentTemplate,
              displayTemplate: action.displayTemplate,
              clientMeta: isPlainObject(action.clientMeta) ? action.clientMeta : undefined,
              variables: { ...(isPlainObject(action.variables) ? action.variables : {}), ...variables },
            })}
            className="studio-secondary-btn text-xs"
            disabled={!enabled}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export default function TemplateCardRenderer({ card, onAction, onInspectPath }: Props) {
  const payload = isPlainObject(card?.payload) ? card.payload : { value: card?.payload }
  const title = String(card?.title || card?.display_name || card?.template_id || '模板卡片').trim()
  const summary = String(card?.summary || '').trim()
  const uiSchema = isPlainObject(card?.ui_schema) ? card.ui_schema : {}
  const blocks = Array.isArray(uiSchema.blocks) ? uiSchema.blocks.filter(isPlainObject) : []
  const rootActions = normalizeActionList(card?.actions)

  const renderBlock = (block: Record<string, any>, index: number) => {
    const type = String(block.type || '').trim()
    if (type === 'hero') {
      const blockTitle = templateText(payload, block.title, title)
      const blockSummary = templateText(payload, block.summary, summary)
      return (
        <div key={`hero-${index}`} className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-4 py-4">
          <div {...hoverProps(String(block.title || '$.title'), onInspectPath)} className="rounded-xl px-1 text-base font-semibold text-slate-800 transition hover:bg-emerald-50/70">{blockTitle || title}</div>
          {blockSummary && <div {...hoverProps(String(block.summary || '$.summary'), onInspectPath)} className="mt-1 rounded-xl px-1 text-sm leading-6 text-slate-500 transition hover:bg-emerald-50/70">{blockSummary}</div>}
        </div>
      )
    }

    if (type === 'metric_grid') {
      const items = toArray(resolveTemplatePath(payload, block.path || '$.metrics'))
      if (!items.length) return null
      return (
        <div key={`metric-${index}`} className="grid gap-3 md:grid-cols-3">
          {items.map((item, itemIndex) => {
            const row = isPlainObject(item) ? item : { value: item }
            const itemPath = `${String(block.path || '$.metrics')}[${itemIndex}]`
            return (
              <div key={`metric-item-${itemIndex}`} {...hoverProps(itemPath, onInspectPath)} className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.58)] px-4 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/70">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{String(row.label || row.title || `指标 ${itemIndex + 1}`)}</div>
                <div className="mt-2 text-lg font-semibold text-slate-800">{displayScalar(row.value ?? row.amount ?? row.total)}</div>
                {row.hint && <div className="mt-1 text-xs text-slate-500">{String(row.hint)}</div>}
              </div>
            )
          })}
        </div>
      )
    }

    if (type === 'kv_list') {
      const items = toArray(resolveTemplatePath(payload, block.path || '$.fields'))
      if (!items.length) return null
      return (
        <div key={`kv-${index}`} className="space-y-2">
          {items.map((item, itemIndex) => {
            const row = isPlainObject(item) ? item : { value: item }
            const itemPath = `${String(block.path || '$.fields')}[${itemIndex}]`
            return (
              <div key={`kv-item-${itemIndex}`} {...hoverProps(itemPath, onInspectPath)} className="flex items-start justify-between gap-3 rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-3 py-2 transition hover:border-emerald-200 hover:bg-emerald-50/70">
                <div className="text-xs font-medium text-slate-500">{String(row.label || row.title || `字段 ${itemIndex + 1}`)}</div>
                <div className="max-w-[70%] text-right text-xs text-slate-700 break-all">{displayScalar(row.value ?? row.content ?? row.text)}</div>
              </div>
            )
          })}
        </div>
      )
    }

    if (type === 'item_list') {
      const items = toArray(resolveTemplatePath(payload, block.path || '$.items'))
      if (!items.length) return null
      return (
        <div key={`list-${index}`} className="space-y-3">
          {items.map((item, itemIndex) => {
            const row = isPlainObject(item) ? item : { value: item }
            const badges = Array.isArray(row.badges) ? row.badges.filter(Boolean) : []
            const itemActions = normalizeActionList(row.actions)
            const itemPath = `${String(block.path || '$.items')}[${itemIndex}]`
            return (
              <div key={`list-item-${itemIndex}`} {...hoverProps(itemPath, onInspectPath)} className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-4 py-4 transition hover:border-emerald-200 hover:bg-emerald-50/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{String(row.title || row.name || `项目 ${itemIndex + 1}`)}</div>
                    {row.summary && <div className="mt-1 text-xs leading-5 text-slate-500">{String(row.summary)}</div>}
                  </div>
                  {badges.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {badges.map((badge: any, badgeIndex: number) => (
                        <span key={`badge-${badgeIndex}`} className="rounded-full bg-[rgba(15,111,255,0.10)] px-2.5 py-1 text-[10px] font-medium text-[var(--studio-blue-600)]">{String(badge)}</span>
                      ))}
                    </div>
                  )}
                </div>
                {itemActions.length > 0 && actionButtons(itemActions, onAction, row)}
              </div>
            )
          })}
        </div>
      )
    }

    if (type === 'image') {
      const src = String(resolveTemplatePath(payload, block.path || '$.image_url') ?? '').trim()
      if (!src) return null
      const alt = String(block.alt || block.label || '').trim()
      return (
        <div key={`img-${index}`} {...hoverProps(String(block.path || '$.image_url'), onInspectPath)} className="overflow-hidden rounded-2xl border border-[rgba(15,111,255,0.08)] transition hover:border-emerald-200">
          <img src={src} alt={alt} className="block w-full object-cover" style={{ maxHeight: block.maxHeight || 280 }} />
          {alt && <div className="bg-[rgba(240,247,255,0.46)] px-3 py-2 text-xs text-slate-500">{alt}</div>}
        </div>
      )
    }

    if (type === 'table') {
      const rows = toArray(resolveTemplatePath(payload, block.path || '$.rows'))
      if (!rows.length) return null
      const columns: string[] = Array.isArray(block.columns) ? block.columns.map(String) : (isPlainObject(rows[0]) ? Object.keys(rows[0]) : ['value'])
      return (
        <div key={`table-${index}`} {...hoverProps(String(block.path || '$.rows'), onInspectPath)} className="overflow-hidden rounded-2xl border border-[rgba(15,111,255,0.08)] transition hover:border-emerald-200">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[rgba(240,247,255,0.58)]">
                {columns.map(col => <th key={col} className="px-3 py-2 font-medium text-slate-500">{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const r = isPlainObject(row) ? row : { value: row }
                return (
                  <tr key={`row-${ri}`} className="border-t border-[rgba(15,111,255,0.06)]">
                    {columns.map(col => <td key={col} className="px-3 py-2 text-slate-700">{displayScalar(r[col] ?? r.value)}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }

    if (type === 'progress') {
      const raw = resolveTemplatePath(payload, block.path || '$.progress')
      const pct = Math.max(0, Math.min(1, Number(raw) || 0))
      const label = String(block.label || '').trim()
      return (
        <div key={`progress-${index}`} {...hoverProps(String(block.path || '$.progress'), onInspectPath)} className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-4 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/70">
          {label && <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-slate-500">{label}</span><span className="text-slate-700">{Math.round(pct * 100)}%</span></div>}
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
      )
    }

    if (type === 'badge_list') {
      const items = toArray(resolveTemplatePath(payload, block.path || '$.tags'))
      if (!items.length) return null
      return (
        <div key={`badges-${index}`} {...hoverProps(String(block.path || '$.tags'), onInspectPath)} className="flex flex-wrap gap-2 transition">
          {items.map((item, bi) => (
            <span key={`badge-${bi}`} className="rounded-full bg-[rgba(15,111,255,0.10)] px-2.5 py-1 text-[11px] font-medium text-[var(--studio-blue-600)]">{displayScalar(isPlainObject(item) ? (item.label || item.value || item.name) : item)}</span>
          ))}
        </div>
      )
    }

    if (type === 'section') {
      const sectionTitle = templateText(payload, block.title, String(block.label || ''))
      if (!sectionTitle) return null
      return (
        <div key={`section-${index}`} className="border-t border-[rgba(15,111,255,0.08)] pt-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{sectionTitle}</div>
        </div>
      )
    }

    if (type === 'markdown') {
      const md = String(resolveTemplatePath(payload, block.path || '$.description') ?? '').trim()
      if (!md) return null
      return (
        <div key={`md-${index}`} {...hoverProps(String(block.path || '$.description'), onInspectPath)} className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-4 py-3 text-xs leading-6 text-slate-600 whitespace-pre-wrap transition hover:border-emerald-200 hover:bg-emerald-50/70">
          {md}
        </div>
      )
    }

    const value = resolveTemplatePath(payload, block.path || '$')
    if (value === undefined || value === null || value === '') return null
    return (
      <div key={`fallback-${index}`} {...hoverProps(String(block.path || '$'), onInspectPath)} className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-3 py-3 text-xs text-slate-600 whitespace-pre-wrap break-all transition hover:border-emerald-200 hover:bg-emerald-50/70">
        {displayScalar(value)}
      </div>
    )
  }

  return (
    <div className="my-3 overflow-hidden rounded-[22px] border border-[rgba(15,111,255,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,255,0.94))] shadow-[0_14px_28px_rgba(13,63,145,0.07)]">
      <div className="border-b border-[rgba(15,111,255,0.08)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {card?.type && <div className="rounded-full bg-[rgba(15,111,255,0.10)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--studio-blue-600)]">{String(card.type)}</div>}
        </div>
        {summary && <div className="mt-1 text-xs leading-5 text-slate-500">{summary}</div>}
      </div>
      <div className="space-y-3 px-4 py-4">
        {blocks.length > 0 ? blocks.map(renderBlock) : (
          <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.46)] px-3 py-3 text-xs text-slate-600 whitespace-pre-wrap break-all">
            {displayScalar(payload)}
          </div>
        )}
        {rootActions.length > 0 && actionButtons(rootActions, onAction, payload)}
      </div>
    </div>
  )
}
