import { useMemo, useState } from 'react'
import { BatteryCharging, PencilLine, Sparkles, Wallet } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

function normalizeCurrencyInput(value: string) {
  return String(value ?? '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

export default function RechargeCard({ data, onAction }: Props) {
  const fields = Array.isArray(data.editableFields) ? data.editableFields : []
  const initialValues = useMemo(() => {
    const next: Record<string, string> = {}
    fields.forEach((field: any) => {
      const key = String(field?.key || '').trim()
      if (!key) return
      next[key] = String(field?.value ?? '')
    })
    return next
  }, [fields])
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [error, setError] = useState('')

  const handleChange = (key: string, nextValue: string, inputType: string) => {
    const value = inputType === 'currency' ? normalizeCurrencyInput(nextValue) : nextValue
    setValues(prev => ({ ...prev, [key]: value }))
    setError('')
  }

  const firstField = fields[0] || {}
  const amount = String(values.amount ?? firstField.value ?? '')
  const presets = Array.isArray(firstField.presets) ? firstField.presets : []
  const actions = Array.isArray(data.actions) ? data.actions : []
  const accountName = data.accountName || data.phone || ''
  const billingType = data.billingType || ''
  const feeCycleType = data.feeCycleType || ''
  const canRecharge = data.canRecharge !== false

  const validate = () => {
    for (const field of fields) {
      const key = String(field?.key || '').trim()
      if (!key) continue
      const raw = String(values[key] ?? '').trim()
      if (field?.required && !raw) {
        setError(`${field.label || key}不能为空`)
        return false
      }
      if (field?.inputType === 'currency') {
        const amountValue = Number(raw)
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          setError(`${field.label || key}需为大于 0 的金额`)
          return false
        }
      }
    }
    setError('')
    return true
  }

  return (
    <div className="telecom-card telecom-card-accent-cyan my-3">
      <div className="telecom-card-head px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <BatteryCharging size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '话费充值'}</div>
              <div className="mt-1 text-xs text-white/80">{accountName}</div>
            </div>
          </div>
          <div className="telecom-chip">余额 {data.balance || '0.00'}元</div>
        </div>
        {data.summary && (
          <div className="mt-4 rounded-2xl bg-white/12 px-4 py-3 text-xs leading-5 text-white/90">
            {data.summary}
          </div>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="telecom-metric p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>账户余额</span>
              <Wallet size={15} className="text-emerald-500" />
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-800">{data.balance || '0.00'}元</div>
          </div>
          <div className="telecom-metric p-4">
            <div className="text-[11px] text-slate-400">当前欠费</div>
            <div className="mt-2 text-xl font-semibold text-amber-600">{data.arrears || '0.00'}元</div>
          </div>
          <div className="telecom-metric p-4">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Sparkles size={12} className="text-[var(--telecom-blue-500)]" />
              <span>{firstField.sourceLabel || '金额来源'}</span>
            </div>
            <div className="mt-2 text-sm font-medium text-slate-700">{canRecharge ? '已预填，可修改后继续' : '当前链路不支持继续充值'}</div>
          </div>
        </div>

        {(billingType || feeCycleType) && (
          <div className="telecom-inner-panel p-4 text-sm text-slate-600">
            当前付费方式：
            <span className="ml-1 font-semibold text-slate-900">{billingType || '-'}</span>
            <span className="mx-2 text-slate-300">/</span>
            <span className="font-semibold text-slate-900">{feeCycleType || '-'}</span>
          </div>
        )}

        {!canRecharge && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            当前付费方式暂不支持通过该充值链路生成充值链接，请改走其他充值渠道或继续查询账户状态。
          </div>
        )}

        {fields.map((field: any, idx: number) => {
          const key = String(field?.key || '').trim()
          if (!key) return null
          const value = String(values[key] ?? '')
          const presets = Array.isArray(field.presets) ? field.presets : []
          return (
            <div key={`${key}-${idx}`} className="telecom-inner-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                    <PencilLine size={15} className="text-[var(--telecom-blue-500)]" />
                    {field.label || key}
                  </div>
                  {field.placeholder && <div className="mt-1 text-xs text-slate-400">{field.placeholder}</div>}
                </div>
                {field.unit && <div className="telecom-chip-muted">{field.unit}</div>}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  value={value}
                  onChange={e => handleChange(key, e.target.value, String(field.inputType || 'text'))}
                  inputMode={field.inputType === 'currency' ? 'decimal' : undefined}
                  placeholder={field.placeholder || ''}
                  className="telecom-input w-full px-4 py-3 text-lg font-semibold"
                />
                {field.unit && <div className="text-sm font-medium text-slate-500">{field.unit}</div>}
              </div>

              {presets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {presets.map((preset: string, presetIdx: number) => (
                    <button
                      key={`${key}-preset-${presetIdx}`}
                      onClick={() => handleChange(key, String(preset), String(field.inputType || 'text'))}
                      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${String(value).trim() === String(preset).trim()
                        ? 'bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] text-white shadow-[0_12px_22px_rgba(15,111,255,0.18)]'
                        : 'border border-[rgba(15,111,255,0.10)] bg-[rgba(240,247,255,0.94)] text-[var(--telecom-blue-700)] hover:bg-[rgba(227,239,255,0.92)]'
                      }`}
                    >
                      {preset}{field.unit || ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {actions.map((action: any, idx: number) => (
            <button
              key={idx}
              onClick={() => {
                if (action?.requiresValidation !== false && !validate()) return
                onAction?.({
                  content: action.content,
                  displayContent: action.displayContent,
                  contentTemplate: action.contentTemplate,
                  displayTemplate: action.displayTemplate,
                  variables: { ...values, amount },
                })
              }}
              className={idx === 0 ? 'telecom-primary-btn text-sm' : 'telecom-secondary-btn text-sm'}
            >
              {action.label || '继续'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
