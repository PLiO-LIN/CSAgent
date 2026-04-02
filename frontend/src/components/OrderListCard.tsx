import { ReceiptText, Clock3, CheckCircle2, Ban } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

export default function OrderListCard({ data, onAction }: Props) {
  const summary = data.summary || {}
  const items = data.items || []
  const blocks = [
    { label: '订单总数', value: summary.total ?? items.length, icon: ReceiptText, tone: 'text-slate-500' },
    { label: '待支付', value: summary.pendingPayment ?? 0, icon: Clock3, tone: 'text-amber-500' },
    { label: '已生效', value: summary.active ?? 0, icon: CheckCircle2, tone: 'text-emerald-500' },
    { label: '已取消', value: summary.cancelled ?? 0, icon: Ban, tone: 'text-rose-500' },
  ]

  return (
    <div className="telecom-card telecom-card-accent-deep my-3">
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="text-sm font-semibold">{data.title || '当前订单'}</div>
        <div className="mt-1 text-xs text-white/70">{data.phone}</div>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {blocks.map((block, idx) => {
            const Icon = block.icon
            return (
              <div key={idx} className="telecom-metric p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{block.label}</span>
                  <Icon size={15} className={block.tone} />
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-800">{block.value}</div>
              </div>
            )
          })}
        </div>
        <div className="space-y-2">
          {items.length > 0 ? items.map((item: any, idx: number) => (
            <div key={idx} className="telecom-inner-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{item.productName}</div>
                  <div className="mt-1 text-xs text-slate-500">订单号 {item.orderId}</div>
                  <div className="mt-2 text-xs text-slate-500">创建时间：{item.createdAt}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-slate-900">{((item.amountFen || 0) / 100).toFixed(2)}元</div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2 text-[11px]">
                    <span className="telecom-chip-muted">{item.statusText}</span>
                    <span className={item.payStatus === 'PAID' ? 'telecom-badge-success' : 'telecom-badge-warn'}>{item.payStatusText}</span>
                  </div>
                </div>
              </div>
              {item.payBefore && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">支付截止：{item.payBefore}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.continuePayMessage && (
                  <button
                    onClick={() => onAction?.({
                      content: item.continuePayMessage,
                      displayContent: `继续支付「${item.productName || '当前产品'}」`,
                    })}
                    className="telecom-primary-btn text-xs"
                  >
                    继续支付
                  </button>
                )}
                {item.confirmPayMessage && (
                  <button
                    onClick={() => onAction?.({
                      content: item.confirmPayMessage,
                      displayContent: `我已经完成「${item.productName || '当前产品'}」的支付，请帮我确认支付结果`,
                    })}
                    className="telecom-secondary-btn text-xs"
                  >
                    我已支付
                  </button>
                )}
                {item.queryMessage && (
                  <button
                    onClick={() => onAction?.({
                      content: item.queryMessage,
                      displayContent: `请查询「${item.productName || '当前产品'}」订单的状态`,
                    })}
                    className="telecom-ghost-btn text-xs"
                  >
                    查询状态
                  </button>
                )}
              </div>
            </div>
          )) : <div className="rounded-2xl border border-dashed border-[rgba(15,111,255,0.16)] bg-white/90 px-4 py-6 text-center text-sm text-slate-400">当前没有订单记录</div>}
        </div>
      </div>
    </div>
  )
}
