import { Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react'

interface Props {
  tools: { name: string; status: string; text?: string }[]
}

const TOOL_LABELS: Record<string, string> = {
  query_plan: '信息查询',
  recommend_plan: '方案推荐',
  order_plan: '流程办理',
  query_bill: '记录查询',
  verify_identity: '身份验证',
  search_knowledge: '知识检索',
}

export default function ToolStatus({ tools }: Props) {
  if (!tools.length) return null
  return (
    <div className="space-y-1.5 my-2">
      {tools.map((t, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
          {t.status === 'executing' || t.status === 'calling' ? (
            <Loader2 size={14} className="animate-spin text-blue-500" />
          ) : t.status === 'done' ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : t.status === 'error' ? (
            <XCircle size={14} className="text-red-500" />
          ) : (
            <Wrench size={14} className="text-gray-400" />
          )}
          <span>{TOOL_LABELS[t.name] || t.name}</span>
          {t.status === 'executing' && <span className="text-gray-400">执行中...</span>}
          {t.status === 'done' && <span className="text-green-600">完成</span>}
          {t.status === 'error' && <span className="text-red-500">失败</span>}
        </div>
      ))}
    </div>
  )
}
