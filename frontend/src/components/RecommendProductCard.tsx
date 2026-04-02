import { BadgePercent, Sparkles, ChevronRight, Zap, Gift, Smartphone, GitCompareArrows, FileText } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  variant: 'plan' | 'flow_pack' | 'benefit'
  onAction?: ChatSendHandler
}

const themes = {
  plan: {
    card: 'telecom-card-accent-indigo',
    badge: 'bg-[rgba(15,111,255,0.10)] text-[var(--telecom-blue-600)]',
    accent: 'text-[var(--telecom-blue-700)]',
    icon: Smartphone,
  },
  flow_pack: {
    card: 'telecom-card-accent-cyan',
    badge: 'bg-[rgba(31,146,234,0.10)] text-sky-700',
    accent: 'text-sky-700',
    icon: Zap,
  },
  benefit: {
    card: 'telecom-card-accent-soft',
    badge: 'bg-[rgba(90,169,255,0.14)] text-[var(--telecom-blue-700)]',
    accent: 'text-[var(--telecom-blue-700)]',
    icon: Gift,
  },
} as const

export default function RecommendProductCard({ data, variant, onAction }: Props) {
  const theme = themes[variant]
  const Icon = theme.icon
  const items = data.items || []
  const typeLabel = variant === 'plan' ? '套餐' : variant === 'flow_pack' ? '流量包' : '权益产品'

  return (
    <div className={`telecom-card my-3 ${theme.card}`}>
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/18 backdrop-blur-sm">
              <Icon size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '产品推荐'}</div>
              <div className="mt-1 text-xs text-white/80">当前套餐：{data.currentPlan || '未知'}</div>
            </div>
          </div>
          {!!data.currentPlanFee && (
            <div className="telecom-chip">
              当前资费 {data.currentPlanFee}元/月
            </div>
          )}
        </div>
        {(data.recommendMode || (data.rankStart && data.rankEnd)) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/85">
            {data.recommendMode && <span className="telecom-chip">模式 {data.recommendMode}</span>}
            {(data.rankStart || data.rankEnd) && <span className="telecom-chip">推荐位次 {data.rankStart || 1} - {data.rankEnd || data.rankStart || 1}</span>}
          </div>
        )}
        {data.reason && (
          <div className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs leading-5 text-white/90 backdrop-blur-sm">
            <span className="inline-flex items-center gap-1 font-medium"><Sparkles size={12} /> 推荐理由</span>
            <div className="mt-1">{data.reason}</div>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        {items.map((item: any, idx: number) => {
          const pills = item.highlights || item.rights || item.benefits || []
          return (
            <div key={idx} className="telecom-inner-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-800">{item.productName}</div>
                    {item.tag && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${theme.badge}`}>{item.tag}</span>}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                </div>
                <div className="rounded-2xl bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] px-3 py-2 text-right text-white shadow-[0_12px_24px_rgba(15,111,255,0.18)]">
                  <div className="text-lg font-semibold leading-none">{item.price}</div>
                  <div className="mt-1 text-[10px] text-white/70">{item.unit}</div>
                </div>
              </div>

              {(item.dataAmount || item.validity || item.effectiveDesc || item.redeemLabel) && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {item.dataAmount && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2 text-xs text-slate-600">流量额度：<span className="font-medium text-slate-800">{item.dataAmount}</span></div>}
                  {item.validity && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2 text-xs text-slate-600">有效期：<span className="font-medium text-slate-800">{item.validity}</span></div>}
                  {item.effectiveDesc && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2 text-xs text-slate-600 sm:col-span-2">生效规则：<span className="font-medium text-slate-800">{item.effectiveDesc}</span></div>}
                  {item.redeemLabel && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2 text-xs text-slate-600 sm:col-span-2">兑换参考：<span className="font-medium text-slate-800">{item.redeemLabel}</span></div>}
                </div>
              )}

              {pills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pills.map((p: string, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full border border-[rgba(15,111,255,0.10)] bg-[rgba(240,247,255,0.94)] px-2.5 py-1 text-[11px] text-slate-600">
                      <BadgePercent size={11} className={theme.accent} />
                      {p}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div className={`text-xs ${theme.accent}`}>{item.recommendedReason || data.reason}</div>
                <div className="flex flex-wrap gap-2">
                  {onAction && item.previewMessage && (
                    <button
                      onClick={() => onAction({
                        content: item.previewMessage,
                        displayContent: `我想办理${typeLabel} ${item.productName || '当前方案'}，请先展示确认下单卡`,
                      })}
                      className="telecom-primary-btn text-xs"
                    >
                      立即办理
                      <ChevronRight size={14} />
                    </button>
                  )}
                  {onAction && item.compareMessage && (
                    <button
                      onClick={() => onAction({
                        content: item.compareMessage,
                        displayContent: `请帮我对比一下${typeLabel} ${item.productName || '当前方案'} 的同类方案`,
                      })}
                      className="telecom-secondary-btn text-xs"
                    >
                      <GitCompareArrows size={13} />
                      对比产品
                    </button>
                  )}
                  {onAction && item.detailsMessage && (
                    <button
                      onClick={() => onAction({
                        content: item.detailsMessage,
                        displayContent: `请详细介绍一下${typeLabel} ${item.productName || '当前方案'} 的资费和规则`,
                      })}
                      className="telecom-secondary-btn text-xs"
                    >
                      <FileText size={13} />
                      看规则
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
