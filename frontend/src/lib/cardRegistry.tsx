import type { ChatSendHandler } from './chatDisplay'

interface Props {
  card: any
  onAction?: ChatSendHandler
}

function renderPrimitiveFields(card: Record<string, any>) {
  return Object.entries(card)
    .filter(([key, value]) => !['type', 'schema_version', 'title', 'summary', 'status', 'actions', 'editableFields', 'items', 'products', '_meta'].includes(key))
    .filter(([, value]) => typeof value !== 'object')
    .map(([key, value]) => (
      <div key={key} className="kv">
        <div className="key">{key}</div>
        <div className="value">{String(value)}</div>
      </div>
    ))
}

function renderCollection(title: string, values: any[]) {
  if (!Array.isArray(values) || values.length === 0) return null
  return (
    <div className="card-list">
      {values.map((item, idx) => (
        <div key={`${title}-${idx}`} className="card-item">
          <strong>{title} {idx + 1}</strong>
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(item, null, 2)}</pre>
        </div>
      ))}
    </div>
  )
}

export default function CardRenderer({ card, onAction }: Props) {
  const fields = Array.isArray(card?.editableFields) ? card.editableFields : []
  const actions = Array.isArray(card?.actions) ? card.actions : []

  return (
    <div className="generic-card">
      <h4>{card?.title || card?.type || 'Card'}</h4>
      {card?.summary && <p>{card.summary}</p>}
      <div className="card-grid">{renderPrimitiveFields(card || {})}</div>
      {renderCollection('items', card?.items || [])}
      {renderCollection('products', card?.products || [])}
      {fields.length > 0 && (
        <div className="editable-fields">
          {fields.map((field: any, idx: number) => (
            <div key={`${field?.key || 'field'}-${idx}`} className="editable-field">
              <label>{field?.label || field?.key || 'field'}</label>
              <input defaultValue={String(field?.value ?? '')} placeholder={String(field?.placeholder || '')} />
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="action-row">
          {actions.map((action: any, idx: number) => (
            <button
              key={`${action?.key || 'action'}-${idx}`}
              className={`action-btn ${action?.style || (idx === 0 ? 'primary' : 'secondary')}`}
              onClick={() => onAction?.({
                content: action?.content,
                displayContent: action?.displayContent || action?.label,
                contentTemplate: action?.contentTemplate,
                displayTemplate: action?.displayTemplate,
              })}
            >
              {action?.label || '继续'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
