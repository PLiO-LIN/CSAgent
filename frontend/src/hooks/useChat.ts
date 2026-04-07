import { useState, useRef, useCallback } from 'react'
import type { ChatSendInput, EntityAliases } from '../lib/chatDisplay'
import { extractEntityAliases, resolveChatActionInput } from '../lib/chatDisplay'

export interface ToolCall {
  id: string
  name: string
  status: 'calling' | 'executing' | 'done' | 'error'
  input?: string
  output?: string
  expanded: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'summary'
  content: string
  thinking: string
  tools: ToolCall[]
  cards: Record<string, any>
  streaming: boolean
}

let seq = 0
function uid() {
  return `m_${++seq}_${Date.now()}`
}

const TOOL_LABELS: Record<string, string> = {
  load_skills: '加载技能',
  list_tools: '查看工具',
}

export function toolLabel(name: string) {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name]
  return String(name || '')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export interface UseChatController {
  messages: ChatMessage[]
  loading: boolean
  sessionId: string
  phone: string
  agentId: string
  agentVariables: Record<string, string>
  entityAliases: EntityAliases
  setPhone: (value: string) => void
  setAgentId: (value: string) => void
  setAgentVariables: (values: Record<string, string>) => void
  setAgentVariable: (key: string, value: string) => void
  send: (input: ChatSendInput) => Promise<void>
  stop: () => void
  reset: () => void
  toggle: (msgId: string, idx: number) => void
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [phone, setPhone] = useState('')
  const [agentId, setAgentId] = useState('')
  const [agentVariables, setAgentVariablesState] = useState<Record<string, string>>({})
  const [entityAliases, setEntityAliases] = useState<EntityAliases>({})
  const cur = useRef<ChatMessage | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const setAgentVariables = useCallback((values: Record<string, string>) => {
    const next: Record<string, string> = {}
    Object.entries(values || {}).forEach(([key, value]) => {
      const name = String(key || '').trim()
      if (!name) return
      next[name] = String(value || '').trim()
    })
    setAgentVariablesState(next)
  }, [])

  const setAgentVariable = useCallback((key: string, value: string) => {
    const name = String(key || '').trim()
    if (!name) return
    setAgentVariablesState(prev => ({
      ...prev,
      [name]: String(value || ''),
    }))
  }, [])

  const mergeEntityAliases = useCallback((aliases: EntityAliases) => {
    if (!Object.keys(aliases || {}).length) return
    setEntityAliases(prev => {
      const next = { ...prev }
      let changed = false
      Object.entries(aliases).forEach(([id, name]) => {
        const key = String(id || '').trim()
        const value = String(name || '').trim()
        if (!key || !value || next[key] === value) return
        next[key] = value
        changed = true
      })
      return changed ? next : prev
    })
  }, [])

  const finishStreamingMessage = useCallback((toolOutput = '已手动停止') => {
    if (cur.current) {
      cur.current.tools = cur.current.tools.map(t => {
        if (t.status === 'calling' || t.status === 'executing') {
          return { ...t, status: 'error', output: t.output || toolOutput }
        }
        return t
      })
      cur.current.streaming = false
      flush()
    }
    cur.current = null
    abortRef.current = null
    setLoading(false)
  }, [])

  const flush = () => {
    if (!cur.current) return
    const snap = { ...cur.current, tools: [...cur.current.tools] }
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === snap.id)
      if (idx < 0) return [...prev, snap]
      const next = [...prev]
      next[idx] = snap
      return next
    })
  }

  const ensure = () => {
    if (!cur.current) {
      cur.current = {
        id: uid(),
        role: 'assistant',
        content: '',
        thinking: '',
        tools: [],
        cards: {},
        streaming: true,
      }
    }
    return cur.current
  }

  const handle = (line: string) => {
    if (!line.startsWith('data: ')) return
    const raw = line.slice(6).trim()
    if (!raw) return
    let ev: any
    try { ev = JSON.parse(raw) } catch { return }

    switch (ev.type) {
      case 'session':
        setSessionId(ev.session_id || '')
        break

      case 'thinking_delta': {
        const m = ensure()
        m.thinking += ev.content || ''
        flush()
        break
      }

      case 'text_delta': {
        const m = ensure()
        m.content += ev.content || ''
        flush()
        break
      }

      case 'tool_call': {
        const m = ensure()
        const id = ev.tool?.id || uid()
        const ex = m.tools.find(t => t.id === id)
        if (ex) {
          ex.name = ev.tool?.name || ex.name
          ex.input = ev.tool?.arguments || ex.input
          flush()
          break
        }
        const toolIdx = m.tools.length
        m.tools.push({
          id,
          name: ev.tool?.name || '',
          status: 'calling',
          input: ev.tool?.arguments || '',
          expanded: false,
        })
        m.content += `\n[[TOOL:${toolIdx}]]\n`
        flush()
        break
      }

      case 'tool_executing': {
        const m = ensure()
        const t = m.tools.find(t => t.id === ev.tool_call_id)
          || m.tools.find(t => t.name === ev.tool && (t.status === 'calling' || t.status === 'executing'))
        if (t) t.status = 'executing'
        flush()
        break
      }

      case 'tool_result': {
        const m = ensure()
        const t = m.tools.find(t => t.id === ev.tool_call_id)
          || m.tools.find(t => t.name === ev.tool && (t.status === 'calling' || t.status === 'executing'))
        if (t) {
          t.status = ev.error ? 'error' : 'done'
          t.output = ev.text || ''
        }
        flush()
        break
      }

      case 'card': {
        const m = ensure()
        if (ev.card_id && ev.card) {
          mergeEntityAliases(extractEntityAliases(ev.card))
          m.cards[ev.card_id] = ev.card
        }
        flush()
        break
      }

      case 'status':
        setMessages(prev => [...prev, {
          id: uid(),
          role: 'status',
          content: ev.text || '',
          thinking: '',
          tools: [],
          cards: {},
          streaming: false,
        }])
        break

      case 'summary':
        setMessages(prev => [...prev, {
          id: uid(),
          role: 'summary',
          content: ev.text || '已完成上下文总结，后续回复将基于压缩摘要继续。',
          thinking: '',
          tools: [],
          cards: {},
          streaming: false,
        }])
        break

      case 'error': {
        const m = ensure()
        m.content += `\n\n[错误] ${ev.text || '发生错误'}`
        m.streaming = false
        flush()
        cur.current = null
        abortRef.current = null
        setLoading(false)
        break
      }

      case 'done': {
        if (cur.current) {
          cur.current.tools = cur.current.tools.map(t => {
            if (t.status === 'calling' || t.status === 'executing') {
              return { ...t, status: 'error', output: t.output || '未收到工具结果（会话结束）' }
            }
            return t
          })
          cur.current.streaming = false
          flush()
        }
        cur.current = null
        abortRef.current = null
        setLoading(false)
        break
      }
    }
  }

  const stop = useCallback(() => {
    abortRef.current?.abort()
    finishStreamingMessage()
  }, [finishStreamingMessage])

  const send = useCallback(async (input: ChatSendInput) => {
    const payload = resolveChatActionInput(input)
    const content = String(payload?.content || '').trim()
    const displayContent = String(payload?.displayContent || content).trim()
    const clientMeta = payload?.clientMeta && typeof payload.clientMeta === 'object' ? payload.clientMeta : undefined
    if (!content.trim() || loading) return

    setMessages(prev => [...prev, {
      id: uid(),
      role: 'user',
      content: displayContent || content,
      thinking: '',
      tools: [],
      cards: {},
      streaming: false,
    }])

    setLoading(true)
    cur.current = null

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch('/api/chat/sse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, content, phone, agent_id: agentId, client_meta: clientMeta, agent_variables: agentVariables }),
        signal: ctrl.signal,
      })

      if (!resp.ok || !resp.body) {
        abortRef.current = null
        setLoading(false)
        return
      }

      const reader = resp.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          handle(line)
        }
      }
      // process remaining
      if (buf.trim()) handle(buf)

      // ensure done state
      if (cur.current) {
        const msg = cur.current as ChatMessage
        msg.streaming = false
        flush()
        cur.current = null
      }
      abortRef.current = null
      setLoading(false)
    } catch (e: any) {
      if (e.name === 'AbortError') {
        finishStreamingMessage()
      } else {
        const m = ensure()
        m.content += '\n\n[错误] 网络请求失败'
        m.streaming = false
        flush()
        cur.current = null
        abortRef.current = null
        setLoading(false)
      }
    }
  }, [sessionId, loading, phone, agentId, agentVariables, finishStreamingMessage])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setSessionId('')
    setEntityAliases({})
    cur.current = null
    setLoading(false)
  }, [])

  const toggle = useCallback((msgId: string, idx: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const tools = m.tools.map((t, i) => i === idx ? { ...t, expanded: !t.expanded } : t)
      return { ...m, tools }
    }))
  }, [])

  return { messages, loading, sessionId, phone, agentId, agentVariables, entityAliases, setPhone, setAgentId, setAgentVariables, setAgentVariable, send, stop, reset, toggle }
}
