import { Wallet, Coins, Layers3, AlertTriangle } from 'lucide-react'

export default function BalanceCard({ data }: { data: any }) {
  const arrears = Number(data.arrears || 0)
  const billingType = data.billingType || ''
  const feeCycleType = data.feeCycleType || ''
  const blocks = [
    { label: '账户总余额', value: `${data.balance || '0.00'}元`, icon: Wallet, tone: 'text-emerald-500' },
    { label: '通用余额', value: `${data.balanceTY || '0.00'}元`, icon: Coins, tone: 'text-sky-500' },
    { label: '专用余额', value: `${data.balanceZY || '0.00'}元`, icon: Layers3, tone: 'text-violet-500' },
  ]

  return (
    <div className="telecom-card telecom-card-accent-soft my-3">
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{data.title || '账户余额'}</div>
            <div className="mt-1 text-xs text-white/80">{data.accountName || data.phone}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(billingType || feeCycleType) && <div className="telecom-chip">{billingType || '-'} / {feeCycleType || '-'}</div>}
            <div className="telecom-chip">用户标识 {data.phone}</div>
          </div>
        </div>
        <div className="mt-4 text-3xl font-semibold">{data.balance || '0.00'}元</div>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {blocks.map((block, idx) => {
            const Icon = block.icon
            return (
              <div key={idx} className="telecom-metric p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{block.label}</span>
                  <Icon size={16} className={block.tone} />
                </div>
                <div className="mt-2 text-xl font-semibold text-slate-800">{block.value}</div>
              </div>
            )
          })}
        </div>
        {arrears > 0 && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/88 px-3 py-3 text-sm text-amber-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>当前仍有 <span className="font-semibold">{data.arrears}元</span> 欠费，请及时处理以免影响业务使用。</div>
          </div>
        )}
      </div>
    </div>
  )
}
