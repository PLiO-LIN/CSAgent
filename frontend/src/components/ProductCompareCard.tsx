import { Scale, Sparkles, ArrowRight, BadgeCheck } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

const themes = {
  plan: {
    card: 'telecom-card-accent-indigo',
    accent: 'text-violet-700',
  },
  flow_pack: {
    card: 'telecom-card-accent-cyan',
    accent: 'text-emerald-700',
  },
  benefit: {
    card: 'telecom-card-accent-soft',
    accent: 'text-amber-700',
  },
} as const

export default function ProductCompareCard({ data, onAction }: Props) {
  const variant = (data.compareType || 'plan') as 'plan' | 'flow_pack' | 'benefit'
  const theme = themes[variant] || themes.plan
  const items = data.items || []
  const typeLabel = variant === 'plan' ? '套餐' : variant === 'flow_pack' ? '流量包' : '权益产品'

  return (
    <div className={`telecom-card my-3 ${theme.card}`}>
      <div className="telecom-card-head px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <Scale size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '产品对比'}</div>
              <div className="mt-1 text-xs text-white/80">当前套餐：{data.currentPlan || '未知'}</div>
            </div>
          </div>
          {!!data.currentPlanFee && <div className="telecom-chip">当前资费 {data.currentPlanFee}元/月</div>}
        </div>
        {data.summary && (
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-xs leading-5 text-white/90 backdrop-blur-sm">
            <span className="inline-flex items-center gap-1 font-medium"><Sparkles size={12} /> 对比摘要</span>
            <div className="mt-1">{data.summary}</div>
          </div>
        )}
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-3">
        {items.map((item: any, idx: number) => {
          const pills = item.highlights || item.rights || item.benefits || []
          return (
            <div
              key={idx}
              className={`rounded-[22px] border bg-white/92 p-4 shadow-sm backdrop-blur-sm ${item.selected ? 'border-[rgba(15,111,255,0.32)] ring-2 ring-[rgba(15,111,255,0.10)]' : 'border-[rgba(15,111,255,0.08)]'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-800">{item.productName}</div>
                    {item.selected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] px-2 py-0.5 text-[10px] font-medium text-white">
                        <BadgeCheck size={10} /> 当前关注
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                </div>
                <div className="rounded-2xl bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] px-3 py-2 text-right text-white shadow-[0_12px_24px_rgba(15,111,255,0.18)]">
                  <div className="text-lg font-semibold leading-none">{item.price}</div>
                  <div className="mt-1 text-[10px] text-white/70">{item.unit}</div>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {item.dataAmount && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2">流量额度：<span className="font-medium text-slate-800">{item.dataAmount}</span></div>}
                {item.validity && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2">有效期：<span className="font-medium text-slate-800">{item.validity}</span></div>}
                {item.effectiveDesc && <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2">生效规则：<span className="font-medium text-slate-800">{item.effectiveDesc}</span></div>}
              </div>

              {pills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pills.slice(0, 4).map((pill: string, i: number) => (
                    <span key={i} className="rounded-full border border-[rgba(15,111,255,0.10)] bg-[rgba(240,247,255,0.94)] px-2.5 py-1 text-[11px] text-slate-600">
                      {pill}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {item.previewMessage && (
                  <button
                    onClick={() => onAction?.({
                      content: item.previewMessage,
                      displayContent: `我想办理${typeLabel} ${item.productName || '当前方案'}，请先展示确认下单卡`,
                    })}
                    className="telecom-primary-btn text-xs"
                  >
                    选这个办理
                    <ArrowRight size={13} />
                  </button>
                )}
                {item.detailsMessage && (
                  <button
                    onClick={() => onAction?.({
                      content: item.detailsMessage,
                      displayContent: `请详细介绍一下${typeLabel} ${item.productName || '当前方案'} 的资费和规则`,
                    })}
                    className="telecom-secondary-btn text-xs"
                  >
                    看规则
                  </button>
                )}
                {item.selected && <span className={`self-center text-[11px] ${theme.accent}`}>这是您当前重点关注的方案</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
