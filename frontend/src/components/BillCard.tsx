export default function BillCard({ data }: { data: any }) {
  const items = data.items || []
  const billingType = data.billingType || ''
  const feeCycleType = data.feeCycleType || ''

  return (
    <div className="telecom-card telecom-card-accent-light my-3">
      <div className="telecom-card-head px-4 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{data.title || '账单明细'}</div>
            <div className="mt-1 text-xs text-white/80">{data.accountName || data.phone}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(billingType || feeCycleType) && <div className="telecom-chip">{billingType || '-'} / {feeCycleType || '-'}</div>}
            <div className="telecom-chip">{data.range}</div>
          </div>
        </div>
      </div>
      <div className="space-y-2 p-4">
        {(billingType || feeCycleType) && (
          <div className="telecom-inner-panel px-4 py-3 text-sm text-slate-600">
            当前账单判断：
            <span className="ml-1 font-semibold text-slate-900">{billingType || '-'}</span>
            <span className="mx-2 text-slate-300">/</span>
            <span className="font-semibold text-slate-900">{feeCycleType || '-'}</span>
          </div>
        )}
        {items.map((it: any, i: number) => (
          <div key={i} className="telecom-inner-panel flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-800">{it.billDate || it.date}</div>
              <div className="mt-1 text-xs text-slate-400">账单周期 {it.fromDate} ~ {it.toDate}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800">{it.charge}元</div>
              <div className="mt-1 text-xs text-slate-400">待缴 {it.balanceDue}元</div>
            </div>
            <span className={it.paid ? 'telecom-badge-success' : 'telecom-badge-danger'}>
              {it.paid ? '已缴' : '未缴'}
            </span>
          </div>
        ))}
        <div className="telecom-inner-panel px-4 py-3 text-right text-sm text-slate-600">
          未缴合计 <span className="font-semibold text-slate-900">{data.totalUnpaid || '0.00'}元</span>
        </div>
      </div>
    </div>
  )
}
