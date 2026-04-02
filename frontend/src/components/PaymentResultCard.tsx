import { BadgeCheck, Clock3, CheckCircle2 } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

export default function PaymentResultCard({ data, onAction }: Props) {
  const order = data.order || {}
  const payment = data.paymentResult || {}
  const amount = ((order.amountFen || 0) / 100).toFixed(2)
  const actions = data.actions || []

  return (
    <div className="telecom-card telecom-card-accent-soft my-3">
      <div className="telecom-card-head px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <BadgeCheck size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '支付结果'}</div>
              <div className="mt-1 text-xs text-white/80">{order.productName}</div>
            </div>
          </div>
          <div className="telecom-chip">{payment.payStatusText || order.payStatusText || '已支付'}</div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="telecom-inner-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">订单号 {order.orderId}</div>
              <div className="mt-2 text-xs text-slate-500">订单状态：{order.statusText || '-'}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-slate-900">{amount}元</div>
              <div className="mt-1 text-xs text-slate-400">订单金额</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-3 text-xs text-slate-600">
              <div className="mb-1 inline-flex items-center gap-1 text-slate-400"><Clock3 size={12} /> 支付时间</div>
              <div className="text-sm font-medium text-slate-800">{payment.paidAt || '-'}</div>
            </div>
            <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-3 text-xs text-slate-600">
              <div className="mb-1 inline-flex items-center gap-1 text-slate-400"><CheckCircle2 size={12} /> 生效时间</div>
              <div className="text-sm font-medium text-slate-800">{order.effectiveTime || '-'}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {actions.map((action: any, idx: number) => (
            <button
              key={idx}
              onClick={() => onAction?.({
                content: action.message,
                displayContent: action.label || `继续处理「${order.productName || '当前产品'}」`,
              })}
              className="telecom-secondary-btn text-sm"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
