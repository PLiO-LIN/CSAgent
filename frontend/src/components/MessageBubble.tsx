import { useState } from 'react'
import { User, Info, ChevronDown, ChevronUp, Brain, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { marked } from 'marked'
import CardRenderer from './CardRenderer'
import type { ChatMessage, ToolCall } from '../hooks/useChat'
import { toolLabel } from '../hooks/useChat'
import type { ChatSendHandler, EntityAliases } from '../lib/chatDisplay'
import { applyEntityAliases } from '../lib/chatDisplay'

marked.setOptions({ breaks: true, gfm: true })

interface Props {
  message: ChatMessage
  toggle: (msgId: string, idx: number) => void
  send: ChatSendHandler
  entityAliases: EntityAliases
}

function renderMarkdown(text: string) {
  return { __html: marked.parse(text) as string }
}


type Segment =
  | { type: 'text'; content: string }
  | { type: 'card'; content: string; card: any }
  | { type: 'tool'; toolIndex: number }

type SegmentGroup =
  | { kind: 'content'; segments: Segment[] }
  | { kind: 'tool'; toolIndex: number }

/** 解析文本中的 [[CARD:xxx]] 和 [[TOOL:n]] 占位符，按顺序分组 */
function parseGroups(
  text: string,
  cards: Record<string, any>,
  tools: ToolCall[],
  streaming: boolean,
): SegmentGroup[] {
  // 流式输出时，隐藏尾部未闭合的 [[... 避免显示原始占位符
  if (streaming) {
    const idx = text.lastIndexOf('[[')
    if (idx !== -1 && text.indexOf(']]', idx) === -1) {
      text = text.slice(0, idx)
    }
  }

  const segments: Segment[] = []
  const re = /\[\[(CARD|TOOL):([^\]]+)\]\]/g
  let last = 0
  let match: RegExpExecArray | null
  const usedCards = new Set<string>()
  const usedTools = new Set<number>()

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', content: text.slice(last, match.index) })
    }
    const kind = match[1]
    const value = match[2]
    if (kind === 'CARD') {
      const card = cards[value]
      if (card) {
        segments.push({ type: 'card', content: value, card })
        usedCards.add(value)
      }
    } else if (kind === 'TOOL') {
      const ti = parseInt(value, 10)
      if (!isNaN(ti) && ti >= 0 && ti < tools.length) {
        segments.push({ type: 'tool', toolIndex: ti })
        usedTools.add(ti)
      }
    }
    last = re.lastIndex
  }
  if (last < text.length) {
    segments.push({ type: 'text', content: text.slice(last) })
  }

  // 未被引用的工具放到最前面（兼容旧消息）
  const pre: Segment[] = []
  tools.forEach((_, i) => {
    if (!usedTools.has(i)) pre.push({ type: 'tool', toolIndex: i })
  })
  // 未被引用的卡片：流式中不追加
  if (!streaming) {
    for (const [cid, card] of Object.entries(cards)) {
      if (!usedCards.has(cid)) segments.push({ type: 'card', content: cid, card })
    }
  }

  // 按 tool 拆分为组：连续 text/card → content，tool → 独立
  const all = [...pre, ...segments]
  const groups: SegmentGroup[] = []
  let buf: Segment[] = []
  for (const seg of all) {
    if (seg.type === 'tool') {
      if (buf.length) { groups.push({ kind: 'content', segments: buf }); buf = [] }
      groups.push({ kind: 'tool', toolIndex: (seg as any).toolIndex })
    } else {
      buf.push(seg)
    }
  }
  if (buf.length) groups.push({ kind: 'content', segments: buf })
  return groups
}

