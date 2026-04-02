import { Award, TrendingUp, ShieldCheck, Clock3, Gift } from 'lucide-react'

export default function PointsCard({ data }: { data: any }) {
  const blocks = [
    { label: '总积分', value: data.sumPoints, icon: Award, tone: 'text-amber-500' },
    { label: '可用积分', value: data.useablePoints, icon: ShieldCheck, tone: 'text-emerald-500' },
    { label: '已用积分', value: data.usedPoints, icon: TrendingUp, tone: 'text-sky-500' },
    { label: '即将清零', value: data.expiringPoints, icon: Clock3, tone: 'text-rose-500' },
    { label: '可用沪呗', value: data.availableHuBei ?? 0, icon: Gift, tone: 'text-[var(--telecom-blue-500)]' },
  ]

  return (
    <div className="telecom-card telecom-card-accent-indigo my-3">
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{data.title || '积分信息'}</div>
            <div className="mt-1 text-xs text-white/80">{data.custName || data.phone}</div>
          </div>
          <div className="telecom-chip">状态：{data.statusText || '-'}</div>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {blocks.map((block, idx) => {
          const Icon = block.icon
          return (
            <div key={idx} className="telecom-metric p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400">{block.label}</div>
                <Icon size={16} className={block.tone} />
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-800">{block.value ?? 0}</div>
            </div>
          )
        })}
        <div className="telecom-inner-panel p-3 sm:col-span-2 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>本月新增 <span className="font-semibold text-slate-800">{data.currMonthPoints ?? 0}</span></span>
            <span>清零年份 <span className="font-semibold text-slate-800">{data.expireYear || '-'}</span></span>
            <span>{data.availableHuBeiText || `可用沪呗 ${data.availableHuBei ?? 0}`}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
