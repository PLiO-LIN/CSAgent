import { UserRound, BadgeInfo, Smartphone, CreditCard } from 'lucide-react'

export default function UserInfoCard({ data }: { data: any }) {
  const devices = data.prodInst || []

  return (
    <div className="telecom-card telecom-card-accent-sky my-3">
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15"><UserRound size={18} /></div>
          <div>
            <div className="text-sm font-semibold">{data.title || '用户信息'}</div>
            <div className="mt-1 text-xs text-white/80">{data.custName || data.phone}</div>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="telecom-metric p-3">
            <div className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-400"><BadgeInfo size={12} /> 客户标识</div>
            <div className="text-sm font-medium text-slate-800">{data.custId || '-'}</div>
          </div>
          <div className="telecom-metric p-3">
            <div className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-400"><CreditCard size={12} /> 客户编码</div>
            <div className="text-sm font-medium text-slate-800">{data.custNumber || '-'}</div>
          </div>
          <div className="telecom-metric p-3">
            <div className="mb-1 text-[11px] text-slate-400">分账序号</div>
            <div className="text-sm font-medium text-slate-800">{data.acctCd || '-'}</div>
          </div>
          <div className="telecom-metric p-3">
            <div className="mb-1 text-[11px] text-slate-400">付费类型</div>
            <div className="text-sm font-medium text-slate-800">{data.billingTypeText || data.billingType || '-'}</div>
          </div>
          <div className="telecom-metric p-3">
            <div className="mb-1 text-[11px] text-slate-400">付费周期</div>
            <div className="text-sm font-medium text-slate-800">{data.feeCycleType || '-'}</div>
          </div>
          <div className="telecom-metric p-3">
            <div className="mb-1 text-[11px] text-slate-400">客户类型</div>
            <div className="text-sm font-medium text-slate-800">{data.customerType || '-'}</div>
          </div>
        </div>
        <div className="telecom-inner-panel p-3">
          <div className="mb-2 inline-flex items-center gap-1 text-[11px] text-slate-400"><Smartphone size={12} /> 关联设备</div>
          <div className="flex flex-wrap gap-2">
            {devices.length > 0 ? devices.map((d: string, i: number) => (
              <span key={i} className="telecom-chip-muted">{d}</span>
            )) : <span className="text-xs text-slate-400">暂无</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
