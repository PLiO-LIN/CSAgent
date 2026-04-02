import { useState } from 'react'
import { ShieldCheck, MessageSquareLock, ArrowRight, RefreshCcw } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

export default function OrderVerifyCard({ data, onAction }: Props) {
  const product = data.product || {}
  const productName = product.productName || '当前产品'
  const [smsCode, setSmsCode] = useState(String(data.smsCode || ''))
  const [error, setError] = useState('')

  const confirmSubmit = () => {
    const code = String(smsCode || '').trim()
    if (!/^\d{4,8}$/.test(code)) {
      setError('请输入正确的短信验证码')
      return
    }
    setError('')
    onAction?.({
      content: `请提交产品 ${product.productId || ''} 的订单，验证码为 ${code}`,
      displayContent: `请为我提交 ${productName} 的订单，验证码已填写`,
      clientMeta: {
        source: 'card_action',
        action: 'confirm_order_submit',
        sms_code: code,
        product_id: product.productId || '',
        preview_id: data.previewId || '',
        pay_mode: data.payMode || '在线支付',
        verification_seq: data.verificationSeq || '',
      },
    })
  }

  return (
    <div className="telecom-card telecom-card-accent-deep my-3">
      <div className="telecom-card-head px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '验证码确认下单'}</div>
              <div className="mt-1 text-xs text-white/80">{productName}</div>
            </div>
          </div>
          {data.payMode && <div className="telecom-chip">支付方式 {data.payMode}</div>}
        </div>
        {data.summary && <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-xs leading-5 text-white/90">{data.summary}</div>}
      </div>

      <div className="space-y-4 p-4">
        <div className="telecom-inner-panel p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] text-slate-400">验证码发送目标</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{data.maskedTarget || '当前绑定号码'}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">验证码会话</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{data.verificationSeq || '-'}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
              <MessageSquareLock size={16} className="text-[var(--telecom-blue-500)]" />
              输入短信验证码
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                value={smsCode}
                onChange={e => {
                  setSmsCode(String(e.target.value || '').replace(/\D/g, '').slice(0, 8))
                  setError('')
                }}
                inputMode="numeric"
                placeholder="请输入短信验证码"
                className="telecom-input w-full px-4 py-3 text-lg font-semibold"
              />
            </div>
          </div>
        </div>

        {Array.isArray(data.tips) && data.tips.length > 0 && (
          <div className="telecom-inner-panel p-4 text-xs text-slate-600">
            <div className="mb-3 text-sm font-medium text-slate-800">验证码下单提醒</div>
            <div className="space-y-2">
              {data.tips.map((tip: string, idx: number) => (
                <div key={idx} className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2">{tip}</div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={confirmSubmit} className="telecom-primary-btn text-sm">
            确认下单
            <ArrowRight size={14} />
          </button>
          <button
            onClick={() => onAction?.({
              content: `请为产品 ${product.productId || ''} 重新获取下单验证码`,
              displayContent: `请重新为我获取 ${productName} 的下单验证码`,
            })}
            className="telecom-secondary-btn text-sm"
          >
            <RefreshCcw size={14} />
            重新获取验证码
          </button>
        </div>
      </div>
    </div>
  )
}
