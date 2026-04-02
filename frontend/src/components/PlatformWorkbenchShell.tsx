import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Bot, Brain, ChevronRight, Cpu, History, LayoutDashboard, Plus, RefreshCw, Save, SendHorizontal, Sparkles, Wrench } from 'lucide-react'
import ChatWorkspace from './ChatWorkspace'
import { usePlatformConsole, type ModelCatalogVendor } from '../hooks/usePlatformConsole'
import { type UseChatController } from '../hooks/useChat'
import { type FrameworkInfo, type FrameworkProfile } from '../hooks/useFrameworkProfile'
import {
  agentFormToPayload,
  createAgentForm,
  createSkillForm,
  createToolForm,
  formatJson,
  formatListText,
  parseListText,
  parseJsonText,
  skillFormToPayload,
  toolFormToPayload,
} from '../lib/platformConsoleForms'

type ViewKey = 'overview' | 'models' | 'agents' | 'tools' | 'skills' | 'cards' | 'sessions' | 'agent-chat'

interface McpServerDraft {
  name: string
  enabled: boolean
  transport: string
  command: string
  args_text: string
  cwd: string
  url: string
  scope: string
  tool_name_prefix: string
  include_tools_text: string
  exclude_tools_text: string
}

interface Props {
  chat: UseChatController
  profile: FrameworkProfile
  info: FrameworkInfo | null
  loading: boolean
  saving: boolean
  error: string
  saveProfile: (patch: Partial<FrameworkProfile>) => Promise<unknown>
}

const NEW_KEY = '__new__'
const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: any }> = [
  { key: 'overview', label: '概览', icon: LayoutDashboard },
  { key: 'models', label: '模型', icon: Cpu },
  { key: 'agents', label: '智能体', icon: Bot },
  { key: 'tools', label: '工具', icon: Wrench },
  { key: 'skills', label: '技能', icon: Brain },
  { key: 'cards', label: '卡片', icon: Sparkles },
  { key: 'sessions', label: '记录', icon: History },
]

const EMPTY_MCP_SERVER_DRAFT: McpServerDraft = {
  name: '',
  enabled: true,
  transport: 'stdio',
  command: '',
  args_text: '',
  cwd: '',
  url: '',
  scope: 'global',
  tool_name_prefix: '',
  include_tools_text: '',
  exclude_tools_text: '',
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function formatTime(value: number) {
  if (!value) return '—'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx('rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]', className)}>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2 text-sm text-slate-600">
      <div>{label}</div>
      {children}
    </label>
  )
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx('w-full rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white', props.className)}
    />
  )
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx('w-full rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white', props.className)}
    />
  )
}

function Area(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx('w-full rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white', props.className)}
    />
  )
}