export default function MessageBubble({ message, toggle, send, entityAliases }: Props) {
  const [thinkOpen, setThinkOpen] = useState(false)

  if (message.role === 'summary') {
    return (
      <div className="mb-4 flex justify-center">
        <div className="studio-inner-panel w-full max-w-[85%] rounded-[22px] border-[rgba(15,111,255,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,244,255,0.98))] px-4 py-3 shadow-[0_12px_28px_rgba(13,63,145,0.08)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--studio-blue-700)]">
            <Brain size={14} />
            <span>上下文已总结</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--studio-ink-700)]">
            {applyEntityAliases(message.content, entityAliases)}
          </div>
        </div>
      </div>
    )
  }

  if (message.role === 'status') {
    return (
      <div className="flex justify-center my-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,111,255,0.08)] bg-white/86 px-3 py-1 text-xs text-slate-500 shadow-[0_8px_20px_rgba(13,63,145,0.06)]">
          <Info size={12} />
          <span>{applyEntityAliases(message.content, entityAliases)}</span>
        </div>
      </div>
    )
  }

  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse mb-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0b4ea8,#0f6fff)] shadow-[0_12px_26px_rgba(15,111,255,0.24)]">
          <User size={16} className="text-white" />
        </div>
        <div className="max-w-[75%]">
          <div className="rounded-[22px] rounded-tr-sm border border-[rgba(255,255,255,0.28)] bg-[linear-gradient(135deg,#0c56c7_0%,#0f6fff_55%,#54afff_100%)] px-4 py-3 text-sm leading-relaxed text-white shadow-[0_16px_30px_rgba(15,111,255,0.2)]">
            {applyEntityAliases(message.content, entityAliases)}
          </div>
        </div>
      </div>
    )
  }

  // Assistant message
  const groups = parseGroups(message.content, message.cards, message.tools, message.streaming)
  const hasThinking = message.thinking.length > 0

  const renderToolBar = (toolIndex: number) => {
    const t = message.tools[toolIndex]
    if (!t) return null
    return (
      <div className={`overflow-hidden rounded-[20px] border ${
        t.status === 'error'
          ? 'border-rose-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,243,244,0.94))]'
          : 'border-[rgba(15,111,255,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,255,0.95))]'
      }`}>
        <button
          onClick={() => toggle(message.id, toolIndex)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs transition-colors hover:bg-white/50"
        >
          <span className="flex items-center gap-2">
            {(t.status === 'calling' || t.status === 'executing') && <Loader2 size={12} className="animate-spin text-[var(--studio-blue-500)]" />}
            {t.status === 'done' && <CheckCircle2 size={12} className="text-[var(--studio-blue-500)]" />}
            {t.status === 'error' && <XCircle size={12} className="text-rose-500" />}
            <span className="font-medium text-slate-700">{toolLabel(t.name)}</span>
          </span>
          <span className="flex items-center gap-2 text-slate-400">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              t.status === 'error' ? 'bg-rose-100 text-rose-600'
              : t.status === 'done' ? 'bg-[rgba(15,111,255,0.12)] text-[var(--studio-blue-600)]'
              : 'bg-[rgba(15,111,255,0.10)] text-[var(--studio-blue-500)]'
            }`}>
              {t.status === 'calling' ? '调用中' : t.status === 'executing' ? '执行中' : t.status === 'done' ? '完成' : '失败'}
            </span>
            {t.expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>
        {t.expanded && (
          <div className="space-y-2 border-t border-[rgba(15,111,255,0.08)] bg-white/92 px-3 py-2">
            {t.input && (
              <div>
                <div className="mb-1 text-[10px] text-slate-400">调用参数</div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] p-2 text-[11px] text-slate-600">{applyEntityAliases(t.input, entityAliases)}</pre>
              </div>
            )}
            {t.output && (
              <div>
                <div className="mb-1 text-[10px] text-slate-400">返回结果</div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[rgba(15,111,255,0.08)] bg-[rgba(240,247,255,0.92)] p-2 text-[11px] text-slate-600">{applyEntityAliases(t.output, entityAliases)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-3 mb-4">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0a4da8,#0f6fff)] shadow-[0_12px_24px_rgba(15,111,255,0.2)]">
        <span className="text-white text-xs font-bold">AI</span>
      </div>
      <div className="max-w-[85%] min-w-0 space-y-2">
        {/* 思考内容 - 可折叠 */}
        {hasThinking && (
          <div className="overflow-hidden rounded-[20px] border border-[rgba(15,111,255,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(237,245,255,0.92))]">
            <button
              onClick={() => setThinkOpen(!thinkOpen)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--studio-blue-600)] transition-colors hover:bg-white/50"
            >
              <Brain size={12} />
              <span className="font-medium">思考过程</span>
              <span className="ml-auto">{thinkOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
            </button>
            {thinkOpen && (
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 pb-2 text-xs leading-relaxed text-[var(--studio-ink-700)]">
                {applyEntityAliases(message.thinking, entityAliases)}
              </div>
            )}
          </div>
        )}

        {/* 分组渲染：文本/卡片 和 工具调用 交替 */}
        {groups.map((group, gi) => {
          if (group.kind === 'tool') {
            return <div key={`t-${gi}`}>{renderToolBar(group.toolIndex)}</div>
          }
          const segs = group.segments
          const hasContent = segs.some(s =>
            s.type === 'card' ? true : (s as any).content?.trim()?.length > 0
          )
          if (!hasContent) return null
          const isLast = gi === groups.length - 1
          return (
            <div
              key={`c-${gi}`}
              className={`rounded-[24px] rounded-tl-sm border border-[rgba(15,111,255,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,255,0.96))] px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-[0_14px_28px_rgba(13,63,145,0.07)] ${isLast && message.streaming ? 'typing-cursor' : ''}`}
            >
              {segs.map((seg, si) => {
                if (seg.type === 'card' && (seg as any).card) {
                  return <CardRenderer key={si} card={(seg as any).card} onAction={send} />
                }
                if (!(seg as any).content?.trim()) return null
                return (
                  <div
                    key={si}
                    className="markdown-body"
                    dangerouslySetInnerHTML={renderMarkdown(applyEntityAliases((seg as any).content, entityAliases))}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
