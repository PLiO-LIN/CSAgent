import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, RotateCcw, Loader2, Square, RadioTower, ShieldCheck, Sparkles } from 'lucide-react'
import MessageBubble from './MessageBubble'
import type { ChatMessage } from '../hooks/useChat'
import type { ChatSendHandler, EntityAliases } from '../lib/chatDisplay'

interface Props {
  messages: ChatMessage[]
  loading: boolean
  phone: string
  entityAliases: EntityAliases
  send: ChatSendHandler
  stop: () => void
  reset: () => void
  toggle: (msgId: string, idx: number) => void
}

const QUICK = ['查询我的套餐用量', '查一下本月账单', '给我推荐适合我的产品', '查一下我的当前订单']

export default function ChatPanel({ messages, loading, phone, entityAliases, send, stop, reset, toggle }: Props) {
  const [input, setInput] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const highlights = [
    { icon: ShieldCheck, label: '安全办理' },
    { icon: RadioTower, label: '业务直达' },
    { icon: Sparkles, label: '智能推荐' },
  ]

  const scrollSignature = useMemo(() => messages.map(msg => [
    msg.id,
    msg.role,
    msg.streaming ? '1' : '0',
    msg.content.length,
    msg.thinking.length,
    Object.keys(msg.cards).join(','),
    msg.tools.map(tool => `${tool.id}:${tool.status}:${tool.input?.length || 0}:${tool.output?.length || 0}`).join('|'),
  ].join('::')).join('||'), [messages])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scrollSignature, loading])

  const submit = () => {
    const text = input.trim()
    if (!text || loading) return
    send(text)
    setInput('')
  }

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(241,247,255,0.98))]">
      {/* 头部 - 蓝色渐变 */}
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0a4da8_0%,#0f6fff_48%,#4fb0ff_100%)] px-6 py-5 text-white">
        <div className="pointer-events-none absolute -left-10 top-[-3.5rem] h-36 w-36 rounded-full bg-white/12 blur-2xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-28 w-40 rounded-full bg-[rgba(255,255,255,0.14)] blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/20 bg-white/16 backdrop-blur">
              <span className="text-xl font-bold tracking-[0.08em]">翼</span>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-[0.04em] text-white">中国电信智能客服</h1>
              <p className="mt-1 text-xs text-white/78">小翼在线服务台{phone ? ` · 已绑定 ${phone}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="telecom-chip hidden sm:inline-flex">7×24 在线服务</span>
            <button onClick={reset} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white/78 transition-colors hover:bg-white/16 hover:text-white" title="新对话">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {highlights.map((item, idx) => {
            const Icon = item.icon
            return (
              <div key={idx} className="telecom-chip inline-flex items-center gap-1.5">
                <Icon size={12} />
                {item.label}
              </div>
            )
          })}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(229,239,255,0.34))] px-5 py-5 space-y-1">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center py-6">
            <div className="telecom-inner-panel w-full max-w-2xl px-6 py-8 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,rgba(15,111,255,0.16),rgba(108,176,255,0.26))] shadow-inner shadow-[rgba(15,111,255,0.08)]">
                <span className="text-4xl">💬</span>
              </div>

              <div className="mt-6">
                <p className="text-lg font-semibold text-slate-800">您好，这里是中国电信智能客服</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">可为您处理套餐查询、余额账单、产品推荐、订单支付、充值确认等常见业务，整体体验会更接近电信在线客服工作台。</p>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {highlights.map((item, idx) => {
                  const Icon = item.icon
                  return (
                    <div key={idx} className="telecom-chip-muted inline-flex items-center gap-1.5">
                      <Icon size={12} />
                      {item.label}
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {QUICK.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="telecom-secondary-btn text-xs"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} toggle={toggle} send={send} entityAliases={entityAliases} />
        ))}
        {loading && !messages.find(m => m.streaming) && (
          <div className="flex gap-3 mb-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] text-white shadow-[0_12px_26px_rgba(15,111,255,0.24)]">
              <span className="text-white text-xs font-bold">翼</span>
            </div>
            <div className="telecom-inner-panel rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 size={16} className="animate-spin text-[var(--telecom-blue-500)]" />
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* 输入框 */}
      <div className="border-t border-[rgba(15,111,255,0.08)] bg-white/86 px-4 py-4 backdrop-blur-md">
        <div className="telecom-inner-panel flex gap-3 items-end p-3">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={loading ? '正在回复中，可点击右侧停止' : '输入您的问题...'}
              rows={1}
              className="telecom-input min-h-[52px] w-full resize-none px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          <button
            onClick={loading ? stop : submit}
            disabled={loading ? false : !input.trim()}
            className="telecom-primary-btn h-[52px] w-[52px] flex-shrink-0 rounded-[18px] p-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title={loading ? '停止回复' : '发送消息'}
          >
            {loading ? <Square size={16} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
