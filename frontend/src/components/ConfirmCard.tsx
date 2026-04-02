import { AlertCircle } from 'lucide-react'

interface Props {
  title: string
  data: { description: string; [k: string]: any }
  actions: { label: string; action: string; params: Record<string, any> }[]
  onAction: (action: string, params: Record<string, any>) => void
}

export default function ConfirmCard({ title, data, actions, onAction }: Props) {
  return (
    <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden w-72">
      <div className="bg-gradient-to-r from-orange-400 to-orange-500 px-4 py-3 flex items-center gap-2">
        <AlertCircle size={20} className="text-white" />
        <h3 className="text-white font-semibold text-base">{title}</h3>
      </div>
      <div className="px-4 py-3 text-sm text-gray-600">
        <p>{data.description}</p>
      </div>
      <div className="px-4 pb-3 flex gap-2">
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => onAction(a.action, a.params)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              a.action === 'confirm'
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
