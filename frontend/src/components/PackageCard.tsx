export default function PackageCard({ data }: { data: any }) {
  const items = data.items || []
  const excess = data.excess || []
  const carryOver = data.carryOverFlow || {}
  const sharedUsage = data.sharedUsage || {}
  const loginRole = data.loginRole || ''
  const subCards = Array.isArray(sharedUsage.subCards) ? sharedUsage.subCards : []
  const loginView = sharedUsage.loginView || null

  return (
    <div className="telecom-card telecom-card-accent-cyan my-3">
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{data.title || '用量概览'}</div>
            <div className="mt-1 text-xs text-white/80">用户标识 {data.phone}</div>
          </div>
          <div className="telecom-chip">账期 {data.month}</div>
        </div>
      </div>
      <div className="space-y-3 p-4">
      {(carryOver.supported || (loginRole === 'master_card' && subCards.length > 0) || (loginRole === 'sub_card' && loginView)) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {carryOver.supported && (
            <div className="telecom-metric p-4">
              <div className="text-[11px] text-slate-400">可结转流量</div>
              <div className="mt-2 text-xl font-semibold text-slate-800">{carryOver.left || '0'}{carryOver.unit || ''}</div>
              {carryOver.desc && <div className="mt-1 text-xs text-slate-500">{carryOver.desc}</div>}
            </div>
          )}
          {loginRole === 'master_card' && subCards.length > 0 && (
            <div className="telecom-metric p-4">
              <div className="text-[11px] text-slate-400">副卡共享流量</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">已用 {sharedUsage.sharedUsed || '0'}{sharedUsage.unit || ''}</div>
              <div className="mt-1 text-xs text-slate-500">剩余 {sharedUsage.sharedLeft || '0'}{sharedUsage.unit || ''} · 共 {subCards.length} 张副卡</div>
            </div>
          )}
          {loginRole === 'sub_card' && loginView && (
            <div className="telecom-metric p-4">
              <div className="text-[11px] text-slate-400">当前副卡共享用量</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">已用 {loginView.dataUsed || '0'}{loginView.unit || ''}</div>
              <div className="mt-1 text-xs text-slate-500">剩余 {loginView.dataLeft || '0'}{loginView.unit || ''}</div>
            </div>
          )}
        </div>
      )}
      {items.map((it: any, i: number) => {
        const pct = parseInt(String(it.percent || '0').replace('%', ''), 10) || 0
        const usedPct = Math.max(6, Math.min(100, 100 - pct))
        return (
          <div key={i} className="telecom-inner-panel p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-800">{it.name}</span>
              <span className="text-xs text-slate-400">剩余 {it.left}</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${usedPct > 85 ? 'bg-rose-400' : usedPct > 60 ? 'bg-amber-400' : 'bg-[var(--telecom-blue-500)]'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>已用 {it.used}</span>
              <span>总量 {it.total}</span>
            </div>
          </div>
        )
      })}
      {excess.filter((it: any) => Number(it.show_value || 0) > 0).length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/88 px-4 py-3 text-sm text-amber-700">
          额外消耗：
          <span className="ml-1">
            {excess.filter((it: any) => Number(it.show_value || 0) > 0).map((it: any) => `${it.show_name}${it.show_value}${it.show_unit}`).join('、')}
          </span>
        </div>
      )}
      {loginRole === 'master_card' && subCards.length > 0 && (
        <div className="telecom-inner-panel p-4">
          <div className="mb-3 text-sm font-medium text-slate-800">副卡共享明细</div>
          <div className="space-y-2 text-xs text-slate-600">
            {subCards.map((card: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] px-3 py-2">
                {card.phone} · 已用 {card.dataUsed}{card.unit || ''} · 剩余 {card.dataLeft}{card.unit || ''}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
