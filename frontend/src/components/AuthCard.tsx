import { ShieldCheck } from 'lucide-react'

interface Props {
  data: { method: string; hint: string }
  actions: { label: string; action: string; params: Record<string, any> }[]
  onAction: (action: string, params: Record<string, any>) => void
}

export default function AuthCard({ data, actions, onAction }: Props) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden w-72">
      <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 flex items-center gap-2">
        <ShieldCheck size={20} className="text-white" />
        <h3 className="text-white font-semibold text-base">身份验证</h3>
      </div>
      <div className="px-4 py-3 text-sm text-gray-600">
        <p>{data.hint}</p>
        <p className="text-xs text-gray-400 mt-1">验证方式：{data.method === 'sms' ? '短信验证码' : data.method}</p>
      </div>
      {actions.length > 0 && (
        <div className="px-4 pb-3 flex gap-2">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={() => onAction(a.action, a.params)}
              className="flex-1 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