function ResourceList({
  title,
  items,
  selectedKey,
  onSelect,
  onNew,
  getKey,
  getTitle,
  getMeta,
  newLabel = '新建',
}: {
  title: string
  items: any[]
  selectedKey: string
  onSelect: (value: string) => void
  onNew?: () => void
  getKey: (item: any) => string
  getTitle: (item: any) => string
  getMeta?: (item: any) => string
  newLabel?: string
}) {
  return (
    <Surface className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {onNew && (
          <button onClick={onNew} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
            <Plus size={14} />
            {newLabel}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const key = getKey(item)
          const active = key === selectedKey
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={cx(
                'w-full rounded-2xl border px-4 py-3 text-left transition',
                active ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-100 hover:bg-emerald-50/40',
              )}
            >
              <div className="text-sm font-medium text-slate-900">{getTitle(item)}</div>
              {getMeta && <div className="mt-1 text-xs text-slate-500">{getMeta(item) || '—'}</div>}
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

function createMcpServerDraft(name: string, record?: Record<string, any> | null): McpServerDraft {
  return {
    name: String(name || ''),
    enabled: Boolean(record?.enabled ?? true),
    transport: String(record?.transport || 'stdio') === 'websocket' ? 'ws' : String(record?.transport || 'stdio'),
    command: String(record?.command || ''),
    args_text: Array.isArray(record?.args) ? record.args.join('\n') : '',
    cwd: String(record?.cwd || ''),
    url: String(record?.url || ''),
    scope: String(record?.scope || 'global'),
    tool_name_prefix: String(record?.tool_name_prefix || ''),
    include_tools_text: Array.isArray(record?.include_tools) ? record.include_tools.join('\n') : '',
    exclude_tools_text: Array.isArray(record?.exclude_tools) ? record.exclude_tools.join('\n') : '',
  }
}

function resolveActiveModelDraft(draft: { active_vendor: string; active_model: string; vendors: ModelCatalogVendor[] }) {
  const vendor = draft.vendors.find(item => item.vendor_id === draft.active_vendor) || draft.vendors[0] || null
  const model = vendor?.models.find(item => item.model_id === draft.active_model) || vendor?.models[0] || null
  return {
    vendor,
    model,
    base_url: vendor?.base_url || '',
    chat_model: model?.chat_model || '',
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cx('rounded-full border px-3 py-1.5 text-xs transition', active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600')}>
      {children}
    </button>
  )
}

export default function PlatformWorkbenchShell({ chat, profile, info, error }: Props) {
  const consoleData = usePlatformConsole(info)
  const [view, setView] = useState<ViewKey>('overview')
  const [banner, setBanner] = useState('')
  const [actionError, setActionError] = useState('')
  const [agentId, setAgentId] = useState('')
  const [toolName, setToolName] = useState('')
  const [skillName, setSkillName] = useState('')
  const [cardId, setCardId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [mcpServerName, setMcpServerName] = useState('')
  const [modelDraft, setModelDraft] = useState<{ api_key: string; embed_model: string; active_vendor: string; active_model: string; vendors: ModelCatalogVendor[] }>({
    api_key: '',
    embed_model: '',
    active_vendor: '',
    active_model: '',
    vendors: [],
  })
  const [mcpMetaDraft, setMcpMetaDraft] = useState({ enabled: false, tool_timeout_seconds: 60 })
  const [vendorCreateDraft, setVendorCreateDraft] = useState({ vendor_id: '', display_name: '', base_url: '', enabled: true })
  const [modelCreateDraft, setModelCreateDraft] = useState({ model_id: '', display_name: '', chat_model: '', enabled: true })
  const [agentForm, setAgentForm] = useState(createAgentForm())
  const [toolForm, setToolForm] = useState(createToolForm())
  const [skillForm, setSkillForm] = useState(createSkillForm())
  const [cardToolDraft, setCardToolDraft] = useState({ summary: '', card_type: '', card_binding_text: '{}' })
  const [cardSkillDraft, setCardSkillDraft] = useState({ summary: '', card_types_text: '' })
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(EMPTY_MCP_SERVER_DRAFT)

  const agents = consoleData.agents
  const tools = consoleData.tools
  const skills = consoleData.skills
  const selectedAgent = agents.find(item => item.agent_id === agentId) || null
  const selectedTool = tools.find(item => item.tool_name === toolName) || null
  const selectedSkill = skills.find(item => item.skill_name === skillName) || null
  const selectedCard = consoleData.cardCatalog.find(item => item.id === cardId) || null
  const selectedVendor = modelDraft.vendors.find(item => item.vendor_id === vendorId) || modelDraft.vendors[0] || null
  const selectedAgentVendor = consoleData.modelConfig.vendors.find(item => item.vendor_id === agentForm.model_vendor_id) || consoleData.modelConfig.vendors[0] || null
  const mcpServerNames = Object.keys(consoleData.mcpConfig.servers || {})
  const selectedMcpServer = mcpServerName === NEW_KEY ? null : consoleData.mcpConfig.servers[mcpServerName]
  const activeModelDraft = useMemo(() => resolveActiveModelDraft(modelDraft), [modelDraft])
  const activeAgentForChat = agents.find(item => item.agent_id === chat.agentId) || selectedAgent
  const selectedAgentSessionOwner = String(selectedAgent?.agent_id || agentForm.agent_id || '').trim()
  const selectedAgentSessions = useMemo(
    () => selectedAgentSessionOwner ? consoleData.sessions.filter(item => item.agent_id === selectedAgentSessionOwner) : [],
    [consoleData.sessions, selectedAgentSessionOwner],
  )

  useEffect(() => {
    const nextDraft = {
      api_key: '',
      embed_model: consoleData.modelConfig.embed_model,
      active_vendor: consoleData.modelConfig.active_vendor,
      active_model: consoleData.modelConfig.active_model,
      vendors: (consoleData.modelConfig.vendors || []).map(vendor => ({
        ...vendor,
        models: [...(vendor.models || [])],
      })),
    }
    setModelDraft(nextDraft)
    setVendorId(prev => prev || nextDraft.active_vendor || nextDraft.vendors[0]?.vendor_id || '')
  }, [consoleData.modelConfig])

  useEffect(() => {
    setMcpMetaDraft({
      enabled: Boolean(consoleData.mcpConfig.enabled),
      tool_timeout_seconds: Number(consoleData.mcpConfig.tool_timeout_seconds || 60),
    })
  }, [consoleData.mcpConfig.enabled, consoleData.mcpConfig.tool_timeout_seconds])

  useEffect(() => {
    if (!agentId && agents[0]?.agent_id) setAgentId(agents[0].agent_id)
    if (!toolName && tools[0]?.tool_name) setToolName(tools[0].tool_name)
    if (!skillName && skills[0]?.skill_name) setSkillName(skills[0].skill_name)
    if (!cardId && consoleData.cardCatalog[0]?.id) setCardId(consoleData.cardCatalog[0].id)
  }, [agentId, agents, toolName, tools, skillName, skills, cardId, consoleData.cardCatalog])

  useEffect(() => {
    if (vendorId && !modelDraft.vendors.some(item => item.vendor_id === vendorId)) {
      setVendorId(modelDraft.vendors[0]?.vendor_id || '')
    }
  }, [modelDraft.vendors, vendorId])

  useEffect(() => {
    if (!mcpServerName && mcpServerNames[0]) setMcpServerName(mcpServerNames[0])
  }, [mcpServerName, mcpServerNames])

  useEffect(() => {
    if (mcpServerName === NEW_KEY) {
      setMcpServerDraft(EMPTY_MCP_SERVER_DRAFT)
      return
    }
    setMcpServerDraft(createMcpServerDraft(mcpServerName, selectedMcpServer))
  }, [mcpServerName, selectedMcpServer])

  useEffect(() => {
    const next = agentId === NEW_KEY ? createAgentForm() : createAgentForm(selectedAgent || undefined)
    if (!next.model_vendor_id) next.model_vendor_id = consoleData.modelConfig.active_vendor
    if (!next.model_id) next.model_id = consoleData.modelConfig.active_model
    setAgentForm(next)
  }, [agentId, selectedAgent, consoleData.modelConfig.active_vendor, consoleData.modelConfig.active_model])

  useEffect(() => {
    setToolForm(toolName === NEW_KEY ? createToolForm({ provider_type: 'protocol', scope: 'global', supports_card: false }) : createToolForm(selectedTool || undefined))
  }, [toolName, selectedTool])

  useEffect(() => {
    setSkillForm(skillName === NEW_KEY ? createSkillForm({ source_type: 'registry' }) : createSkillForm(selectedSkill || undefined))
  }, [skillName, selectedSkill])

  useEffect(() => {
    if (!selectedCard) return
    if (selectedCard.source_kind === 'tool') {
      const record = tools.find(item => item.tool_name === selectedCard.source_name)
      setCardToolDraft({
        summary: record?.summary || '',
        card_type: record?.card_type || '',
        card_binding_text: formatJson(record?.card_binding || {}),
      })
    }
    if (selectedCard.source_kind === 'skill') {
      const record = skills.find(item => item.skill_name === selectedCard.source_name)
      setCardSkillDraft({
        summary: record?.summary || '',
        card_types_text: formatListText(record?.card_types || []),
      })
    }
  }, [selectedCard, tools, skills])

  const overviewStats = useMemo<Array<{ label: string; value: string; onClick: () => void }>>(() => [
    { label: '模型', value: String(consoleData.stats.modelsReady), onClick: () => setView('models') },
    { label: '智能体', value: String(consoleData.stats.agents), onClick: () => setView('agents') },
    { label: '工具', value: String(consoleData.stats.tools), onClick: () => setView('tools') },
    { label: '技能', value: String(consoleData.stats.skills), onClick: () => setView('skills') },
    { label: '卡片', value: String(consoleData.stats.cards), onClick: () => setView('cards') },
    { label: '会话', value: String(consoleData.stats.sessions), onClick: () => setView('sessions') },
  ], [consoleData.stats])

  const agentFlags: Array<{ label: string; key: 'enabled' | 'is_default' | 'published'; value: boolean }> = [
    { label: '启用', key: 'enabled', value: agentForm.enabled },
    { label: '默认', key: 'is_default', value: agentForm.is_default },
    { label: '已发布', key: 'published', value: agentForm.published },
  ]

  const toggleName = (items: string[], name: string) => (
    items.includes(name) ? items.filter(item => item !== name) : [...items, name]
  )

  const runAction = async (work: () => Promise<void>, success: string) => {
    setActionError('')
    setBanner('')
    try {
      await work()
      setBanner(success)
    } catch (err: any) {
      setActionError(err?.message || '操作失败')
    }
  }

  const openAgentChat = (targetId: string) => {
    const id = String(targetId || '').trim()
    if (!id) return
    chat.reset()
    chat.setAgentId(id)
    setAgentId(id)
    setView('agent-chat')
  }

  const openSessionRecord = (sessionId: string) => {
    const id = String(sessionId || '').trim()
    if (!id) return
    void consoleData.selectSession(id)
    setView('sessions')
  }

  const updateVendor = (targetId: string, patch: Partial<ModelCatalogVendor>) => {
    setModelDraft(prev => ({
      ...prev,
      vendors: prev.vendors.map(item => item.vendor_id === targetId ? { ...item, ...patch } : item),
    }))
  }

  const updateVendorModel = (targetVendorId: string, targetModelId: string, patch: Record<string, any>) => {
    setModelDraft(prev => ({
      ...prev,
      vendors: prev.vendors.map(vendor => vendor.vendor_id === targetVendorId
        ? {
          ...vendor,
          models: vendor.models.map(model => model.model_id === targetModelId ? { ...model, ...patch } : model),
        }
        : vendor),
    }))
  }

  const addVendor = async () => {
    const vendorKey = vendorCreateDraft.vendor_id.trim()
    if (!vendorKey) throw new Error('厂商 ID 不能为空')
    if (modelDraft.vendors.some(item => item.vendor_id === vendorKey)) throw new Error('厂商 ID 已存在')
    const nextVendor: ModelCatalogVendor = {
      vendor_id: vendorKey,
      display_name: vendorCreateDraft.display_name.trim() || vendorKey,
      base_url: vendorCreateDraft.base_url.trim(),
      enabled: vendorCreateDraft.enabled,
      models: [],
    }
    setModelDraft(prev => ({
      ...prev,
      active_vendor: prev.active_vendor || vendorKey,
      vendors: [...prev.vendors, nextVendor],
    }))
    setVendorId(vendorKey)
    setVendorCreateDraft({ vendor_id: '', display_name: '', base_url: '', enabled: true })
  }

  const addVendorModel = async () => {
    if (!selectedVendor) throw new Error('请先选择厂商')
    const modelKey = modelCreateDraft.model_id.trim()
    if (!modelKey) throw new Error('模型 ID 不能为空')
    if (selectedVendor.models.some(item => item.model_id === modelKey)) throw new Error('模型 ID 已存在')
    updateVendor(selectedVendor.vendor_id, {
      models: [
        ...selectedVendor.models,
        {
          model_id: modelKey,
          display_name: modelCreateDraft.display_name.trim() || modelKey,
          chat_model: modelCreateDraft.chat_model.trim() || modelKey,
          enabled: modelCreateDraft.enabled,
        },
      ],
    })
    setModelDraft(prev => ({
      ...prev,
      active_vendor: prev.active_vendor || selectedVendor.vendor_id,
      active_model: prev.active_model || modelKey,
    }))
    setModelCreateDraft({ model_id: '', display_name: '', chat_model: '', enabled: true })
  }

  const saveModelCatalog = async () => {
    const resolved = resolveActiveModelDraft(modelDraft)
    const nextVendorId = modelDraft.active_vendor || resolved.vendor?.vendor_id || ''
    const nextModelId = modelDraft.active_model || resolved.model?.model_id || ''
    await consoleData.saveModelConfig({
      api_key: modelDraft.api_key,
      embed_model: modelDraft.embed_model,
      active_vendor: nextVendorId,
      active_model: nextModelId,
      vendors: modelDraft.vendors,
      base_url: resolved.base_url || consoleData.modelConfig.base_url,
      chat_model: resolved.chat_model || consoleData.modelConfig.chat_model,
    })
  }

  const saveMcpMeta = async () => {
    await consoleData.saveMcpConfig({
      enabled: mcpMetaDraft.enabled,
      tool_timeout_seconds: mcpMetaDraft.tool_timeout_seconds,
      servers: consoleData.mcpConfig.servers,
    })
    if (mcpMetaDraft.enabled) {
      await consoleData.syncMcpTools()
    } else {
      await consoleData.refreshRegistry()
    }
  }

  const saveMcpServer = async () => {
    const targetName = mcpServerDraft.name.trim()
    if (!targetName) throw new Error('MCP 服务名不能为空')
    const currentServers = { ...consoleData.mcpConfig.servers }
    if (mcpServerName && mcpServerName !== NEW_KEY && mcpServerName !== targetName) {
      delete currentServers[mcpServerName]
    }
    const existing = (currentServers[targetName] || selectedMcpServer || {}) as Record<string, any>
    currentServers[targetName] = {
      enabled: mcpServerDraft.enabled,
      transport: mcpServerDraft.transport,
      command: mcpServerDraft.command.trim(),
      args: parseListText(mcpServerDraft.args_text),
      env: existing.env || {},
      cwd: mcpServerDraft.cwd.trim(),
      url: mcpServerDraft.url.trim(),
      headers: existing.headers || {},
      timeout_seconds: Number(existing.timeout_seconds || 30),
      sse_read_timeout_seconds: Number(existing.sse_read_timeout_seconds || 300),
      tool_timeout_seconds: Number(existing.tool_timeout_seconds || mcpMetaDraft.tool_timeout_seconds || 60),
      scope: mcpServerDraft.scope,
      tool_name_prefix: mcpServerDraft.tool_name_prefix.trim(),
      include_tools: parseListText(mcpServerDraft.include_tools_text),
      exclude_tools: parseListText(mcpServerDraft.exclude_tools_text),
      risk_level: existing.risk_level || 'auto',
      confirm_policy: existing.confirm_policy || 'auto',
    }
    await consoleData.saveMcpConfig({
      enabled: mcpMetaDraft.enabled,
      tool_timeout_seconds: mcpMetaDraft.tool_timeout_seconds,
      servers: currentServers,
    })
    setMcpServerName(targetName)
    if (mcpMetaDraft.enabled) {
      await consoleData.syncMcpTools()
    }
  }

  const renderOverview = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {overviewStats.map(item => (
          <button key={item.label} onClick={item.onClick} className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 text-left shadow-[0_12px_40px_rgba(15,23,42,0.04)] transition hover:border-emerald-200 hover:bg-emerald-50/40">
            <div className="text-sm text-slate-500">{item.label}</div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">{item.value}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <Surface className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">模型目录</div>
              <div className="mt-1 text-sm text-slate-500">当前默认：{activeModelDraft.vendor?.display_name || '未选择'} / {activeModelDraft.model?.display_name || '未选择'}</div>
            </div>
            <button onClick={() => setView('models')} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去配置</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">厂商</div>
              <div className="mt-3 text-2xl font-semibold text-slate-900">{modelDraft.vendors.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">模型</div>
              <div className="mt-3 text-2xl font-semibold text-slate-900">{consoleData.stats.modelsReady}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Base URL</div>
              <div className="mt-3 truncate text-sm font-medium text-slate-700">{activeModelDraft.base_url || '—'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Chat Model</div>
              <div className="mt-3 truncate text-sm font-medium text-slate-700">{activeModelDraft.chat_model || '—'}</div>
            </div>
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 text-lg font-semibold text-slate-900">智能体</div>
          <div className="space-y-3">
            {agents.slice(0, 4).map(item => (
              <div key={item.agent_id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.name || item.agent_id}</div>
                  <div className="text-xs text-slate-500">{item.description || item.agent_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAgentId(item.agent_id); setView('agents') }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">配置</button>
                  <button onClick={() => openAgentChat(item.agent_id)} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white transition hover:bg-slate-800"><SendHorizontal size={12} />对话</button>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface className="p-6">
          <div className="mb-4 text-lg font-semibold text-slate-900">最近会话</div>
          <div className="space-y-3">
            {consoleData.sessions.slice(0, 5).map(item => (
              <button key={item.id} onClick={() => openSessionRecord(item.id)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-3 text-left transition hover:border-emerald-200">
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.title || item.id}</div>
                  <div className="text-xs text-slate-500">{item.agent_id || 'default'} · {formatTime(item.updated_at || item.created_at)}</div>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>
            ))}
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 text-lg font-semibold text-slate-900">卡片协议</div>
          <div className="flex flex-wrap gap-2">
            {consoleData.cardCatalog.slice(0, 10).map(item => (
              <button key={item.id} onClick={() => { setCardId(item.id); setView('cards') }} className="rounded-full border border-slate-200 bg-[#fbfefd] px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
                {item.card_type}
              </button>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )

  const renderModels = () => (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <ResourceList title="厂商" items={modelDraft.vendors} selectedKey={vendorId} onSelect={setVendorId} getKey={item => item.vendor_id} getTitle={item => item.display_name || item.vendor_id} getMeta={item => item.base_url || item.vendor_id} />
        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">模型管理</div>
              <div className="mt-1 text-sm text-slate-500">厂商下管理模型，Agent 只选择已登记的 vendor / model。</div>
            </div>
            <button onClick={() => void runAction(saveModelCatalog, '模型目录已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="API Key">
              <Input value={modelDraft.api_key} onChange={e => setModelDraft(prev => ({ ...prev, api_key: e.target.value }))} placeholder={consoleData.modelConfig.has_api_key ? '已配置，留空保持不变' : '输入 API Key'} />
            </Field>
            <Field label="Embedding Model">
              <Input value={modelDraft.embed_model} onChange={e => setModelDraft(prev => ({ ...prev, embed_model: e.target.value }))} />
            </Field>
            <Field label="默认厂商">
              <Select value={modelDraft.active_vendor} onChange={e => {
                const nextVendorId = e.target.value
                const nextVendor = modelDraft.vendors.find(item => item.vendor_id === nextVendorId)
                setModelDraft(prev => ({
                  ...prev,
                  active_vendor: nextVendorId,
                  active_model: nextVendor?.models[0]?.model_id || prev.active_model,
                }))
              }}>
                <option value="">未选择</option>
                {modelDraft.vendors.map(item => <option key={item.vendor_id} value={item.vendor_id}>{item.display_name || item.vendor_id}</option>)}
              </Select>
            </Field>
            <Field label="默认模型">
              <Select value={modelDraft.active_model} onChange={e => setModelDraft(prev => ({ ...prev, active_model: e.target.value }))}>
                <option value="">未选择</option>
                {(modelDraft.vendors.find(item => item.vendor_id === modelDraft.active_vendor)?.models || []).map(item => <option key={item.model_id} value={item.model_id}>{item.display_name || item.model_id}</option>)}
              </Select>
            </Field>
          </div>

          {selectedVendor ? (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="厂商 ID"><Input value={selectedVendor.vendor_id} disabled /></Field>
                <Field label="显示名"><Input value={selectedVendor.display_name} onChange={e => updateVendor(selectedVendor.vendor_id, { display_name: e.target.value })} /></Field>
                <Field label="Base URL"><Input value={selectedVendor.base_url} onChange={e => updateVendor(selectedVendor.vendor_id, { base_url: e.target.value })} /></Field>
              </div>
              <div className="flex items-center gap-2">
                <Chip active={selectedVendor.enabled} onClick={() => updateVendor(selectedVendor.vendor_id, { enabled: !selectedVendor.enabled })}>厂商启用</Chip>
                <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id} onClick={() => setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: selectedVendor.models[0]?.model_id || prev.active_model }))}>设为默认厂商</Chip>
              </div>
              <Surface className="border-dashed p-4">
                <div className="mb-3 text-sm font-medium text-slate-900">该厂商下的模型</div>
                <div className="space-y-3">
                  {selectedVendor.models.map(model => (
                    <div key={model.model_id} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="模型 ID"><Input value={model.model_id} disabled /></Field>
                        <Field label="显示名"><Input value={model.display_name} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { display_name: e.target.value })} /></Field>
                        <Field label="Chat Model"><Input value={model.chat_model} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { chat_model: e.target.value })} /></Field>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <Chip active={model.enabled} onClick={() => updateVendorModel(selectedVendor.vendor_id, model.model_id, { enabled: !model.enabled })}>模型启用</Chip>
                        <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id && modelDraft.active_model === model.model_id} onClick={() => setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: model.model_id }))}>设为默认模型</Chip>
                      </div>
                    </div>
                  ))}
                  {!selectedVendor.models.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">当前厂商还没有模型。</div>}
                </div>
              </Surface>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">先在左侧或下方新增一个厂商。</div>
          )}
        </Surface>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Surface className="p-6">
          <div className="mb-4 text-lg font-semibold text-slate-900">新增厂商</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="厂商 ID"><Input value={vendorCreateDraft.vendor_id} onChange={e => setVendorCreateDraft(prev => ({ ...prev, vendor_id: e.target.value }))} /></Field>
            <Field label="显示名"><Input value={vendorCreateDraft.display_name} onChange={e => setVendorCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
            <div className="md:col-span-2"><Field label="Base URL"><Input value={vendorCreateDraft.base_url} onChange={e => setVendorCreateDraft(prev => ({ ...prev, base_url: e.target.value }))} /></Field></div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Chip active={vendorCreateDraft.enabled} onClick={() => setVendorCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
            <button onClick={() => void runAction(addVendor, '厂商已加入目录')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />添加厂商</button>
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 text-lg font-semibold text-slate-900">新增模型</div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="归属厂商"><Input value={selectedVendor?.display_name || '请先在左侧选择厂商'} disabled /></Field>
            <Field label="模型 ID"><Input value={modelCreateDraft.model_id} onChange={e => setModelCreateDraft(prev => ({ ...prev, model_id: e.target.value }))} /></Field>
            <Field label="显示名"><Input value={modelCreateDraft.display_name} onChange={e => setModelCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
            <Field label="Chat Model"><Input value={modelCreateDraft.chat_model} onChange={e => setModelCreateDraft(prev => ({ ...prev, chat_model: e.target.value }))} /></Field>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Chip active={modelCreateDraft.enabled} onClick={() => setModelCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
            <button onClick={() => void runAction(addVendorModel, '模型已加入厂商目录')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />添加模型</button>
          </div>
        </Surface>
      </div>
    </div>
  )

  const renderAgents = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ResourceList title="智能体" items={agents} selectedKey={agentId} onSelect={setAgentId} onNew={() => setAgentId(NEW_KEY)} getKey={item => item.agent_id} getTitle={item => item.name || item.agent_id} getMeta={item => item.description} newLabel="新增智能体" />
      <Surface className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">{agentId === NEW_KEY ? '新建智能体' : agentForm.name || agentForm.agent_id || '智能体配置'}</div>
            <div className="mt-1 text-sm text-slate-500">系统核心提示、技能摘要与记忆提示由平台托管，这里只选择资源并编辑角色提示。</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void runAction(async () => { const saved = await consoleData.saveAgent(agentFormToPayload(agentForm)); setAgentId(saved.agent_id) }, '智能体已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
            <button onClick={() => void runAction(async () => { const saved = await consoleData.publishAgent(agentForm.agent_id); setAgentId(saved.agent_id) }, '智能体已发布')} disabled={!agentForm.agent_id.trim()} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40">发布</button>
            <button onClick={() => openAgentChat(agentForm.agent_id || selectedAgent?.agent_id || '')} disabled={!(agentForm.agent_id || selectedAgent?.agent_id)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800 disabled:opacity-40"><SendHorizontal size={14} />对话</button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Agent ID"><Input value={agentForm.agent_id} onChange={e => setAgentForm(prev => ({ ...prev, agent_id: e.target.value }))} /></Field>
          <Field label="名称"><Input value={agentForm.name} onChange={e => setAgentForm(prev => ({ ...prev, name: e.target.value }))} /></Field>
          <div className="md:col-span-2"><Field label="描述"><Area rows={3} value={agentForm.description} onChange={e => setAgentForm(prev => ({ ...prev, description: e.target.value }))} /></Field></div>
          <div className="md:col-span-2"><Field label="角色 Prompt"><Area rows={6} value={agentForm.persona_prompt} onChange={e => setAgentForm(prev => ({ ...prev, persona_prompt: e.target.value }))} /></Field></div>
          <Field label="厂商">
            <Select value={agentForm.model_vendor_id} onChange={e => {
              const nextVendorId = e.target.value
              const nextVendor = consoleData.modelConfig.vendors.find(item => item.vendor_id === nextVendorId)
              setAgentForm(prev => ({ ...prev, model_vendor_id: nextVendorId, model_id: nextVendor?.models[0]?.model_id || '' }))
            }}>
              <option value="">未选择</option>
              {consoleData.modelConfig.vendors.map(item => <option key={item.vendor_id} value={item.vendor_id}>{item.display_name || item.vendor_id}</option>)}
            </Select>
          </Field>
          <Field label="模型">
            <Select value={agentForm.model_id} onChange={e => setAgentForm(prev => ({ ...prev, model_id: e.target.value }))}>
              <option value="">未选择</option>
              {(selectedAgentVendor?.models || []).map(item => <option key={item.model_id} value={item.model_id}>{item.display_name || item.model_id}</option>)}
            </Select>
          </Field>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Surface className="p-4">
            <div className="mb-3 text-sm font-medium text-slate-900">全局工具</div>
            <div className="flex flex-wrap gap-2">
              {tools.map(item => (
                <Chip key={item.tool_name} active={agentForm.global_tool_names.includes(item.tool_name)} onClick={() => setAgentForm(prev => ({ ...prev, global_tool_names: toggleName(prev.global_tool_names, item.tool_name) }))}>
                  {item.display_name || item.tool_name}
                </Chip>
              ))}
            </div>
          </Surface>
          <Surface className="p-4">
            <div className="mb-3 text-sm font-medium text-slate-900">技能</div>
            <div className="flex flex-wrap gap-2">
              {skills.map(item => (
                <Chip key={item.skill_name} active={agentForm.skill_names.includes(item.skill_name)} onClick={() => setAgentForm(prev => ({ ...prev, skill_names: toggleName(prev.skill_names, item.skill_name) }))}>
                  {item.display_name || item.skill_name}
                </Chip>
              ))}
            </div>
          </Surface>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {agentFlags.map(flag => (
            <Chip key={flag.key} active={flag.value} onClick={() => setAgentForm(prev => ({ ...prev, [flag.key]: !prev[flag.key] }))}>{flag.label}</Chip>
          ))}
        </div>

        <Surface className="mt-5 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-900">最近对话记录</div>
              <div className="mt-1 text-xs text-slate-500">当前智能体的会话会优先挂在这里，平台会话页仍保留全局视角。</div>
            </div>
            <button onClick={() => setView('sessions')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">查看全部</button>
          </div>
          <div className="space-y-3">
            {selectedAgentSessions.slice(0, 5).map(item => (
              <button key={item.id} onClick={() => openSessionRecord(item.id)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-3 text-left transition hover:border-emerald-200">
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.title || item.id}</div>
                  <div className="text-xs text-slate-500">{formatTime(item.updated_at || item.created_at)}</div>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>
            ))}
            {!selectedAgentSessions.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                {selectedAgentSessionOwner ? '当前智能体还没有会话记录。' : '保存或选择一个智能体后，这里会展示它的会话记录。'}
              </div>
            )}
          </div>
        </Surface>
      </Surface>
    </div>
  )

  const renderTools = () => (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void runAction(async () => { await consoleData.syncLocalTools() }, '本地工具已同步')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />同步本地工具</button>
        <button onClick={() => void runAction(async () => { await consoleData.syncMcpTools() }, 'MCP 工具已同步')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />同步 MCP 工具</button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <ResourceList title="工具" items={tools} selectedKey={toolName} onSelect={setToolName} onNew={() => setToolName(NEW_KEY)} getKey={item => item.tool_name} getTitle={item => item.display_name || item.tool_name} getMeta={item => `${item.provider_type || 'protocol'} · ${item.summary || item.source_ref || '未填写摘要'}`} newLabel="协议接入" />
        <Surface className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">{toolName === NEW_KEY ? '新增协议工具' : toolForm.display_name || toolForm.tool_name || '工具配置'}</div>
              <div className="mt-1 text-sm text-slate-500">工具信息优先来自本地/MCP 同步；手动页只维护协议接入与启停状态。</div>
            </div>
            <button onClick={() => void runAction(async () => { const saved = await consoleData.saveTool(toolFormToPayload(toolForm)); setToolName(saved.tool_name) }, '工具已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="工具名"><Input value={toolForm.tool_name} onChange={e => setToolForm(prev => ({ ...prev, tool_name: e.target.value }))} /></Field>
            <Field label="显示名"><Input value={toolForm.display_name} onChange={e => setToolForm(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
            <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={toolForm.summary} onChange={e => setToolForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
            <Field label="接入类型">
              <Select value={toolForm.provider_type} onChange={e => setToolForm(prev => ({ ...prev, provider_type: e.target.value }))}>
                <option value="protocol">protocol</option>
                <option value="local">local</option>
                <option value="mcp">mcp</option>
              </Select>
            </Field>
            <Field label="作用域">
              <Select value={toolForm.scope} onChange={e => setToolForm(prev => ({ ...prev, scope: e.target.value }))}>
                <option value="global">global</option>
                <option value="skill">skill</option>
              </Select>
            </Field>
            <div className="md:col-span-2"><Field label="来源 / Source Ref"><Input value={toolForm.source_ref} onChange={e => setToolForm(prev => ({ ...prev, source_ref: e.target.value }))} /></Field></div>
            <div className="md:col-span-2"><Field label="协议参数 JSON"><Area rows={6} value={toolForm.transport_config_text} onChange={e => setToolForm(prev => ({ ...prev, transport_config_text: e.target.value }))} /></Field></div>
            {toolForm.supports_card && <Field label="Card Type"><Input value={toolForm.card_type} onChange={e => setToolForm(prev => ({ ...prev, card_type: e.target.value }))} /></Field>}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Chip active={toolForm.enabled} onClick={() => setToolForm(prev => ({ ...prev, enabled: !prev.enabled }))}>启用</Chip>
            <Chip active={toolForm.supports_card} onClick={() => setToolForm(prev => ({ ...prev, supports_card: !prev.supports_card }))}>卡片支持</Chip>
          </div>

          {selectedTool && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                <div className="mb-2 text-sm font-medium text-slate-900">输入 schema</div>
                <pre className="overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{formatJson(selectedTool.input_schema || {})}</pre>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                <div className="mb-2 text-sm font-medium text-slate-900">输出 schema</div>
                <pre className="overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{formatJson(selectedTool.output_schema || {})}</pre>
              </div>
            </div>
          )}
        </Surface>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <ResourceList title="MCP Servers" items={mcpServerNames.map(name => ({ name }))} selectedKey={mcpServerName} onSelect={setMcpServerName} onNew={() => setMcpServerName(NEW_KEY)} getKey={item => item.name} getTitle={item => item.name} getMeta={item => consoleData.mcpConfig.servers[item.name]?.transport || ''} newLabel="新增 MCP" />
        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">MCP 接入</div>
              <div className="mt-1 text-sm text-slate-500">在这里配置 MCP server，再同步出 MCP 工具。</div>
            </div>
            <button onClick={() => void runAction(saveMcpServer, 'MCP 服务配置已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存服务</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="MCP 启用">
              <Select value={mcpMetaDraft.enabled ? 'true' : 'false'} onChange={e => setMcpMetaDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
                <option value="true">启用</option>
                <option value="false">关闭</option>
              </Select>
            </Field>
            <Field label="工具超时秒数">
              <Input type="number" value={String(mcpMetaDraft.tool_timeout_seconds)} onChange={e => setMcpMetaDraft(prev => ({ ...prev, tool_timeout_seconds: Number(e.target.value || 0) }))} />
            </Field>
          </div>
          <div className="mt-4">
            <button onClick={() => void runAction(saveMcpMeta, 'MCP 全局配置已保存')} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">保存 MCP 开关</button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="服务名"><Input value={mcpServerDraft.name} onChange={e => setMcpServerDraft(prev => ({ ...prev, name: e.target.value }))} /></Field>
            <Field label="Transport">
              <Select value={mcpServerDraft.transport} onChange={e => setMcpServerDraft(prev => ({ ...prev, transport: e.target.value }))}>
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="http">http</option>
                <option value="ws">websocket</option>
              </Select>
            </Field>
            <Field label="Command"><Input value={mcpServerDraft.command} onChange={e => setMcpServerDraft(prev => ({ ...prev, command: e.target.value }))} /></Field>
            <Field label="URL"><Input value={mcpServerDraft.url} onChange={e => setMcpServerDraft(prev => ({ ...prev, url: e.target.value }))} /></Field>
            <Field label="CWD"><Input value={mcpServerDraft.cwd} onChange={e => setMcpServerDraft(prev => ({ ...prev, cwd: e.target.value }))} /></Field>
            <Field label="Scope">
              <Select value={mcpServerDraft.scope} onChange={e => setMcpServerDraft(prev => ({ ...prev, scope: e.target.value }))}>
                <option value="global">global</option>
                <option value="skill">skill</option>
              </Select>
            </Field>
            <Field label="Tool Name Prefix"><Input value={mcpServerDraft.tool_name_prefix} onChange={e => setMcpServerDraft(prev => ({ ...prev, tool_name_prefix: e.target.value }))} /></Field>
            <Field label="启用状态">
              <Select value={mcpServerDraft.enabled ? 'true' : 'false'} onChange={e => setMcpServerDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
                <option value="true">启用</option>
                <option value="false">关闭</option>
              </Select>
            </Field>
            <Field label="Args"><Area rows={5} value={mcpServerDraft.args_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, args_text: e.target.value }))} /></Field>
            <Field label="Include Tools"><Area rows={5} value={mcpServerDraft.include_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, include_tools_text: e.target.value }))} /></Field>
            <Field label="Exclude Tools"><Area rows={5} value={mcpServerDraft.exclude_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, exclude_tools_text: e.target.value }))} /></Field>
          </div>
        </Surface>
      </div>
    </div>
  )

  const renderSkills = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ResourceList title="技能" items={skills} selectedKey={skillName} onSelect={setSkillName} onNew={() => setSkillName(NEW_KEY)} getKey={item => item.skill_name} getTitle={item => item.display_name || item.skill_name} getMeta={item => item.summary} newLabel="新增技能" />
      <Surface className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">{skillName === NEW_KEY ? '新建技能' : skillForm.display_name || skillForm.skill_name || '技能配置'}</div>
            <div className="mt-1 text-sm text-slate-500">技能只维护名称、摘要、绑定工具和完整正文，摘要会直接进入系统提示。</div>
          </div>
          <button onClick={() => void runAction(async () => { const saved = await consoleData.saveSkill(skillFormToPayload(skillForm)); setSkillName(saved.skill_name) }, '技能已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="技能名"><Input value={skillForm.skill_name} onChange={e => setSkillForm(prev => ({ ...prev, skill_name: e.target.value }))} /></Field>
          <Field label="启用状态">
            <Select value={skillForm.enabled ? 'true' : 'false'} onChange={e => setSkillForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
              <option value="true">启用</option>
              <option value="false">关闭</option>
            </Select>
          </Field>
          <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={skillForm.summary} onChange={e => setSkillForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
          <div className="md:col-span-2"><Field label="正文 Markdown"><Area rows={12} value={skillForm.document_md} onChange={e => setSkillForm(prev => ({ ...prev, document_md: e.target.value }))} /></Field></div>
        </div>
        <div className="mt-5">
          <div className="mb-3 text-sm font-medium text-slate-900">绑定工具</div>
          <div className="flex flex-wrap gap-2">
            {tools.map(item => (
              <Chip key={item.tool_name} active={skillForm.tool_names.includes(item.tool_name)} onClick={() => setSkillForm(prev => ({ ...prev, tool_names: toggleName(prev.tool_names, item.tool_name) }))}>
                {item.display_name || item.tool_name}
              </Chip>
            ))}
          </div>
        </div>
      </Surface>
    </div>
  )

  const renderCards = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ResourceList title="卡片协议" items={consoleData.cardCatalog} selectedKey={cardId} onSelect={setCardId} getKey={item => item.id} getTitle={item => item.card_type} getMeta={item => `${item.source_kind} · ${item.source_name}`} />
      {selectedCard ? (
        <Surface className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="text-lg font-semibold text-slate-900">{selectedCard.card_type}</div>
            {selectedCard.source_kind === 'tool' ? (
              <button onClick={() => { setToolName(selectedCard.source_name); setView('tools') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去工具配置</button>
            ) : (
              <button onClick={() => { setSkillName(selectedCard.source_name); setView('skills') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去技能配置</button>
            )}
          </div>

          {selectedCard.source_kind === 'tool' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={cardToolDraft.summary} onChange={e => setCardToolDraft(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
              <Field label="Card Type"><Input value={cardToolDraft.card_type} onChange={e => setCardToolDraft(prev => ({ ...prev, card_type: e.target.value }))} /></Field>
              <Field label="来源工具"><Input value={selectedCard.source_name} disabled /></Field>
              <div className="md:col-span-2"><Field label="卡片绑定 JSON"><Area rows={10} value={cardToolDraft.card_binding_text} onChange={e => setCardToolDraft(prev => ({ ...prev, card_binding_text: e.target.value }))} /></Field></div>
              <div className="md:col-span-2">
                <button onClick={() => void runAction(async () => {
                  const base = tools.find(item => item.tool_name === selectedCard.source_name)
                  if (!base) throw new Error('来源工具不存在')
                  const saved = await consoleData.saveTool({
                    ...base,
                    summary: cardToolDraft.summary.trim(),
                    supports_card: true,
                    card_type: cardToolDraft.card_type.trim(),
                    card_binding: parseJsonText(cardToolDraft.card_binding_text, {}, '卡片绑定'),
                  })
                  setCardId(`tool:${saved.tool_name}:${saved.card_type || 'bound'}`)
                }, '卡片协议已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存卡片配置</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={cardSkillDraft.summary} onChange={e => setCardSkillDraft(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
              <Field label="来源技能"><Input value={selectedCard.source_name} disabled /></Field>
              <Field label="卡片类型"><Area rows={8} value={cardSkillDraft.card_types_text} onChange={e => setCardSkillDraft(prev => ({ ...prev, card_types_text: e.target.value }))} /></Field>
              <div className="md:col-span-2">
                <button onClick={() => void runAction(async () => {
                  const base = skills.find(item => item.skill_name === selectedCard.source_name)
                  if (!base) throw new Error('来源技能不存在')
                  const saved = await consoleData.saveSkill({
                    ...base,
                    summary: cardSkillDraft.summary.trim(),
                    card_types: cardSkillDraft.card_types_text.split(/[\n,]/g).map(item => item.trim()).filter(Boolean),
                  })
                  setCardId(`skill:${saved.skill_name}:${saved.card_types[0] || selectedCard.card_type}`)
                }, '卡片协议已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存卡片配置</button>
              </div>
            </div>
          )}
        </Surface>
      ) : (
        <Surface className="p-6 text-sm text-slate-500">暂无卡片协议</Surface>
      )}
    </div>
  )

  const renderSessions = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ResourceList title="对话记录" items={consoleData.sessions} selectedKey={consoleData.selectedSessionId} onSelect={value => { void consoleData.selectSession(value) }} getKey={item => item.id} getTitle={item => item.title || item.id} getMeta={item => `${item.agent_id || 'default'} · ${formatTime(item.updated_at || item.created_at)}`} />
      <Surface className="p-6">
        <div className="mb-4 text-lg font-semibold text-slate-900">消息</div>
        <div className="space-y-3">
          {consoleData.sessionMessages.map(item => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{item.role} · {item.agent || 'default'} · {item.model || '—'}</span>
                <span>{formatTime(item.created_at)}</span>
              </div>
              <div className="mt-3 space-y-2">
                {item.parts.map((part, index) => (
                  <div key={`${item.id}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-600">{part.type}</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{part.content || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  )

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6fbfa_0%,#f3faf7_42%,#eef7f3_100%)] text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-5 px-4 py-5 sm:px-6">
        <aside className="hidden w-[228px] flex-col rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.04)] xl:flex">
          <div className="px-2 py-3">
            <div className="text-xs uppercase tracking-[0.28em] text-emerald-600">CSAgent</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">平台控制台</div>
          </div>
          <div className="mt-4 space-y-2">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon
              const active = item.key === view || (item.key === 'agents' && view === 'agent-chat')
              return (
                <button key={item.key} onClick={() => setView(item.key)} className={cx('flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition', active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50')}>
                  <Icon size={16} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Surface className="mb-5 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm text-slate-500">{profile.ui.app_name || 'CSAgent Platform'}</div>
                <div className="mt-1 text-3xl font-semibold text-slate-900">{view === 'agent-chat' ? (activeAgentForChat?.name || '智能体对话') : NAV_ITEMS.find(item => item.key === view)?.label || '概览'}</div>
              </div>
              <button onClick={() => void runAction(async () => { await Promise.all([consoleData.refreshModelConfig(), consoleData.refreshMcpConfig(), consoleData.refreshSessions(), consoleData.refreshRegistry()]) }, '控制台数据已刷新')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />刷新</button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 xl:hidden">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const active = item.key === view || (item.key === 'agents' && view === 'agent-chat')
                return (
                  <button key={item.key} onClick={() => setView(item.key)} className={cx('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition', active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                    <Icon size={14} />
                    {item.label}
                  </button>
                )
              })}
            </div>

            {(banner || actionError || consoleData.configError || consoleData.registryError || consoleData.mcpError || consoleData.sessionsError || error) && (
              <div className={cx('mt-4 rounded-2xl px-4 py-3 text-sm', actionError || consoleData.configError || consoleData.registryError || consoleData.mcpError || consoleData.sessionsError || error ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700')}>
                {actionError || consoleData.configError || consoleData.registryError || consoleData.mcpError || consoleData.sessionsError || error || banner}
              </div>
            )}
          </Surface>

          {view === 'overview' && renderOverview()}
          {view === 'models' && renderModels()}
          {view === 'agents' && renderAgents()}
          {view === 'tools' && renderTools()}
          {view === 'skills' && renderSkills()}
          {view === 'cards' && renderCards()}
          {view === 'sessions' && renderSessions()}
          {view === 'agent-chat' && (
            <ChatWorkspace
              agent={activeAgentForChat ? { agent_id: activeAgentForChat.agent_id, name: activeAgentForChat.name, description: activeAgentForChat.description } : null}
              chat={chat}
              modelReady={consoleData.modelConfig.has_api_key}
              quickActions={profile.ui.quick_actions}
              onBack={() => setView('agents')}
            />
          )}
        </main>
      </div>
    </div>
  )
}
