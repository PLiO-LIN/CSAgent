import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, RotateCcw, Loader2, Square, RadioTower, ShieldCheck, Sparkles } from 'lucide-react'
import MessageBubble from './MessageBubble'
import type { ChatMessage } from '../hooks/useChat'
import type { ChatSendHandler, EntityAliases } from '../lib/chatDisplay'

interface Props {
  appName: string
  appSubtitle: string
  welcomeTitle: string
  welcomeDescription: string
  quickActions: string[]
  highlights: string[]
  selectedIdentityPrefix: string
  messages: ChatMessage[]
  loading: boolean
  phone: string
  entityAliases: EntityAliases
  send: ChatSendHandler
  stop: () => void
  reset: () => void
  toggle: (msgId: string, idx: number) => void
}

const DEFAULT_QUICK = ['介绍一下这个平台能做什么', '查看当前可用工具', '查看当前可用技能', '帮我规划一个新的 Agent']
const DEFAULT_HIGHLIGHTS = ['工具注册中心', '技能与 Agent 配置', 'MCP 工具接入']

export default function ChatPanel({
  appName,
  appSubtitle,
  welcomeTitle,
  welcomeDescription,
  quickActions,
  highlights,
  selectedIdentityPrefix,
  messages,
  loading,
  phone,
  entityAliases,
  send,
  stop,
  reset,
  toggle,
}: Props) {
  const [input, setInput] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const highlightItems = (highlights.length ? highlights : DEFAULT_HIGHLIGHTS).slice(0, 3).map((label, index) => ({
    icon: [ShieldCheck, RadioTower, Sparkles][index] || Sparkles,
    label,
  }))
  const actionItems = quickActions.length ? quickActions : DEFAULT_QUICK

  const identityText = phone ? `${selectedIdentityPrefix || '当前演示身份'} · ${phone}` : ''

  const headerTitle = appName || 'CSAgent Studio'
  const headerSubtitle = appSubtitle || '通用客服智能体框架'
  const emptyTitle = welcomeTitle || '你好，我是通用客服智能体'
  const emptyDescription = welcomeDescription || '可用于管理 Agent、技能、工具与卡片输出协议，并支持长期记忆与 MCP 工具接入。'

  const quickLabel = actionItems.map(item => item.trim()).filter(Boolean)

  const chips = highlightItems.length ? highlightItems : [
    { icon: ShieldCheck, label: '工具注册中心' },
    { icon: RadioTower, label: 'MCP 工具接入' },
    { icon: Sparkles, label: '长期记忆' },
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
              <span className="text-base font-bold tracking-[0.08em]">AI</span>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-[0.04em] text-white">{headerTitle}</h1>
              <p className="mt-1 text-xs text-white/78">{headerSubtitle}{identityText ? ` · ${identityText}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="studio-chip hidden sm:inline-flex">通用客服工作台</span>
            <button onClick={reset} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white/78 transition-colors hover:bg-white/16 hover:text-white" title="新对话">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {chips.map((item, idx) => {
            const Icon = item.icon
            return (
              <div key={idx} className="studio-chip inline-flex items-center gap-1.5">
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
            <div className="studio-inner-panel w-full max-w-2xl px-6 py-8 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,rgba(15,111,255,0.16),rgba(108,176,255,0.26))] shadow-inner shadow-[rgba(15,111,255,0.08)]">
                <span className="text-4xl">💬</span>
              </div>

              <div className="mt-6">
                <p className="text-lg font-semibold text-slate-800">{emptyTitle}</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{emptyDescription}</p>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {chips.map((item, idx) => {
                  const Icon = item.icon
                  return (
                    <div key={idx} className="studio-chip-muted inline-flex items-center gap-1.5">
                      <Icon size={12} />
                      {item.label}
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {quickLabel.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="studio-secondary-btn text-xs"
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
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div className="studio-inner-panel rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 size={16} className="animate-spin text-[var(--studio-blue-500)]" />
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* 输入框 */}
      <div className="border-t border-[rgba(15,111,255,0.08)] bg-white/86 px-4 py-4 backdrop-blur-md">
        <div className="studio-inner-panel flex gap-3 items-end p-3">
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
              placeholder={loading ? '正在回复中，可点击右侧停止' : '输入你的问题，或描述需要处理的客服流程...'}
              rows={1}
              className="studio-input min-h-[52px] w-full resize-none px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          <button
            onClick={loading ? stop : submit}
            disabled={loading ? false : !input.trim()}
            className="studio-primary-btn h-[52px] w-[52px] flex-shrink-0 rounded-[18px] p-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title={loading ? '停止回复' : '发送消息'}
          >
            {loading ? <Square size={16} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}
