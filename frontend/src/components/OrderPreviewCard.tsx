import { ShieldCheck, Wallet, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import type { ChatSendHandler } from '../lib/chatDisplay'

interface Props {
  data: any
  onAction?: ChatSendHandler
}

export default function OrderPreviewCard({ data, onAction }: Props) {
  const product = data.product || {}
  const duplicateOrder = data.duplicateOrder || null
  const payMode = data.payMode || '在线支付'
  const payModes = (data.payModeOptions || []).filter((m: string) => !!m)
  const altModes = payModes.filter((m: string) => m !== payMode)
  const requestSmsMessage = `请为产品 ${product.productId || ''} 获取下单验证码，支付方式使用 ${payMode}`
  const productName = product.productName || '当前方案'
  const restrictionSummary = data.restrictionSummary || ''
  const duplicatePending = duplicateOrder && /PENDING|待支付/.test(`${duplicateOrder.payStatus || ''} ${duplicateOrder.payStatusText || ''}`)

  return (
    <div className="telecom-card telecom-card-accent-deep my-3">
      <div className="telecom-card-head px-5 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">{data.title || '下单确认'}</div>
              <div className="mt-1 text-xs text-white/80">请核对办理方案和支付方式</div>
            </div>
          </div>
          <div className="telecom-chip">支付方式 {payMode}</div>
        </div>
        {data.summary && <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-xs leading-5 text-white/90">{data.summary}</div>}
      </div>

      <div className="space-y-4 p-4">
        {restrictionSummary && (
          <div className="rounded-[22px] border border-sky-100 bg-sky-50/85 px-4 py-4 text-sm text-sky-800 shadow-sm">
            <div className="font-medium">订购限制校验</div>
            <div className="mt-1 text-xs leading-5 text-sky-700">{restrictionSummary}</div>
          </div>
        )}
        <div className="telecom-inner-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{product.productName}</div>
              <div className="mt-2 text-xs leading-5 text-slate-500">{product.description}</div>
            </div>
            <div className="rounded-2xl bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] px-3 py-2 text-right text-white shadow-[0_12px_24px_rgba(15,111,255,0.18)]">
              <div className="text-xl font-semibold leading-none">{product.price}</div>
              <div className="mt-1 text-[10px] text-white/70">{product.unit}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-3 text-xs text-slate-600">
              <div className="mb-1 text-slate-400">当前支付方式</div>
              <div className="inline-flex items-center gap-1 text-sm font-medium text-slate-800"><Wallet size={14} /> {payMode}</div>
            </div>
            <div className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-3 text-xs text-slate-600">
              <div className="mb-1 text-slate-400">生效规则</div>
              <div className="text-sm font-medium text-slate-800">{product.effectiveDesc || product.validity || '-'}</div>
            </div>
          </div>
        </div>

        {duplicateOrder && (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">系统检测到同产品已有可继续处理的订单</div>
                <div className="mt-1 text-xs leading-5 text-amber-700">
                  订单号 {duplicateOrder.orderId} · {duplicateOrder.statusText}/{duplicateOrder.payStatusText}
                </div>
              </div>
            </div>
          </div>
        )}

        {Array.isArray(data.tips) && data.tips.length > 0 && (
          <div className="telecom-inner-panel p-4">
            <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700"><CheckCircle2 size={16} className="text-emerald-500" /> 办理前提醒</div>
            <div className="space-y-2 text-xs text-slate-600">
              {data.tips.map((tip: string, idx: number) => (
                <div key={idx} className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2">{tip}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!duplicateOrder && (
            <button
              onClick={() => onAction?.({
                content: requestSmsMessage,
                displayContent: `请先为我获取 ${productName} 的下单验证码，支付方式使用 ${payMode}`,
              })}
              className="telecom-primary-btn text-sm"
            >
              获取验证码
              <ArrowRight size={14} />
            </button>
          )}
          {altModes.map((mode: string) => (
            <button
              key={mode}
              onClick={() => onAction?.({
                content: `请先展示产品 ${product.productId || ''} 的确认下单卡，支付方式改为 ${mode}`,
                displayContent: `请先展示产品 ${productName} 的确认下单卡，支付方式改为 ${mode}`,
              })}
              className="telecom-secondary-btn text-sm"
            >
              改为{mode}
            </button>
          ))}
          {duplicatePending && (
            <button
              onClick={() => onAction?.({
                content: `请为我继续支付产品 ${duplicateOrder.productId || product.productId || ''}，如果已存在待支付订单请直接返回该订单的支付信息`,
                displayContent: `请为我继续处理产品 ${productName} 的支付，如果已存在待支付订单请直接返回该订单的支付信息`,
              })}
              className="telecom-ghost-btn text-sm"
            >
              继续已有支付
            </button>
          )}
          {duplicateOrder && (
            <button
              onClick={() => onAction?.({
                content: `请查询订单 ${duplicateOrder.orderId} 的状态`,
                displayContent: '请帮我查询这笔订单的状态',
              })}
              className="telecom-secondary-btn text-sm"
            >
              查看已有订单
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
