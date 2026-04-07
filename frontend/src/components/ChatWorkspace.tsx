import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bot, Loader2, MessageSquareMore, RefreshCcw, SendHorizontal, ShieldAlert, Square, UserRound } from 'lucide-react'
import MessageBubble from './MessageBubble'
import type { UseChatController } from '../hooks/useChat'

interface Props {
  agent: {
    agent_id: string
    name: string
    description: string
    agent_variables?: Array<{
      key: string
      label: string
      description: string
      default_value: string
      required: boolean
      inject_to_prompt: boolean
    }>
  } | null
  chat: UseChatController
  modelReady: boolean
  onBack: () => void
  quickActions?: string[]
}

const DEFAULT_QUICK = ['介绍一下你当前的职责', '列出你当前可用的工具与技能', '帮我规划下一步配置']

export default function ChatWorkspace({ agent, chat, modelReady, onBack, quickActions = [] }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const prompts = (quickActions.length ? quickActions : DEFAULT_QUICK).slice(0, 3)
  const agentVariables = agent?.agent_variables || []
  const missingRequiredVariables = agentVariables.filter(item => item.required && !String(chat.agentVariables[item.key] || item.default_value || '').trim())

  const scrollKey = useMemo(() => chat.messages.map(item => `${item.id}:${item.role}:${item.content.length}:${item.streaming ? 1 : 0}`).join('|'), [chat.messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scrollKey, chat.loading])

  const submit = () => {
    const text = input.trim()
    if (!text || chat.loading || missingRequiredVariables.length) return
    void chat.send(text)
    setInput('')
  }

  return (
    <div className="flex min-h-[78vh] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fcfb_100%)] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:text-emerald-600">
              <ArrowLeft size={16} />
            </button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Bot size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{agent?.name || '智能体对话'}</div>
              <div className="text-xs text-slate-500">{agent?.description || '从智能体详情进入对话'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${modelReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {modelReady ? '模型已就绪' : '未配置模型密钥'}
            </span>
            <button onClick={chat.reset} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
              <RefreshCcw size={14} />
              新对话
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <UserRound size={14} className="text-slate-400" />
            <input value={chat.phone} onChange={e => chat.setPhone(e.target.value)} placeholder="身份标识（可选）" className="w-[180px] bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          </label>
          <div className="text-xs text-slate-400">会话 {chat.sessionId || '未开始'}</div>
        </div>
        {agentVariables.length > 0 && (
          <div className="mt-4 rounded-[24px] border border-slate-200 bg-[#f8fcfb] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">固定入参变量</div>
                <div className="mt-1 text-xs text-slate-500">这里填写的平台变量会进入提示词或绑定到工具参数；绑定后的参数由系统自动填写，模型不能改写。</div>
              </div>
              {missingRequiredVariables.length > 0 && <div className="text-xs text-amber-600">还有 {missingRequiredVariables.length} 个必填变量未填写</div>}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agentVariables.map(item => (
                <label key={item.key} className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-slate-900">{item.label || item.key}</div>
                    {item.required && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] text-amber-700">必填</span>}
                    {item.inject_to_prompt && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] text-emerald-700">注入提示词</span>}
                  </div>
                  <input
                    value={chat.agentVariables[item.key] ?? item.default_value ?? ''}
                    onChange={e => chat.setAgentVariable(item.key, e.target.value)}
                    placeholder={item.default_value || item.key}
                    className="w-full rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white"
                  />
                  <div className="text-xs text-slate-500">{item.description || `变量键：${item.key}`}</div>
                </label>
              ))}
            </div>
          </div>
        )}
        {!modelReady && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <ShieldAlert size={14} />
            请先在首页配置模型密钥，否则消息会返回 401。
          </div>
        )}
        {missingRequiredVariables.length > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <ShieldAlert size={14} />
            请先填写必填变量：{missingRequiredVariables.map(item => item.label || item.key).join('、')}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-[#fcfffe] px-6 py-6">
        {chat.messages.length === 0 ? (
          <div className="flex h-full min-h-[360px] items-center justify-center">
            <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-[#f8fcfb] px-8 py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-white text-emerald-600 shadow-sm">
                <MessageSquareMore size={28} />
              </div>
              <div className="mt-5 text-xl font-semibold text-slate-900">和 {agent?.name || '当前智能体'} 开始一段新对话</div>
              <div className="mt-2 text-sm text-slate-500">直接发问题，或者用下面的快捷指令。</div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {prompts.map(item => (
                  <button key={item} onClick={() => { if (!missingRequiredVariables.length) void chat.send(item) }} disabled={missingRequiredVariables.length > 0} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            {chat.messages.map(item => (
              <MessageBubble key={item.id} message={item} toggle={chat.toggle} send={chat.send} entityAliases={chat.entityAliases} />
            ))}
            {chat.loading && !chat.messages.find(item => item.streaming) && (
              <div className="mb-4 flex gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Bot size={16} />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-emerald-600 shadow-sm">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-4xl rounded-[26px] border border-slate-200 bg-[#f8fcfb] p-3 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={3}
            placeholder={chat.loading ? '正在回复中，可点击发送按钮停止' : '输入问题，Shift + Enter 换行'}
            className="min-h-[96px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
          />
          <div className="mt-3 flex items-center justify-between gap-3 px-3 pb-1">
            <div className="text-xs text-slate-400">{agent?.agent_id || '未选择智能体'}</div>
            <button
              onClick={chat.loading ? chat.stop : submit}
              disabled={chat.loading ? false : (!input.trim() || missingRequiredVariables.length > 0)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {chat.loading ? <Square size={14} /> : <SendHorizontal size={16} />}
              {chat.loading ? '停止' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
