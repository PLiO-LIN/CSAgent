export default function PackageCard({ data }: { data: any }) {
  const items = data.items || []
  return (
    <div className="my-2 bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100 p-3 space-y-2">
      <div className="text-xs font-semibold text-blue-700">{data.title || '套餐使用情况'}</div>
      {items.map((it: any, i: number) => {
        const pct = parseInt(it.percent) || 0
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 font-medium">{it.name}</span>
              <span className="text-gray-400">剩余 {it.left}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-yellow-400' : 'bg-blue-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>已用 {it.used}</span>
              <span>总量 {it.total}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
