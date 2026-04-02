import { Wallet, Receipt, ArrowUpRight, Clock3 } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

export default function PaymentCard({ data, onAction }: Props) {
  const order = data.order || {}
  const payment = data.payment || {}
  const amount = ((order.amountFen || 0) / 100).toFixed(2)
  const actions = data.actions || []

  return (
    <div className="telecom-card telecom-card-accent-deep my-3">
      <div className="telecom-card-head px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 backdrop-blur-sm">
              <Wallet size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '下单支付'}</div>
              <div className="mt-1 text-xs text-white/72">{data.duplicate ? '已找到待处理订单' : '订单已创建，等待支付'}</div>
            </div>
          </div>
          <div className="telecom-chip">{order.payStatusText || '待支付'}</div>
        </div>
      </div>

      <div className="p-4 pt-5">
        <div className="telecom-inner-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{order.productName}</div>
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><Receipt size={12} /> 订单号 {order.orderId}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-semibold leading-none text-[var(--telecom-blue-700)]">{amount}</div>
              <div className="mt-1 text-xs text-slate-400">元</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-3 text-xs text-slate-600">
              <div className="mb-1 text-slate-400">支付方式</div>
              <div className="text-sm font-medium text-slate-800">{payment.payMode || '-'}</div>
            </div>
            <div className="rounded-2xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-3 text-xs text-slate-600">
              <div className="mb-1 inline-flex items-center gap-1 text-slate-400"><Clock3 size={12} /> 截止时间</div>
              <div className="text-sm font-medium text-slate-800">{payment.payBefore || order.payBefore || '-'}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {payment.payUrl && (
              <a
                href={payment.payUrl}
                target="_blank"
                rel="noreferrer"
                className="telecom-primary-btn text-sm"
              >
                立即支付
                <ArrowUpRight size={15} />
              </a>
            )}
            {actions.map((action: any, idx: number) => (
              <button
                key={idx}
                onClick={() => onAction?.({
                  content: action.message,
                  displayContent: action.label || `处理「${order.productName || '当前产品'}」相关订单`,
                })}
                className="telecom-secondary-btn text-sm"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
