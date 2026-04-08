import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Bot, Brain, ChevronRight, Cpu, LayoutDashboard, Plus, RefreshCw, Save, SendHorizontal, Sparkles, Trash2, Wrench } from 'lucide-react'
import ChatWorkspace from './ChatWorkspace'
import CardRenderer from './CardRenderer'
import { usePlatformConsole, type McpProbeResult, type ModelCatalogVendor, type ModelProbeResult } from '../hooks/usePlatformConsole'
import { type UseChatController } from '../hooks/useChat'
import { type FrameworkInfo, type FrameworkProfile } from '../hooks/useFrameworkProfile'
import { resolveChatActionInput } from '../lib/chatDisplay'
import {
  type AgentToolArgBindingFormField,
  type AgentVariableFormField,
  agentFormToPayload,
  cardTemplateFormToPayload,
  createAgentForm,
  createCardTemplateForm,
  createSkillForm,
  createToolForm,
  formatJson,
  formatListText,
  parseListText,
  parseJsonText,
  skillFormToPayload,
  toolFormToPayload,
} from '../lib/platformConsoleForms'

type ViewKey = 'overview' | 'models' | 'agents' | 'tools' | 'skills' | 'cards' | 'agent-chat'

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

const EMPTY_VENDOR_CREATE_DRAFT = { vendor_id: '', display_name: '', base_url: '', enabled: true }
const EMPTY_MODEL_CREATE_DRAFT = { model_id: '', display_name: '', chat_model: '', enabled: true }

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

function Modal({
  open,
  onClose,
  title,
  description,
  widthClass = 'max-w-5xl',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  widthClass?: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('max-h-[92vh] w-full overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.18)]', widthClass)}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">关闭</button>
        </div>
        <div className="max-h-[calc(92vh-96px)] overflow-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
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

function resolveMcpServerNameFromTool(tool: FrameworkInfo['tools'][number] | null | undefined) {
  const sourceRef = String(tool?.source_ref || '').trim()
  if (sourceRef.startsWith('mcp:')) {
    return sourceRef.slice(4)
  }
  return String(tool?.transport_config?.server || '').trim()
}

function buildAgentVariableValues(agentVariables: AgentVariableFormField[]) {
  const result: Record<string, string> = {}
  for (const item of agentVariables || []) {
    const key = String(item?.key || '').trim()
    if (!key) continue
    result[key] = String(item?.default_value || '').trim()
  }
  return result
}

function getToolInputArgNames(tool: FrameworkInfo['tools'][number] | null | undefined) {
  const properties = tool?.input_schema?.properties
  if (!properties || typeof properties !== 'object') return []
  return Object.keys(properties).filter(Boolean)
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cx('rounded-full border px-3 py-1.5 text-xs transition', active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600')}>
      {children}
    </button>
  )
}

function createDefaultCardBinding(templateId = '') {
  return formatJson({
    mode: 'field_map',
    template_id: templateId,
    title: '$.title',
    summary: '$.summary',
    payload_path: '$',
    actions_path: '$.actions',
  })
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function buildTemplatePreviewCard(template: Record<string, any>) {
  const payload = isRecord(template.sample_payload) ? template.sample_payload : { value: template.sample_payload }
  return {
    type: String(template.template_type || 'info_detail'),
    template_id: String(template.template_id || ''),
    renderer_key: String(template.renderer_key || ''),
    title: String(payload.title || template.display_name || template.template_id || '模板卡片'),
    summary: String(payload.summary || template.summary || ''),
    payload,
    ui_schema: isRecord(template.ui_schema) ? template.ui_schema : {},
    actions: Array.isArray(template.action_schema?.actions) ? template.action_schema.actions : [],
    meta: isRecord(template.metadata) ? template.metadata : {},
  }
}

function extractPathHints(path: string) {
  const text = String(path || '').trim()
  if (!text) return [] as string[]
  return Array.from(new Set(text.replace(/^\$\.?/, '').split(/\.|\[/g).map(item => item.replace(/\]/g, '').trim()).filter(item => item && !/^\d+$/.test(item))))
}

function renderHighlightedJson(value: Record<string, any>, activePath: string) {
  const lines = formatJson(value).split('\n')
  const hints = extractPathHints(activePath)
  const tail = hints[hints.length - 1] || ''
  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-[#f8fcfb] p-4 text-xs leading-6 text-slate-700">
      {lines.map((line, index) => {
        const isActive = hints.length > 0 && (line.includes(`\"${tail}\"`) || hints.some(hint => line.includes(`\"${hint}\"`)))
        return (
          <div key={`json-line-${index}`} className={cx('rounded px-2 transition', isActive && 'bg-amber-100 text-slate-900')}>
            <pre className="whitespace-pre-wrap break-all font-mono">{line}</pre>
          </div>
        )
      })}
    </div>
  )
}

function safeJsonObject(text: string, fallback: Record<string, any> = {}) {
  try {
    const value = JSON.parse(String(text || '').trim() || '{}')
    return isRecord(value) ? value : fallback
  } catch {
    return fallback
  }
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
  const [cardsMode, setCardsMode] = useState<'templates' | 'bindings'>('templates')
  const [cardTemplateId, setCardTemplateId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [mcpServerName, setMcpServerName] = useState('')
  const [modelDraft, setModelDraft] = useState<{ api_key: string; embed_model: string; active_vendor: string; active_model: string; vendors: ModelCatalogVendor[] }>({
    api_key: '',
    embed_model: '',
    active_vendor: '',
    active_model: '',
    vendors: [],
  })
  const [modelVendorExpanded, setModelVendorExpanded] = useState<Record<string, boolean>>({})
  const [toolServerExpanded, setToolServerExpanded] = useState<Record<string, boolean>>({})
  const [vendorCreateOpen, setVendorCreateOpen] = useState(false)
  const [modelCreateVendorId, setModelCreateVendorId] = useState('')
  const [mcpMetaDraft, setMcpMetaDraft] = useState({ enabled: false, tool_timeout_seconds: 60 })
  const [vendorCreateDraft, setVendorCreateDraft] = useState(EMPTY_VENDOR_CREATE_DRAFT)
  const [modelCreateDraft, setModelCreateDraft] = useState(EMPTY_MODEL_CREATE_DRAFT)
  const [agentForm, setAgentForm] = useState(createAgentForm())
  const [toolForm, setToolForm] = useState(createToolForm())
  const [skillForm, setSkillForm] = useState(createSkillForm())
  const [cardTemplateForm, setCardTemplateForm] = useState(createCardTemplateForm())
  const [cardToolDraft, setCardToolDraft] = useState({ summary: '', card_type: '', card_binding_text: '{}' })
  const [cardSkillDraft, setCardSkillDraft] = useState({ summary: '', card_types_text: '' })
  const [cardPlaygroundDraft, setCardPlaygroundDraft] = useState({ source_payload_text: '{}', binding_text: createDefaultCardBinding('') })
  const [cardPreviewCard, setCardPreviewCard] = useState<Record<string, any> | null>(null)
  const [cardPreviewDebug, setCardPreviewDebug] = useState<Record<string, any>>({})
  const [cardPreviewActionText, setCardPreviewActionText] = useState('')
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(EMPTY_MCP_SERVER_DRAFT)
  const [mcpProbeResult, setMcpProbeResult] = useState<McpProbeResult | null>(null)
  const [modelProbeResult, setModelProbeResult] = useState<ModelProbeResult | null>(null)
  const [cardInspectPath, setCardInspectPath] = useState('')
  const [cardMetaDrawerOpen, setCardMetaDrawerOpen] = useState(true)
  const [vendorCreateDialogOpen, setVendorCreateDialogOpen] = useState(false)
  const [modelCreateDialogOpen, setModelCreateDialogOpen] = useState(false)
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [toolEditorOpen, setToolEditorOpen] = useState(false)
  const [mcpServerDialogOpen, setMcpServerDialogOpen] = useState(false)
  const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const [cardTemplateDialogOpen, setCardTemplateDialogOpen] = useState(false)
  const [cardBindingDialogOpen, setCardBindingDialogOpen] = useState(false)

  const agents = consoleData.agents
  const tools = consoleData.tools
  const skills = consoleData.skills
  const cardTemplates = consoleData.cardTemplates
  const selectedAgent = agents.find(item => item.agent_id === agentId) || null
  const selectedTool = tools.find(item => item.tool_name === toolName) || null
  const selectedSkill = skills.find(item => item.skill_name === skillName) || null
  const selectedCard = consoleData.cardCatalog.find(item => item.id === cardId) || null
  const selectedCardTemplate = cardTemplates.find(item => item.template_id === cardTemplateId) || null
  const cardTemplateGallery = useMemo(
    () => cardTemplates.map(item => ({
      template: item,
      previewCard: buildTemplatePreviewCard(item as Record<string, any>),
    })),
    [cardTemplates],
  )
  const selectedTemplatePreviewCard = useMemo(
    () => buildTemplatePreviewCard({
      template_id: cardTemplateForm.template_id,
      display_name: cardTemplateForm.display_name,
      summary: cardTemplateForm.summary,
      template_type: cardTemplateForm.template_type,
      renderer_key: cardTemplateForm.renderer_key,
      sample_payload: safeJsonObject(cardTemplateForm.sample_payload_text, {}),
      ui_schema: safeJsonObject(cardTemplateForm.ui_schema_text, {}),
      action_schema: safeJsonObject(cardTemplateForm.action_schema_text, {}),
      metadata: safeJsonObject(cardTemplateForm.metadata_text, {}),
    }),
    [cardTemplateForm.action_schema_text, cardTemplateForm.display_name, cardTemplateForm.metadata_text, cardTemplateForm.renderer_key, cardTemplateForm.sample_payload_text, cardTemplateForm.summary, cardTemplateForm.template_id, cardTemplateForm.template_type, cardTemplateForm.ui_schema_text],
  )
  const selectedTemplatePreviewPayload = useMemo(
    () => safeJsonObject(cardTemplateForm.sample_payload_text, {}),
    [cardTemplateForm.sample_payload_text],
  )
  const selectedVendor = modelDraft.vendors.find(item => item.vendor_id === vendorId) || modelDraft.vendors[0] || null
  const selectedAgentVendor = consoleData.modelConfig.vendors.find(item => item.vendor_id === agentForm.model_vendor_id) || consoleData.modelConfig.vendors[0] || null
  const mcpServerNames = Object.keys(consoleData.mcpConfig.servers || {})
  const selectedMcpServer = mcpServerName === NEW_KEY ? null : consoleData.mcpConfig.servers[mcpServerName]
  const selectedToolServerName = useMemo(() => resolveMcpServerNameFromTool(selectedTool), [selectedTool])
  const standaloneTools = useMemo(
    () => tools.filter(item => item.provider_type !== 'mcp'),
    [tools],
  )
  const mcpToolGroups = useMemo(() => {
    const orderedNames: string[] = []
    const seen = new Set<string>()
    for (const name of mcpServerNames) {
      if (!name || seen.has(name)) continue
      seen.add(name)
      orderedNames.push(name)
    }
    for (const item of tools) {
      const serverName = resolveMcpServerNameFromTool(item)
      if (!serverName || seen.has(serverName)) continue
      seen.add(serverName)
      orderedNames.push(serverName)
    }
    return orderedNames.map(name => ({
      name,
      transport: consoleData.mcpConfig.servers[name]?.transport || '',
      tools: tools.filter(item => resolveMcpServerNameFromTool(item) === name),
    }))
  }, [consoleData.mcpConfig.servers, mcpServerNames, tools])
  const activeModelDraft = useMemo(() => resolveActiveModelDraft(modelDraft), [modelDraft])
  const activeAgentForChat = useMemo(() => {
    const byChatId = agents.find(item => item.agent_id === chat.agentId)
    if (byChatId) return byChatId
    if (selectedAgent?.agent_id && selectedAgent.agent_id === chat.agentId) return selectedAgent
    const draftId = String(agentForm.agent_id || '').trim()
    if (draftId && draftId === chat.agentId) {
      return {
        agent_id: draftId,
        name: agentForm.name,
        description: agentForm.description,
        agent_variables: agentForm.agent_variables,
      }
    }
    return null
  }, [agents, chat.agentId, selectedAgent, agentForm.agent_id, agentForm.name, agentForm.description, agentForm.agent_variables])
  const selectedAgentSessionOwner = String(selectedAgent?.agent_id || agentForm.agent_id || '').trim()
  const selectedAgentSessions = useMemo(
    () => selectedAgentSessionOwner ? consoleData.sessions.filter(item => item.agent_id === selectedAgentSessionOwner) : [],
    [consoleData.sessions, selectedAgentSessionOwner],
  )
  const activeAgentSessionOwner = String(activeAgentForChat?.agent_id || '').trim()
  const activeAgentSessions = useMemo(
    () => activeAgentSessionOwner ? consoleData.sessions.filter(item => item.agent_id === activeAgentSessionOwner) : [],
    [consoleData.sessions, activeAgentSessionOwner],
  )
  const selectedActiveAgentSession = useMemo(
    () => activeAgentSessions.find(item => item.id === consoleData.selectedSessionId) || null,
    [activeAgentSessions, consoleData.selectedSessionId],
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
    setVendorId(nextDraft.active_vendor || nextDraft.vendors[0]?.vendor_id || '')
    setModelProbeResult(null)
  }, [
    consoleData.modelConfig.active_model,
    consoleData.modelConfig.active_vendor,
    consoleData.modelConfig.embed_model,
    consoleData.modelConfig.vendors,
  ])

  const persistModelDraft = async (nextDraft: { api_key: string; embed_model: string; active_vendor: string; active_model: string; vendors: ModelCatalogVendor[] }) => {
    setModelDraft(nextDraft)
    const resolved = resolveActiveModelDraft(nextDraft)
    const nextVendorId = nextDraft.active_vendor || resolved.vendor?.vendor_id || ''
    const nextModelId = nextDraft.active_model || resolved.model?.model_id || ''
    await consoleData.saveModelConfig({
      api_key: nextDraft.api_key,
      embed_model: nextDraft.embed_model,
      active_vendor: nextVendorId,
      active_model: nextModelId,
      vendors: nextDraft.vendors,
      base_url: resolved.base_url || consoleData.modelConfig.base_url,
      chat_model: resolved.chat_model || consoleData.modelConfig.chat_model,
    })
  }

  useEffect(() => {
    if (!agentId && agents[0]?.agent_id) setAgentId(agents[0].agent_id)
    if (!toolName && tools[0]?.tool_name) setToolName(tools[0].tool_name)
    if (!skillName && skills[0]?.skill_name) setSkillName(skills[0].skill_name)
  }, [agentId, agents, toolName, tools, skillName, skills])

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
      setMcpProbeResult(null)
      return
    }
    setMcpServerDraft(createMcpServerDraft(mcpServerName, selectedMcpServer))
    setMcpProbeResult(null)
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
    const next = cardTemplateId === NEW_KEY
      ? createCardTemplateForm({
        template_type: 'info_detail',
        renderer_key: 'template::info_detail',
        data_schema: { type: 'object', properties: {} },
        ui_schema: {
          blocks: [
            { type: 'hero', title: '$.title', summary: '$.summary' },
            { type: 'kv_list', path: '$.fields' },
          ],
        },
        action_schema: { actions: [] },
        sample_payload: { title: '样例标题', summary: '样例摘要', fields: [] },
      })
      : createCardTemplateForm(selectedCardTemplate || undefined)
    if (!next.renderer_key) next.renderer_key = `template::${next.template_type || 'info_detail'}`
    setCardTemplateForm(next)
    setCardPlaygroundDraft({
      source_payload_text: next.sample_payload_text || '{}',
      binding_text: createDefaultCardBinding(next.template_id),
    })
    setCardPreviewCard(null)
    setCardPreviewDebug({})
    setCardPreviewActionText('')
    setCardInspectPath('')
    setCardMetaDrawerOpen(true)
  }, [cardTemplateId, selectedCardTemplate])

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

  useEffect(() => {
    if (view !== 'agent-chat') return
    const nextSessionId = activeAgentSessions.find(item => item.id === consoleData.selectedSessionId)?.id || activeAgentSessions[0]?.id || ''
    if (consoleData.selectedSessionId === nextSessionId) return
    void consoleData.selectSession(nextSessionId)
  }, [view, activeAgentSessions, consoleData.selectedSessionId, consoleData.selectSession])

  const overviewStats = useMemo<Array<{ label: string; value: string; onClick: () => void }>>(() => [
    { label: '模型', value: String(consoleData.stats.modelsReady), onClick: () => setView('models') },
    { label: '智能体', value: String(consoleData.stats.agents), onClick: () => setView('agents') },
    { label: '工具', value: String(consoleData.stats.tools), onClick: () => setView('tools') },
    { label: '技能', value: String(consoleData.stats.skills), onClick: () => setView('skills') },
    { label: '卡片', value: String(consoleData.stats.cards), onClick: () => setView('cards') },
    { label: '会话', value: String(consoleData.stats.sessions), onClick: () => setView('agents') },
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
    const targetAgent = agents.find(item => item.agent_id === id) || (String(agentForm.agent_id || '').trim() === id ? {
      agent_id: id,
      name: agentForm.name,
      description: agentForm.description,
      agent_variables: agentForm.agent_variables,
    } : null)
    chat.reset()
    chat.setAgentId(id)
    chat.setAgentVariables(buildAgentVariableValues((targetAgent?.agent_variables || []) as AgentVariableFormField[]))
    setAgentId(id)
    setView('agent-chat')
  }

  const addAgentVariable = () => {
    setAgentForm(prev => ({
      ...prev,
      agent_variables: [...prev.agent_variables, { key: '', label: '', description: '', default_value: '', required: false, inject_to_prompt: false }],
    }))
  }

  const updateAgentVariable = (index: number, patch: Partial<AgentVariableFormField>) => {
    setAgentForm(prev => {
      const current = prev.agent_variables[index]
      if (!current) return prev
      const nextVariables = prev.agent_variables.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
      let nextBindings = prev.tool_arg_bindings
      if (Object.prototype.hasOwnProperty.call(patch, 'key')) {
        const prevKey = String(current.key || '').trim()
        const nextKey = String(patch.key || '').trim()
        if (prevKey && prevKey !== nextKey) {
          nextBindings = prev.tool_arg_bindings.map(item => item.variable_key === prevKey ? { ...item, variable_key: nextKey } : item)
        }
      }
      return {
        ...prev,
        agent_variables: nextVariables,
        tool_arg_bindings: nextBindings,
      }
    })
  }

  const removeAgentVariable = (index: number) => {
    setAgentForm(prev => {
      const target = prev.agent_variables[index]
      if (!target) return prev
      const targetKey = String(target.key || '').trim()
      return {
        ...prev,
        agent_variables: prev.agent_variables.filter((_, itemIndex) => itemIndex !== index),
        tool_arg_bindings: prev.tool_arg_bindings.filter(item => item.variable_key !== targetKey),
      }
    })
  }

  const addAgentToolBinding = () => {
    setAgentForm(prev => ({
      ...prev,
      tool_arg_bindings: [...prev.tool_arg_bindings, { tool_name: '', arg_name: '', variable_key: '' }],
    }))
  }

  const updateAgentToolBinding = (index: number, patch: Partial<AgentToolArgBindingFormField>) => {
    setAgentForm(prev => ({
      ...prev,
      tool_arg_bindings: prev.tool_arg_bindings.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }))
  }

  const removeAgentToolBinding = (index: number) => {
    setAgentForm(prev => ({
      ...prev,
      tool_arg_bindings: prev.tool_arg_bindings.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const isVendorExpanded = (targetVendorId: string) => {
    if (Object.prototype.hasOwnProperty.call(modelVendorExpanded, targetVendorId)) {
      return Boolean(modelVendorExpanded[targetVendorId])
    }
    return targetVendorId === vendorId || targetVendorId === modelDraft.active_vendor
  }

  const focusVendor = (targetVendorId: string, expand = true) => {
    setVendorId(targetVendorId)
    if (expand) {
      setModelVendorExpanded(prev => ({
        ...prev,
        [targetVendorId]: true,
      }))
    }
  }

  const toggleVendorExpanded = (targetVendorId: string) => {
    setModelVendorExpanded(prev => {
      const current = Object.prototype.hasOwnProperty.call(prev, targetVendorId)
        ? Boolean(prev[targetVendorId])
        : (targetVendorId === vendorId || targetVendorId === modelDraft.active_vendor)
      return {
        ...prev,
        [targetVendorId]: !current,
      }
    })
  }

  const toggleVendorCreate = () => {
    setModelCreateVendorId('')
    setVendorCreateDraft(EMPTY_VENDOR_CREATE_DRAFT)
    setVendorCreateOpen(prev => !prev)
  }

  const toggleVendorModelCreate = (targetVendorId: string) => {
    focusVendor(targetVendorId)
    setVendorCreateOpen(false)
    setModelCreateDraft(EMPTY_MODEL_CREATE_DRAFT)
    setModelCreateVendorId(prev => prev === targetVendorId ? '' : targetVendorId)
  }

  const openVendorCreateDialog = () => {
    setVendorCreateDraft(EMPTY_VENDOR_CREATE_DRAFT)
    setVendorCreateOpen(false)
    setVendorCreateDialogOpen(true)
  }

  const openModelCreateDialog = (targetVendorId: string) => {
    focusVendor(targetVendorId)
    setModelCreateDraft(EMPTY_MODEL_CREATE_DRAFT)
    setModelCreateVendorId(targetVendorId)
    setModelCreateDialogOpen(true)
  }

  const openModelEditor = (targetVendorId: string, targetModelId = '') => {
    focusVendor(targetVendorId)
    if (targetModelId) {
      setModelDraft(prev => ({
        ...prev,
        active_vendor: targetVendorId,
        active_model: targetModelId,
      }))
    }
    setModelProbeResult(null)
    setModelEditorOpen(true)
  }

  const openToolEditor = (targetToolName: string) => {
    focusTool(targetToolName)
    setToolEditorOpen(true)
  }

  const openMcpServerDialog = (targetServerName: string) => {
    setMcpServerName(targetServerName)
    setMcpServerDialogOpen(true)
  }

  const openSkillEditor = (targetSkillName: string) => {
    setSkillName(targetSkillName)
    setSkillEditorOpen(true)
  }

  const openCardTemplateDialog = (targetTemplateId: string) => {
    setCardTemplateId(targetTemplateId)
    setCardTemplateDialogOpen(true)
  }

  const openCardBindingDialog = (targetCardId: string) => {
    setCardId(targetCardId)
    setCardBindingDialogOpen(true)
  }

  const isToolServerExpanded = (targetServerName: string) => {
    if (Object.prototype.hasOwnProperty.call(toolServerExpanded, targetServerName)) {
      return Boolean(toolServerExpanded[targetServerName])
    }
    return targetServerName === mcpServerName || targetServerName === selectedToolServerName
  }

  const focusTool = (targetToolName: string) => {
    setToolName(targetToolName)
    if (targetToolName === NEW_KEY) return
    const targetTool = tools.find(item => item.tool_name === targetToolName)
    const serverName = resolveMcpServerNameFromTool(targetTool)
    if (!serverName) return
    setMcpServerName(serverName)
    setToolServerExpanded(prev => ({
      ...prev,
      [serverName]: true,
    }))
  }

  const focusMcpServer = (targetServerName: string, expand = true) => {
    setMcpServerName(targetServerName)
    if (!expand) return
    setToolServerExpanded(prev => ({
      ...prev,
      [targetServerName]: true,
    }))
  }

  const toggleToolServerExpanded = (targetServerName: string) => {
    setToolServerExpanded(prev => {
      const current = Object.prototype.hasOwnProperty.call(prev, targetServerName)
        ? Boolean(prev[targetServerName])
        : (targetServerName === mcpServerName || targetServerName === selectedToolServerName)
      return {
        ...prev,
        [targetServerName]: !current,
      }
    })
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
    setModelVendorExpanded(prev => ({ ...prev, [vendorKey]: true }))
    setVendorCreateDraft(EMPTY_VENDOR_CREATE_DRAFT)
    setVendorCreateOpen(false)
  }

  const addVendorModel = async (targetVendorId = '') => {
    const ownerVendorId = String(targetVendorId || selectedVendor?.vendor_id || '').trim()
    if (!ownerVendorId) throw new Error('请先选择厂商')
    const ownerVendor = modelDraft.vendors.find(item => item.vendor_id === ownerVendorId) || null
    if (!ownerVendor) throw new Error('归属厂商不存在')
    const modelKey = modelCreateDraft.model_id.trim()
    if (!modelKey) throw new Error('模型 ID 不能为空')
    if (ownerVendor.models.some(item => item.model_id === modelKey)) throw new Error('模型 ID 已存在')
    updateVendor(ownerVendor.vendor_id, {
      models: [
        ...ownerVendor.models,
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
      active_vendor: prev.active_vendor || ownerVendor.vendor_id,
      active_model: prev.active_model || modelKey,
    }))
    setVendorId(ownerVendor.vendor_id)
    setModelVendorExpanded(prev => ({ ...prev, [ownerVendor.vendor_id]: true }))
    setModelCreateDraft(EMPTY_MODEL_CREATE_DRAFT)
    setModelCreateVendorId('')
  }

  const saveModelCatalog = async () => {
    await persistModelDraft(modelDraft)
  }

  const deleteVendor = async () => {
    if (!selectedVendor) throw new Error('请先选择厂商')
    const nextVendors = modelDraft.vendors.filter(item => item.vendor_id !== selectedVendor.vendor_id)
    const nextActiveVendor = modelDraft.active_vendor === selectedVendor.vendor_id ? (nextVendors[0]?.vendor_id || '') : modelDraft.active_vendor
    const nextActiveModel = nextActiveVendor ? (nextVendors.find(item => item.vendor_id === nextActiveVendor)?.models[0]?.model_id || '') : ''
    const nextDraft = {
      ...modelDraft,
      vendors: nextVendors,
      active_vendor: nextActiveVendor,
      active_model: nextActiveVendor === modelDraft.active_vendor ? modelDraft.active_model : nextActiveModel,
    }
    setVendorId(nextActiveVendor)
    setModelCreateVendorId(prev => prev === selectedVendor.vendor_id ? '' : prev)
    setModelVendorExpanded(prev => {
      const next = { ...prev }
      delete next[selectedVendor.vendor_id]
      return next
    })
    await persistModelDraft(nextDraft)
  }

  const deleteVendorModel = async (targetModelId: string) => {
    if (!selectedVendor) throw new Error('请先选择厂商')
    const nextVendors = modelDraft.vendors.map(vendor => vendor.vendor_id === selectedVendor.vendor_id
      ? { ...vendor, models: vendor.models.filter(model => model.model_id !== targetModelId) }
      : vendor)
    const currentVendor = nextVendors.find(item => item.vendor_id === selectedVendor.vendor_id) || null
    const nextDraft = {
      ...modelDraft,
      vendors: nextVendors,
      active_model: modelDraft.active_vendor === selectedVendor.vendor_id && modelDraft.active_model === targetModelId
        ? (currentVendor?.models[0]?.model_id || '')
        : modelDraft.active_model,
    }
    await persistModelDraft(nextDraft)
  }

  const probeModelSelection = async (targetVendorId: string, targetModelId: string) => {
    const vendor = modelDraft.vendors.find(item => item.vendor_id === targetVendorId) || null
    const model = vendor?.models.find(item => item.model_id === targetModelId) || null
    const result = await consoleData.testModelConfig({
      api_key: modelDraft.api_key,
      active_vendor: targetVendorId,
      active_model: targetModelId,
      base_url: vendor?.base_url || '',
      chat_model: model?.chat_model || '',
      vendors: modelDraft.vendors,
    })
    setModelProbeResult(result)
    return result
  }

  const saveMcpMeta = async () => {
    await consoleData.saveMcpConfig({
      enabled: mcpMetaDraft.enabled,
      tool_timeout_seconds: mcpMetaDraft.tool_timeout_seconds,
      servers: consoleData.mcpConfig.servers,
    })
    await consoleData.syncMcpTools()
  }

  const buildMcpServerConfig = () => {
    const existing = ((mcpServerName && mcpServerName !== NEW_KEY ? consoleData.mcpConfig.servers[mcpServerName] : undefined) || selectedMcpServer || {}) as Record<string, any>
    return {
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
  }

  const probeMcpServer = async () => {
    const targetName = mcpServerDraft.name.trim()
    if (!targetName) throw new Error('MCP 服务名不能为空')
    const result = await consoleData.testMcpServer(targetName, buildMcpServerConfig())
    setMcpProbeResult(result)
    return result
  }

  const saveMcpServer = async () => {
    const targetName = mcpServerDraft.name.trim()
    if (!targetName) throw new Error('MCP 服务名不能为空')
    const probe = await probeMcpServer()
    const currentServers = { ...consoleData.mcpConfig.servers }
    if (mcpServerName && mcpServerName !== NEW_KEY && mcpServerName !== targetName) {
      delete currentServers[mcpServerName]
    }
    currentServers[targetName] = buildMcpServerConfig()
    await consoleData.saveMcpConfig({
      enabled: mcpMetaDraft.enabled,
      tool_timeout_seconds: mcpMetaDraft.tool_timeout_seconds,
      servers: currentServers,
    })
    setMcpServerName(targetName)
    await consoleData.syncMcpTools()
    setBanner(`MCP 服务已接入，发现 ${probe.count} 个工具`)
  }

  const deleteMcpServer = async () => {
    const targetName = mcpServerName === NEW_KEY ? mcpServerDraft.name.trim() : mcpServerName
    if (!targetName) throw new Error('请先选择 MCP 服务')
    const currentServers = { ...consoleData.mcpConfig.servers }
    delete currentServers[targetName]
    await consoleData.saveMcpConfig({
      enabled: mcpMetaDraft.enabled,
      tool_timeout_seconds: mcpMetaDraft.tool_timeout_seconds,
      servers: currentServers,
    })
    setMcpServerName(Object.keys(currentServers)[0] || '')
    setMcpProbeResult(null)
    await consoleData.syncMcpTools()
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
          <div className="mb-5 flex items-center justify-between gap-3">
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
          <div className="mb-4 text-lg font-semibold text-slate-900">对话工作台</div>
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
          <div className="mb-4 text-lg font-semibold text-slate-900">卡片协议</div>
          <div className="flex flex-wrap gap-2">
            {consoleData.cardCatalog.slice(0, 10).map(item => (
              <button key={item.id} onClick={() => { setCardsMode('bindings'); openCardBindingDialog(item.id); setView('cards') }} className="rounded-full border border-slate-200 bg-[#fbfefd] px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
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
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Surface className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">厂商目录</div>
              <div className="mt-1 text-xs text-slate-500">展开厂商即可查看已登记模型，并在厂商下直接新增模型。</div>
            </div>
            <button onClick={openVendorCreateDialog} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
              <Plus size={14} />
              添加厂商
            </button>
          </div>

          {vendorCreateOpen && (
            <div className="mb-4 rounded-[24px] border border-dashed border-emerald-200 bg-emerald-50/40 p-4">
              <div className="grid gap-3">
                <Field label="厂商 ID"><Input value={vendorCreateDraft.vendor_id} onChange={e => setVendorCreateDraft(prev => ({ ...prev, vendor_id: e.target.value }))} placeholder="例如 siliconflow" /></Field>
                <Field label="显示名"><Input value={vendorCreateDraft.display_name} onChange={e => setVendorCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} placeholder="例如 轨迹流动" /></Field>
                <Field label="Base URL"><Input value={vendorCreateDraft.base_url} onChange={e => setVendorCreateDraft(prev => ({ ...prev, base_url: e.target.value }))} placeholder="https://api.example.com/v1" /></Field>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Chip active={vendorCreateDraft.enabled} onClick={() => setVendorCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
                <div className="flex items-center gap-2">
                  <button onClick={toggleVendorCreate} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">收起</button>
                  <button onClick={() => void runAction(addVendor, '厂商已加入目录')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Plus size={14} />添加厂商</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {modelDraft.vendors.map(vendor => {
              const expanded = isVendorExpanded(vendor.vendor_id)
              const selected = selectedVendor?.vendor_id === vendor.vendor_id
              const addingModel = modelCreateVendorId === vendor.vendor_id
              return (
                <div key={vendor.vendor_id} className={cx('rounded-[24px] border p-4 transition', selected ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-[#fbfefd]')}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleVendorExpanded(vendor.vendor_id)} className="mt-0.5 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600">
                      <ChevronRight size={14} className={cx('transition', expanded && 'rotate-90')} />
                    </button>
                    <button onClick={() => openModelEditor(vendor.vendor_id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-900">{vendor.display_name || vendor.vendor_id}</div>
                        {modelDraft.active_vendor === vendor.vendor_id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">默认厂商</span>}
                        {!vendor.enabled && <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] text-slate-600">已停用</span>}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">{vendor.base_url || vendor.vendor_id}</div>
                      <div className="mt-2 text-[11px] text-slate-400">{vendor.models.length} 个模型</div>
                    </button>
                    <button onClick={() => openModelCreateDialog(vendor.vendor_id)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
                      <Plus size={12} />添加模型
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="space-y-2">
                        {vendor.models.map(model => (
                          <button key={model.model_id} onClick={() => openModelEditor(vendor.vendor_id, model.model_id)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-slate-900">{model.display_name || model.model_id}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">{model.chat_model || model.model_id}</div>
                            </div>
                            <div className="ml-3 flex flex-col items-end gap-1">
                              {modelDraft.active_vendor === vendor.vendor_id && modelDraft.active_model === model.model_id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">默认模型</span>}
                              {!model.enabled && <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] text-slate-600">已停用</span>}
                            </div>
                          </button>
                        ))}
                        {!vendor.models.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">当前厂商还没有模型。</div>}
                      </div>

                      {addingModel && (
                        <div className="mt-3 rounded-[22px] border border-dashed border-emerald-200 bg-white/80 p-4">
                          <div className="grid gap-3">
                            <Field label="模型 ID"><Input value={modelCreateDraft.model_id} onChange={e => setModelCreateDraft(prev => ({ ...prev, model_id: e.target.value }))} placeholder="例如 gpt-4o-mini" /></Field>
                            <Field label="显示名"><Input value={modelCreateDraft.display_name} onChange={e => setModelCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} placeholder="用于平台展示" /></Field>
                            <Field label="Chat Model"><Input value={modelCreateDraft.chat_model} onChange={e => setModelCreateDraft(prev => ({ ...prev, chat_model: e.target.value }))} placeholder="实际请求模型名" /></Field>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <Chip active={modelCreateDraft.enabled} onClick={() => setModelCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setModelCreateVendorId('')} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">取消</button>
                              <button onClick={() => void runAction(async () => { await addVendorModel(vendor.vendor_id) }, '模型已加入厂商目录')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Plus size={14} />添加模型</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">模型管理</div>
              <div className="mt-1 text-sm text-slate-500">模型目录按厂商分组，默认厂商 / 模型会同步影响 Agent 的默认选择。</div>
            </div>
            <button onClick={() => void runAction(saveModelCatalog, '模型目录已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">厂商</div>
              <div className="mt-3 text-2xl font-semibold text-slate-900">{modelDraft.vendors.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">模型</div>
              <div className="mt-3 text-2xl font-semibold text-slate-900">{modelDraft.vendors.reduce((count, vendor) => count + vendor.models.length, 0)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">默认厂商</div>
              <div className="mt-3 truncate text-sm font-medium text-slate-700">{activeModelDraft.vendor?.display_name || '—'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">默认模型</div>
              <div className="mt-3 truncate text-sm font-medium text-slate-700">{activeModelDraft.model?.display_name || '—'}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
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
                  active_model: nextVendor?.models[0]?.model_id || '',
                }))
                if (nextVendorId) {
                  focusVendor(nextVendorId)
                }
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-900">{selectedVendor.display_name || selectedVendor.vendor_id}</div>
                  <div className="mt-1 text-sm text-slate-500">编辑厂商信息、启停状态，以及该厂商下的模型明细。</div>
                </div>
                <button onClick={() => void runAction(deleteVendor, '厂商已删除')} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} />删除厂商</button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="厂商 ID"><Input value={selectedVendor.vendor_id} disabled /></Field>
                <Field label="显示名"><Input value={selectedVendor.display_name} onChange={e => updateVendor(selectedVendor.vendor_id, { display_name: e.target.value })} /></Field>
                <Field label="Base URL"><Input value={selectedVendor.base_url} onChange={e => updateVendor(selectedVendor.vendor_id, { base_url: e.target.value })} /></Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip active={selectedVendor.enabled} onClick={() => updateVendor(selectedVendor.vendor_id, { enabled: !selectedVendor.enabled })}>厂商启用</Chip>
                <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id} onClick={() => setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: selectedVendor.models[0]?.model_id || '' }))}>设为默认厂商</Chip>
                <button onClick={() => openModelCreateDialog(selectedVendor.vendor_id)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={12} />在此厂商下添加模型</button>
              </div>

              <Surface className="border-dashed p-4">
                <div className="mb-3 text-sm font-medium text-slate-900">该厂商下的模型</div>
                <div className="space-y-3">
                  {selectedVendor.models.map(model => (
                    <div key={model.model_id} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                      <div className="mb-3 flex justify-end">
                        <button onClick={() => void runAction(async () => { await deleteVendorModel(model.model_id) }, '模型已删除')} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs text-rose-600 transition hover:bg-rose-50"><Trash2 size={12} />删除模型</button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="模型 ID"><Input value={model.model_id} disabled /></Field>
                        <Field label="显示名"><Input value={model.display_name} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { display_name: e.target.value })} /></Field>
                        <Field label="Chat Model"><Input value={model.chat_model} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { chat_model: e.target.value })} /></Field>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Chip active={model.enabled} onClick={() => updateVendorModel(selectedVendor.vendor_id, model.model_id, { enabled: !model.enabled })}>模型启用</Chip>
                        <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id && modelDraft.active_model === model.model_id} onClick={() => setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: model.model_id }))}>设为默认模型</Chip>
                        <button onClick={() => void runAction(async () => { await probeModelSelection(selectedVendor.vendor_id, model.model_id) }, '模型测试通过')} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Sparkles size={12} />测试连通性</button>
                      </div>
                    </div>
                  ))}
                  {!selectedVendor.models.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">当前厂商还没有模型，可在左侧厂商卡片下直接添加。</div>}
                </div>
              </Surface>

              {modelProbeResult && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="text-sm font-semibold text-slate-900">模型测试通过</div>
                  <div className="mt-1 text-xs text-slate-600">{modelProbeResult.vendor_id} / {modelProbeResult.model_id} · {modelProbeResult.chat_model} · {modelProbeResult.latency_ms} ms</div>
                  <div className="mt-3 text-xs leading-6 text-slate-600">返回内容：{modelProbeResult.message || '—'}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">先从左侧选择一个厂商，或直接添加新的厂商。</div>
          )}
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
            <div className="mt-1 text-sm text-slate-500">系统核心提示、技能摘要与记忆提示由平台托管，这里选择资源、编辑角色提示，并配置固定入参变量。</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void runAction(async () => { const saved = await consoleData.saveAgent(agentFormToPayload(agentForm)); setAgentId(saved.agent_id) }, '智能体已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
            <button onClick={() => void runAction(async () => {
              const targetId = agentForm.agent_id || selectedAgent?.agent_id || ''
              await consoleData.deleteAgent(targetId)
              setAgentId(agents.find(item => item.agent_id !== targetId)?.agent_id || '')
            }, '智能体已删除')} disabled={!agentForm.agent_id.trim() || Boolean(selectedAgent?.is_default)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
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

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <Surface className="p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">全局变量</div>
                <div className="mt-1 text-xs text-slate-500">用于 user_id、tenant_id 等固定入参，可注入提示词，也可在运行时绑定给工具参数。</div>
              </div>
              <button onClick={addAgentVariable} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={12} />新增变量</button>
            </div>
            <div className="space-y-3">
              {agentForm.agent_variables.map((item, index) => (
                <div key={`${item.key || 'var'}-${index}`} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="变量键"><Input value={item.key} onChange={e => updateAgentVariable(index, { key: e.target.value })} placeholder="例如 user_id" /></Field>
                    <Field label="显示名"><Input value={item.label} onChange={e => updateAgentVariable(index, { label: e.target.value })} placeholder="例如 用户ID" /></Field>
                    <Field label="默认值"><Input value={item.default_value} onChange={e => updateAgentVariable(index, { default_value: e.target.value })} placeholder="可选" /></Field>
                    <Field label="说明"><Input value={item.description} onChange={e => updateAgentVariable(index, { description: e.target.value })} placeholder="用于下单、查询等固定参数" /></Field>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Chip active={item.required} onClick={() => updateAgentVariable(index, { required: !item.required })}>必填</Chip>
                    <Chip active={item.inject_to_prompt} onClick={() => updateAgentVariable(index, { inject_to_prompt: !item.inject_to_prompt })}>注入提示词</Chip>
                    <button onClick={() => removeAgentVariable(index)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs text-rose-600 transition hover:bg-rose-50"><Trash2 size={12} />删除变量</button>
                  </div>
                </div>
              ))}
              {!agentForm.agent_variables.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">当前还没有固定变量。新增后可在对话页填写，并绑定给工具的固定入参。</div>}
            </div>
          </Surface>

          <Surface className="p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">工具参数绑定</div>
                <div className="mt-1 text-xs text-slate-500">绑定后，该参数会从模型可见 schema 中移除，并在执行时由系统自动覆盖，不能让大模型填写。</div>
              </div>
              <button onClick={addAgentToolBinding} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={12} />新增绑定</button>
            </div>
            <div className="space-y-3">
              {agentForm.tool_arg_bindings.map((item, index) => {
                const targetTool = tools.find(tool => tool.tool_name === item.tool_name) || null
                const argOptions = getToolInputArgNames(targetTool)
                const hasArgOptions = argOptions.length > 0
                return (
                  <div key={`${item.tool_name || 'binding'}-${index}`} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="工具">
                        <Select value={item.tool_name} onChange={e => updateAgentToolBinding(index, { tool_name: e.target.value, arg_name: '' })}>
                          <option value="">选择工具</option>
                          {tools.map(tool => <option key={tool.tool_name} value={tool.tool_name}>{tool.display_name || tool.tool_name}</option>)}
                        </Select>
                      </Field>
                      <Field label="参数">
                        {hasArgOptions ? (
                          <Select value={item.arg_name} onChange={e => updateAgentToolBinding(index, { arg_name: e.target.value })}>
                            <option value="">选择参数</option>
                            {argOptions.map(argName => <option key={argName} value={argName}>{argName}</option>)}
                            {item.arg_name && !argOptions.includes(item.arg_name) && <option value={item.arg_name}>{item.arg_name}</option>}
                          </Select>
                        ) : (
                          <Input value={item.arg_name} onChange={e => updateAgentToolBinding(index, { arg_name: e.target.value })} placeholder="例如 user_id" />
                        )}
                      </Field>
                      <Field label="绑定变量">
                        <Select value={item.variable_key} onChange={e => updateAgentToolBinding(index, { variable_key: e.target.value })}>
                          <option value="">选择变量</option>
                          {agentForm.agent_variables.map(variable => <option key={variable.key || `${index}-${variable.label}`} value={variable.key}>{variable.label || variable.key || '未命名变量'}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        {item.tool_name && item.arg_name && item.variable_key
                          ? `当前绑定：${item.tool_name}.${item.arg_name} <- ${item.variable_key}`
                          : '选择工具参数和变量后，系统会在执行前自动填入并覆盖该参数。'}
                      </div>
                      <button onClick={() => removeAgentToolBinding(index)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs text-rose-600 transition hover:bg-rose-50"><Trash2 size={12} />移除绑定</button>
                    </div>
                  </div>
                )
              })}
              {!agentForm.tool_arg_bindings.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">当前还没有参数绑定。适合把 user_id 这类固定入参绑定给下单、查询工具。</div>}
            </div>
          </Surface>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {agentFlags.map(flag => (
            <Chip key={flag.key} active={flag.value} onClick={() => setAgentForm(prev => ({ ...prev, [flag.key]: !prev[flag.key] }))}>{flag.label}</Chip>
          ))}
        </div>

        <Surface className="mt-5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-900">对话记录</div>
              <div className="mt-1 text-xs text-slate-500">该智能体的历史记录已收拢到对话页查看。进入对话后，可按会话切换并查看消息明细。</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{selectedAgentSessions.length} 条会话</div>
              <button onClick={() => openAgentChat(agentForm.agent_id || selectedAgent?.agent_id || '')} disabled={!(agentForm.agent_id || selectedAgent?.agent_id)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800 disabled:opacity-40"><SendHorizontal size={14} />进入对话查看</button>
            </div>
          </div>
        </Surface>
      </Surface>
    </div>
  )

  const renderTools = () => (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Surface className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">工具与 MCP</div>
              <div className="mt-1 text-xs text-slate-500">直接查看所有工具；MCP 服务可折叠展开，查看其下工具。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => openToolEditor(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />协议工具</button>
              <button onClick={() => openMcpServerDialog(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增 MCP</button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">工具</div>
              <div className="space-y-2">
                <button onClick={() => openToolEditor(NEW_KEY)} className={cx('w-full rounded-2xl border px-4 py-3 text-left transition', toolName === NEW_KEY ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-100 hover:bg-emerald-50/40')}>
                  <div className="text-sm font-medium text-slate-900">新增协议工具</div>
                  <div className="mt-1 text-xs text-slate-500">手动登记协议接入工具</div>
                </button>
                {standaloneTools.map(item => (
                  <button key={item.tool_name} onClick={() => openToolEditor(item.tool_name)} className={cx('w-full rounded-2xl border px-4 py-3 text-left transition', toolName === item.tool_name ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-100 hover:bg-emerald-50/40')}>
                    <div className="text-sm font-medium text-slate-900">{item.display_name || item.tool_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.provider_type || 'protocol'} · {item.summary || item.source_ref || '未填写摘要'}</div>
                  </button>
                ))}
                {!standaloneTools.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">当前没有独立登记的工具。</div>}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">MCP</div>
              <div className="space-y-3">
                <button onClick={() => openMcpServerDialog(NEW_KEY)} className={cx('w-full rounded-2xl border px-4 py-3 text-left transition', mcpServerName === NEW_KEY ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-100 hover:bg-emerald-50/40')}>
                  <div className="text-sm font-medium text-slate-900">新增 MCP 服务</div>
                  <div className="mt-1 text-xs text-slate-500">配置地址 / 命令并测试后接入</div>
                </button>
                {mcpToolGroups.map(group => {
                  const expanded = isToolServerExpanded(group.name)
                  return (
                    <div key={group.name} className={cx('rounded-[24px] border p-4 transition', mcpServerName === group.name ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-[#fbfefd]')}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleToolServerExpanded(group.name)} className="mt-0.5 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600">
                          <ChevronRight size={14} className={cx('transition', expanded && 'rotate-90')} />
                        </button>
                        <button onClick={() => openMcpServerDialog(group.name)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-slate-900">{group.name}</div>
                            {group.transport && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{group.transport}</span>}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{group.tools.length} 个工具</div>
                        </button>
                      </div>

                      {expanded && (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <div className="space-y-2">
                            {group.tools.map(item => (
                              <button key={item.tool_name} onClick={() => openToolEditor(item.tool_name)} className={cx('flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition', toolName === item.tool_name ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white hover:border-emerald-100 hover:bg-emerald-50/40')}>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900">{item.display_name || item.tool_name}</div>
                                  <div className="mt-1 truncate text-xs text-slate-500">{item.summary || item.tool_name}</div>
                                </div>
                                <div className="ml-3 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{item.scope}</span>
                                  {item.supports_card && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] text-emerald-700">card</span>}
                                </div>
                              </button>
                            ))}
                            {!group.tools.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">当前服务还没有同步出工具。</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!mcpToolGroups.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">当前没有 MCP 服务。</div>}
              </div>
            </div>
          </div>
        </Surface>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void runAction(async () => { await consoleData.syncLocalTools() }, '本地工具已同步')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />同步本地工具</button>
            <button onClick={() => void runAction(async () => { await consoleData.syncMcpTools() }, 'MCP 工具已同步')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />同步 MCP 工具</button>
          </div>

          <Surface className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900">{toolName === NEW_KEY ? '新增协议工具' : toolForm.display_name || toolForm.tool_name || '工具配置'}</div>
                <div className="mt-1 text-sm text-slate-500">工具信息优先来自本地/MCP 同步；手动页只维护协议接入与启停状态。</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void runAction(async () => { const saved = await consoleData.saveTool(toolFormToPayload(toolForm)); setToolName(saved.tool_name) }, '工具已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                <button onClick={() => void runAction(async () => {
                  const targetName = toolForm.tool_name || selectedTool?.tool_name || ''
                  await consoleData.deleteTool(targetName)
                  setToolName(tools.find(item => item.tool_name !== targetName)?.tool_name || '')
                }, '工具已删除')} disabled={!toolForm.tool_name.trim() || toolName === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
              </div>
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

          <Surface className="p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">MCP 接入</div>
                <div className="mt-1 text-sm text-slate-500">直接填写协议地址或命令，先测试，测试通过后再接入平台并同步工具。</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => void runAction(async () => { await probeMcpServer() }, 'MCP 测试通过')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Sparkles size={14} />测试连接</button>
                <button onClick={() => void runAction(saveMcpServer, 'MCP 服务配置已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />测试并接入</button>
                <button onClick={() => void runAction(deleteMcpServer, 'MCP 服务已删除')} disabled={!mcpServerName || mcpServerName === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除服务</button>
              </div>
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
              {mcpServerDraft.transport === 'stdio' ? (
                <>
                  <Field label="Command"><Input value={mcpServerDraft.command} onChange={e => setMcpServerDraft(prev => ({ ...prev, command: e.target.value }))} /></Field>
                  <Field label="CWD"><Input value={mcpServerDraft.cwd} onChange={e => setMcpServerDraft(prev => ({ ...prev, cwd: e.target.value }))} /></Field>
                </>
              ) : (
                <div className="md:col-span-2"><Field label="URL"><Input value={mcpServerDraft.url} onChange={e => setMcpServerDraft(prev => ({ ...prev, url: e.target.value }))} placeholder="例如 http://127.0.0.1:9100/sse" /></Field></div>
              )}
              <Field label="Scope">
                <Select value={mcpServerDraft.scope} onChange={e => setMcpServerDraft(prev => ({ ...prev, scope: e.target.value }))}>
                  <option value="global">global</option>
                  <option value="skill">skill</option>
                </Select>
              </Field>
              <Field label="启用状态">
                <Select value={mcpServerDraft.enabled ? 'true' : 'false'} onChange={e => setMcpServerDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
                  <option value="true">启用</option>
                  <option value="false">关闭</option>
                </Select>
              </Field>
            </div>

            <details className="mt-4 rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">高级选项</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Tool Name Prefix"><Input value={mcpServerDraft.tool_name_prefix} onChange={e => setMcpServerDraft(prev => ({ ...prev, tool_name_prefix: e.target.value }))} /></Field>
                <Field label="Args"><Area rows={5} value={mcpServerDraft.args_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, args_text: e.target.value }))} /></Field>
                <Field label="Include Tools"><Area rows={5} value={mcpServerDraft.include_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, include_tools_text: e.target.value }))} /></Field>
                <Field label="Exclude Tools"><Area rows={5} value={mcpServerDraft.exclude_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, exclude_tools_text: e.target.value }))} /></Field>
              </div>
            </details>

            {mcpProbeResult && (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">测试通过</div>
                    <div className="mt-1 text-xs text-slate-600">{mcpProbeResult.server_name} · {mcpProbeResult.transport} · 发现 {mcpProbeResult.count} 个工具</div>
                  </div>
                  <div className="text-xs text-slate-500">{mcpProbeResult.server_info?.name || 'MCP Server'}</div>
                </div>
                {mcpProbeResult.instructions && <div className="mt-3 text-xs leading-6 text-slate-600">{mcpProbeResult.instructions}</div>}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {mcpProbeResult.tools.map(item => (
                    <div key={item.public_name} className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{item.title || item.raw_name || item.public_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.public_name}</div>
                      <div className="mt-2 text-xs leading-5 text-slate-600">{item.description || '—'}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">{item.scope}</span>
                        {item.supports_card && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] text-emerald-700">card {item.card_type || 'enabled'}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </div>
  )

  const renderSkills = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ResourceList title="技能" items={skills} selectedKey={skillName} onSelect={openSkillEditor} onNew={() => openSkillEditor(NEW_KEY)} getKey={item => item.skill_name} getTitle={item => item.display_name || item.skill_name} getMeta={item => item.summary} newLabel="新增技能" />
      <Surface className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">{skillName === NEW_KEY ? '新建技能' : skillForm.display_name || skillForm.skill_name || '技能配置'}</div>
            <div className="mt-1 text-sm text-slate-500">技能只维护名称、摘要、绑定工具和完整正文，摘要会直接进入系统提示。</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void runAction(async () => { const saved = await consoleData.saveSkill(skillFormToPayload(skillForm)); setSkillName(saved.skill_name) }, '技能已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
            <button onClick={() => void runAction(async () => {
              const targetName = skillForm.skill_name || selectedSkill?.skill_name || ''
              await consoleData.deleteSkill(targetName)
              setSkillName(skills.find(item => item.skill_name !== targetName)?.skill_name || '')
            }, '技能已删除')} disabled={!skillForm.skill_name.trim() || skillName === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
          </div>
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
    <div className="space-y-5">
      <Surface className="p-4">
        <div className="flex flex-wrap gap-2">
          <Chip active={cardsMode === 'templates'} onClick={() => setCardsMode('templates')}>模板库</Chip>
          <Chip active={cardsMode === 'bindings'} onClick={() => setCardsMode('bindings')}>绑定协议</Chip>
        </div>
      </Surface>

      {cardsMode === 'templates' ? (
        <div className="space-y-5">
          <Surface className="p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">卡片预览</div>
                <div className="mt-1 text-sm text-slate-500">先看卡片，再点进元数据。悬停预览字段时，右侧 JSON 会高亮对应参数。</div>
              </div>
              <button onClick={() => openCardTemplateDialog(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增模板</button>
            </div>
            {cardTemplateGallery.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cardTemplateGallery.map(item => {
                  const active = cardTemplateId === item.template.template_id
                  return (
                    <button key={item.template.template_id} onClick={() => openCardTemplateDialog(item.template.template_id)} className={cx('overflow-hidden rounded-[26px] border p-3 text-left transition', active ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-200 hover:bg-emerald-50/30')}>
                      <div className="mb-2 flex items-center justify-between gap-3 px-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{item.template.display_name || item.template.template_id}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.template.template_type} · {item.template.summary || item.template.template_id}</div>
                        </div>
                      </div>
                      <CardRenderer card={item.previewCard} />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">当前还没有卡片模板，点击右上角新建。</div>
            )}
          </Surface>

          {cardTemplateId && !cardTemplateDialogOpen && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-5">
                <Surface className="p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">{cardTemplateId === NEW_KEY ? '新建卡片模板' : cardTemplateForm.display_name || cardTemplateForm.template_id || '卡片模板'}</div>
                      <div className="mt-1 text-sm text-slate-500">模板描述渲染结构、数据 Schema 和动作协议，保存后可直接给工具复用。</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => void runAction(async () => {
                        const saved = await consoleData.saveCardTemplate(cardTemplateFormToPayload(cardTemplateForm))
                        setCardTemplateId(saved.template_id)
                      }, '卡片模板已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存模板</button>
                      <button onClick={() => void runAction(async () => {
                        const targetId = cardTemplateForm.template_id || selectedCardTemplate?.template_id || ''
                        await consoleData.deleteCardTemplate(targetId)
                        setCardTemplateId('')
                      }, '卡片模板已删除')} disabled={!cardTemplateForm.template_id.trim() || cardTemplateId === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="模板 ID"><Input value={cardTemplateForm.template_id} onChange={e => setCardTemplateForm(prev => ({ ...prev, template_id: e.target.value }))} /></Field>
                    <Field label="启用状态">
                      <Select value={cardTemplateForm.enabled ? 'true' : 'false'} onChange={e => setCardTemplateForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
                        <option value="true">启用</option>
                        <option value="false">关闭</option>
                      </Select>
                    </Field>
                    <Field label="展示名"><Input value={cardTemplateForm.display_name} onChange={e => setCardTemplateForm(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
                    <Field label="模板类型"><Input value={cardTemplateForm.template_type} onChange={e => setCardTemplateForm(prev => ({ ...prev, template_type: e.target.value }))} /></Field>
                    <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={cardTemplateForm.summary} onChange={e => setCardTemplateForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                    <div className="md:col-span-2"><Field label="Renderer Key"><Input value={cardTemplateForm.renderer_key} onChange={e => setCardTemplateForm(prev => ({ ...prev, renderer_key: e.target.value }))} /></Field></div>
                    <Field label="Data Schema"><Area rows={10} value={cardTemplateForm.data_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, data_schema_text: e.target.value }))} /></Field>
                    <Field label="UI Schema"><Area rows={10} value={cardTemplateForm.ui_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, ui_schema_text: e.target.value }))} /></Field>
                    <Field label="动作 Schema"><Area rows={10} value={cardTemplateForm.action_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, action_schema_text: e.target.value }))} /></Field>
                    <Field label="样例 Payload"><Area rows={10} value={cardTemplateForm.sample_payload_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, sample_payload_text: e.target.value }))} /></Field>
                  </div>
                </Surface>

                <Surface className="p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">Card Playground</div>
                      <div className="mt-1 text-sm text-slate-500">继续用来源 JSON + 绑定配置验证最终渲染结果。</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setCardPlaygroundDraft(prev => ({ ...prev, source_payload_text: cardTemplateForm.sample_payload_text || '{}' }))} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">载入样例</button>
                      <button onClick={() => setCardPlaygroundDraft(prev => ({ ...prev, binding_text: createDefaultCardBinding(cardTemplateForm.template_id) }))} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">重置绑定</button>
                      <button onClick={() => void runAction(async () => {
                        const template = cardTemplateFormToPayload(cardTemplateForm)
                        const sourcePayload = parseJsonText(cardPlaygroundDraft.source_payload_text, {}, '来源 Payload')
                        const binding = parseJsonText(cardPlaygroundDraft.binding_text, {}, '绑定配置')
                        const result = await consoleData.previewCard({ template, source_payload: sourcePayload, binding })
                        setCardPreviewCard(result.card || null)
                        setCardPreviewDebug(result.debug || {})
                        setCardPreviewActionText('')
                      }, '卡片预览已更新')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Sparkles size={14} />生成预览</button>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <Field label="来源 Payload JSON"><Area rows={16} value={cardPlaygroundDraft.source_payload_text} onChange={e => setCardPlaygroundDraft(prev => ({ ...prev, source_payload_text: e.target.value }))} /></Field>
                    <Field label="绑定 JSON"><Area rows={16} value={cardPlaygroundDraft.binding_text} onChange={e => setCardPlaygroundDraft(prev => ({ ...prev, binding_text: e.target.value }))} /></Field>
                  </div>
                </Surface>
              </div>

              <div className={cx('grid gap-5 xl:items-start', cardMetaDrawerOpen ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : 'xl:grid-cols-[minmax(0,1fr)]')}>
                <div className="space-y-5">
                  <Surface className="p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">模板预览</div>
                        <div className="mt-1 text-sm text-slate-500">悬停字段时，样例 JSON 会同步高亮；元数据侧栏默认展开在右侧。</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setCardMetaDrawerOpen(prev => !prev)} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">{cardMetaDrawerOpen ? '收起元数据侧栏' : '展开元数据侧栏'}</button>
                        <div className="text-xs text-slate-500">{cardInspectPath || '尚未悬停字段'}</div>
                      </div>
                    </div>
                    <CardRenderer card={selectedTemplatePreviewCard} onInspectPath={setCardInspectPath} />
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium text-slate-900">样例 JSON</div>
                      {renderHighlightedJson(selectedTemplatePreviewPayload, cardInspectPath)}
                    </div>
                  </Surface>

                  <Surface className="p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">预览结果</div>
                        <div className="mt-1 text-sm text-slate-500">卡片结果保持在当前区域，JSON / 调试信息放到右侧元数据栏。</div>
                      </div>
                    </div>
                    {cardPreviewCard ? (
                      <CardRenderer card={cardPreviewCard} onAction={input => setCardPreviewActionText(formatJson(resolveChatActionInput(input)))} />
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-[#fbfefd] px-4 py-8 text-center text-sm text-slate-500">生成预览后，这里会显示最终卡片。</div>
                    )}
                  </Surface>
                </div>

                {cardMetaDrawerOpen && (
                  <Surface className="p-6 xl:sticky xl:top-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">预览元数据</div>
                        <div className="mt-1 text-sm text-slate-500">模板附加信息、预览 JSON、调试信息和动作验证统一放在侧边栏。</div>
                      </div>
                      <button onClick={() => setCardMetaDrawerOpen(false)} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">收起</button>
                    </div>
                    <div className="grid gap-4">
                      <Field label="附加信息"><Area rows={8} value={cardTemplateForm.metadata_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, metadata_text: e.target.value }))} /></Field>
                      <Field label="预览 Card JSON"><Area rows={14} readOnly value={formatJson(cardPreviewCard || {})} /></Field>
                      <Field label="调试信息"><Area rows={8} readOnly value={formatJson(cardPreviewDebug || {})} /></Field>
                      <Field label="动作验证结果"><Area rows={8} readOnly value={cardPreviewActionText || '点击预览卡片里的动作按钮后，这里会显示最终发送内容。'} /></Field>
                    </div>
                  </Surface>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <ResourceList title="卡片协议" items={consoleData.cardCatalog} selectedKey={cardId} onSelect={openCardBindingDialog} getKey={item => item.id} getTitle={item => item.card_type} getMeta={item => `${item.source_kind} · ${item.source_name}`} />
          {selectedCard && !cardBindingDialogOpen ? (
            <Surface className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-900">{selectedCard.card_type}</div>
                {selectedCard.source_kind === 'tool' ? (
                  <button onClick={() => { setToolName(selectedCard.source_name); setView('tools') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去工具配置</button>
                ) : (
                  <button onClick={() => { setSkillName(selectedCard.source_name); setView('skills') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去技能配置</button>
                )}
              </div>

              {cardTemplates.length > 0 && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-500">
                  可用模板：{cardTemplates.map(item => item.display_name || item.template_id).join('、')}
                </div>
              )}

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
            <Surface className="p-6 text-sm text-slate-500">点击左侧卡片协议，可在弹窗中查看详情。</Surface>
          )}
        </div>
      )}
    </div>
  )

  const renderAgentChat = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ChatWorkspace
        agent={activeAgentForChat ? { agent_id: activeAgentForChat.agent_id, name: activeAgentForChat.name, description: activeAgentForChat.description, agent_variables: activeAgentForChat.agent_variables || [] } : null}
        chat={chat}
        modelReady={consoleData.modelConfig.has_api_key}
        quickActions={profile.ui.quick_actions}
        onBack={() => setView('agents')}
      />
      <div className="space-y-5">
        <Surface className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">历史会话</div>
              <div className="mt-1 text-xs text-slate-500">{activeAgentSessionOwner ? '仅展示当前智能体的对话记录。' : '先从智能体详情进入对话，再查看该智能体的历史记录。'}</div>
            </div>
            <button onClick={() => void consoleData.refreshSessions()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">刷新</button>
          </div>
          <div className="space-y-2">
            {activeAgentSessions.map(item => (
              <button key={item.id} onClick={() => { void consoleData.selectSession(item.id) }} className={cx('w-full rounded-2xl border px-4 py-3 text-left transition', consoleData.selectedSessionId === item.id ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-100 hover:bg-emerald-50/40')}>
                <div className="text-sm font-medium text-slate-900">{item.title || item.id}</div>
                <div className="mt-1 text-xs text-slate-500">{formatTime(item.updated_at || item.created_at)}</div>
              </button>
            ))}
            {!activeAgentSessions.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                {activeAgentSessionOwner ? '当前智能体还没有会话记录。' : '先选择一个智能体并进入对话，这里才会展示它的历史记录。'}
              </div>
            )}
          </div>
        </Surface>

        <Surface className="p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold text-slate-900">{selectedActiveAgentSession?.title || '会话消息'}</div>
            <div className="mt-1 text-xs text-slate-500">{selectedActiveAgentSession ? `${selectedActiveAgentSession.agent_id || 'default'} · ${formatTime(selectedActiveAgentSession.updated_at || selectedActiveAgentSession.created_at)}` : '从左侧选择一条会话后查看消息内容。'}</div>
          </div>
          <div className="max-h-[52vh] space-y-3 overflow-auto pr-1">
            {consoleData.sessionMessagesLoading && (
              <div className="rounded-2xl border border-slate-200 px-4 py-5 text-sm text-slate-500">正在读取会话消息…</div>
            )}
            {!consoleData.sessionMessagesLoading && !selectedActiveAgentSession && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">请选择一条当前智能体的会话记录。</div>
            )}
            {!consoleData.sessionMessagesLoading && selectedActiveAgentSession && !consoleData.sessionMessages.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">该会话暂无可展示的消息。</div>
            )}
            {!consoleData.sessionMessagesLoading && selectedActiveAgentSession && consoleData.sessionMessages.map(item => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{item.role} · {item.agent || 'default'} · {item.model || '—'}</span>
                  <span>{formatTime(item.created_at)}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {item.parts.map((part, index) => (
                    <div key={`${item.id}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-600">{part.type}</div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{part.content || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )

  const modelCreateOwner = modelDraft.vendors.find(item => item.vendor_id === modelCreateVendorId) || selectedVendor
  const selectedTemplateCard = cardTemplateGallery.find(item => item.template.template_id === cardTemplateId)?.previewCard || selectedTemplatePreviewCard

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
          {view === 'agent-chat' && renderAgentChat()}

          <Modal open={vendorCreateDialogOpen} onClose={() => setVendorCreateDialogOpen(false)} title="新增厂商" description="先登记厂商，再补模型。" widthClass="max-w-2xl">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="厂商 ID"><Input value={vendorCreateDraft.vendor_id} onChange={e => setVendorCreateDraft(prev => ({ ...prev, vendor_id: e.target.value }))} placeholder="例如 siliconflow" /></Field>
              <Field label="显示名"><Input value={vendorCreateDraft.display_name} onChange={e => setVendorCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} placeholder="例如 轨迹流动" /></Field>
              <div className="md:col-span-2"><Field label="Base URL"><Input value={vendorCreateDraft.base_url} onChange={e => setVendorCreateDraft(prev => ({ ...prev, base_url: e.target.value }))} placeholder="https://api.example.com/v1" /></Field></div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Chip active={vendorCreateDraft.enabled} onClick={() => setVendorCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
              <div className="flex items-center gap-2">
                <button onClick={() => setVendorCreateDialogOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">取消</button>
                <button onClick={() => void runAction(async () => { await addVendor(); setVendorCreateDialogOpen(false) }, '厂商已加入目录')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Plus size={14} />添加厂商</button>
              </div>
            </div>
          </Modal>

          <Modal open={modelCreateDialogOpen} onClose={() => setModelCreateDialogOpen(false)} title="新增模型" description={`归属厂商：${modelCreateOwner?.display_name || modelCreateOwner?.vendor_id || '未选择'}`} widthClass="max-w-2xl">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="模型 ID"><Input value={modelCreateDraft.model_id} onChange={e => setModelCreateDraft(prev => ({ ...prev, model_id: e.target.value }))} placeholder="例如 gpt-4o-mini" /></Field>
              <Field label="显示名"><Input value={modelCreateDraft.display_name} onChange={e => setModelCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} placeholder="用于平台展示" /></Field>
              <div className="md:col-span-2"><Field label="Chat Model"><Input value={modelCreateDraft.chat_model} onChange={e => setModelCreateDraft(prev => ({ ...prev, chat_model: e.target.value }))} placeholder="实际请求模型名" /></Field></div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Chip active={modelCreateDraft.enabled} onClick={() => setModelCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
              <div className="flex items-center gap-2">
                <button onClick={() => setModelCreateDialogOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">取消</button>
                <button onClick={() => void runAction(async () => { await addVendorModel(modelCreateVendorId); setModelCreateDialogOpen(false) }, '模型已加入厂商目录')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Plus size={14} />添加模型</button>
              </div>
            </div>
          </Modal>

          <Modal open={modelEditorOpen && Boolean(selectedVendor)} onClose={() => setModelEditorOpen(false)} title={selectedVendor?.display_name || selectedVendor?.vendor_id || '模型编辑'} description="在弹窗里编辑厂商与模型，并直接测试模型连通性。" widthClass="max-w-6xl">
            {selectedVendor && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="API Key"><Input value={modelDraft.api_key} onChange={e => setModelDraft(prev => ({ ...prev, api_key: e.target.value }))} placeholder={consoleData.modelConfig.has_api_key ? '已配置，留空保持不变' : '输入 API Key'} /></Field>
                  <Field label="Embedding Model"><Input value={modelDraft.embed_model} onChange={e => setModelDraft(prev => ({ ...prev, embed_model: e.target.value }))} /></Field>
                  <Field label="默认厂商">
                    <Select value={modelDraft.active_vendor} onChange={e => {
                      const nextVendorId = e.target.value
                      const nextVendor = modelDraft.vendors.find(item => item.vendor_id === nextVendorId)
                      setModelDraft(prev => ({ ...prev, active_vendor: nextVendorId, active_model: nextVendor?.models[0]?.model_id || '' }))
                      if (nextVendorId) focusVendor(nextVendorId)
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

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip active={selectedVendor.enabled} onClick={() => updateVendor(selectedVendor.vendor_id, { enabled: !selectedVendor.enabled })}>厂商启用</Chip>
                    <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id} onClick={() => setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: selectedVendor.models[0]?.model_id || '' }))}>设为默认厂商</Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openModelCreateDialog(selectedVendor.vendor_id)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />添加模型</button>
                    <button onClick={() => void runAction(saveModelCatalog, '模型目录已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                    <button onClick={() => void runAction(deleteVendor, '厂商已删除')} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} />删除厂商</button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="厂商 ID"><Input value={selectedVendor.vendor_id} disabled /></Field>
                  <Field label="显示名"><Input value={selectedVendor.display_name} onChange={e => updateVendor(selectedVendor.vendor_id, { display_name: e.target.value })} /></Field>
                  <Field label="Base URL"><Input value={selectedVendor.base_url} onChange={e => updateVendor(selectedVendor.vendor_id, { base_url: e.target.value })} /></Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {selectedVendor.models.map(model => (
                    <div key={model.model_id} className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{model.display_name || model.model_id}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{model.model_id}</div>
                        </div>
                        <button onClick={() => void runAction(async () => { await deleteVendorModel(model.model_id) }, '模型已删除')} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs text-rose-600 transition hover:bg-rose-50"><Trash2 size={12} />删除</button>
                      </div>
                      <div className="grid gap-3">
                        <Field label="显示名"><Input value={model.display_name} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { display_name: e.target.value })} /></Field>
                        <Field label="Chat Model"><Input value={model.chat_model} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { chat_model: e.target.value })} /></Field>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Chip active={model.enabled} onClick={() => updateVendorModel(selectedVendor.vendor_id, model.model_id, { enabled: !model.enabled })}>模型启用</Chip>
                        <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id && modelDraft.active_model === model.model_id} onClick={() => setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: model.model_id }))}>设为默认模型</Chip>
                        <button onClick={() => void runAction(async () => { await probeModelSelection(selectedVendor.vendor_id, model.model_id) }, '模型测试通过')} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">测试连接</button>
                      </div>
                    </div>
                  ))}
                  {!selectedVendor.models.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">当前厂商还没有模型，先添加一个再测试。</div>}
                </div>

                {modelProbeResult && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="text-sm font-semibold text-slate-900">模型测试通过</div>
                    <div className="mt-1 text-xs text-slate-600">{modelProbeResult.vendor_id} / {modelProbeResult.model_id} · {modelProbeResult.chat_model} · {modelProbeResult.latency_ms} ms</div>
                    <div className="mt-3 text-xs leading-6 text-slate-600">返回内容：{modelProbeResult.message || '—'}</div>
                  </div>
                )}
              </div>
            )}
          </Modal>

          <Modal open={toolEditorOpen} onClose={() => setToolEditorOpen(false)} title={toolName === NEW_KEY ? '新增协议工具' : toolForm.display_name || toolForm.tool_name || '工具编辑'} description="在弹窗中维护协议工具定义与启停状态。" widthClass="max-w-4xl">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">工具信息优先来自同步；这里主要维护协议接入字段。</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void runAction(async () => { const saved = await consoleData.saveTool(toolFormToPayload(toolForm)); setToolName(saved.tool_name); setToolEditorOpen(false) }, '工具已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                  <button onClick={() => void runAction(async () => {
                    const targetName = toolForm.tool_name || selectedTool?.tool_name || ''
                    await consoleData.deleteTool(targetName)
                    setToolName(tools.find(item => item.tool_name !== targetName)?.tool_name || '')
                    setToolEditorOpen(false)
                  }, '工具已删除')} disabled={!toolForm.tool_name.trim() || toolName === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="工具名"><Input value={toolForm.tool_name} onChange={e => setToolForm(prev => ({ ...prev, tool_name: e.target.value }))} /></Field>
                <Field label="显示名"><Input value={toolForm.display_name} onChange={e => setToolForm(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
                <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={toolForm.summary} onChange={e => setToolForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                <Field label="接入类型"><Select value={toolForm.provider_type} onChange={e => setToolForm(prev => ({ ...prev, provider_type: e.target.value }))}><option value="protocol">protocol</option><option value="local">local</option><option value="mcp">mcp</option></Select></Field>
                <Field label="作用域"><Select value={toolForm.scope} onChange={e => setToolForm(prev => ({ ...prev, scope: e.target.value }))}><option value="global">global</option><option value="skill">skill</option></Select></Field>
                <div className="md:col-span-2"><Field label="来源 / Source Ref"><Input value={toolForm.source_ref} onChange={e => setToolForm(prev => ({ ...prev, source_ref: e.target.value }))} /></Field></div>
                <div className="md:col-span-2"><Field label="协议参数 JSON"><Area rows={8} value={toolForm.transport_config_text} onChange={e => setToolForm(prev => ({ ...prev, transport_config_text: e.target.value }))} /></Field></div>
                {toolForm.supports_card && <Field label="Card Type"><Input value={toolForm.card_type} onChange={e => setToolForm(prev => ({ ...prev, card_type: e.target.value }))} /></Field>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip active={toolForm.enabled} onClick={() => setToolForm(prev => ({ ...prev, enabled: !prev.enabled }))}>启用</Chip>
                <Chip active={toolForm.supports_card} onClick={() => setToolForm(prev => ({ ...prev, supports_card: !prev.supports_card }))}>卡片支持</Chip>
              </div>
              {selectedTool && (
                <div className="grid gap-4 md:grid-cols-2">
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
            </div>
          </Modal>

          <Modal open={mcpServerDialogOpen} onClose={() => setMcpServerDialogOpen(false)} title={mcpServerName === NEW_KEY ? '新增 MCP 服务' : mcpServerDraft.name || 'MCP 接入'} description="填写命令或 URL，先测试，再接入平台。" widthClass="max-w-4xl">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="MCP 启用"><Select value={mcpMetaDraft.enabled ? 'true' : 'false'} onChange={e => setMcpMetaDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
                <Field label="工具超时秒数"><Input type="number" value={String(mcpMetaDraft.tool_timeout_seconds)} onChange={e => setMcpMetaDraft(prev => ({ ...prev, tool_timeout_seconds: Number(e.target.value || 0) }))} /></Field>
                <Field label="服务名"><Input value={mcpServerDraft.name} onChange={e => setMcpServerDraft(prev => ({ ...prev, name: e.target.value }))} /></Field>
                <Field label="Transport"><Select value={mcpServerDraft.transport} onChange={e => setMcpServerDraft(prev => ({ ...prev, transport: e.target.value }))}><option value="stdio">stdio</option><option value="sse">sse</option><option value="http">http</option><option value="ws">websocket</option></Select></Field>
                {mcpServerDraft.transport === 'stdio' ? (
                  <>
                    <Field label="Command"><Input value={mcpServerDraft.command} onChange={e => setMcpServerDraft(prev => ({ ...prev, command: e.target.value }))} /></Field>
                    <Field label="CWD"><Input value={mcpServerDraft.cwd} onChange={e => setMcpServerDraft(prev => ({ ...prev, cwd: e.target.value }))} /></Field>
                  </>
                ) : (
                  <div className="md:col-span-2"><Field label="URL"><Input value={mcpServerDraft.url} onChange={e => setMcpServerDraft(prev => ({ ...prev, url: e.target.value }))} placeholder="例如 http://127.0.0.1:9100/mcp 或 /sse" /></Field></div>
                )}
                <Field label="Scope"><Select value={mcpServerDraft.scope} onChange={e => setMcpServerDraft(prev => ({ ...prev, scope: e.target.value }))}><option value="global">global</option><option value="skill">skill</option></Select></Field>
                <Field label="启用状态"><Select value={mcpServerDraft.enabled ? 'true' : 'false'} onChange={e => setMcpServerDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
              </div>
              <details className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">高级选项</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Tool Name Prefix"><Input value={mcpServerDraft.tool_name_prefix} onChange={e => setMcpServerDraft(prev => ({ ...prev, tool_name_prefix: e.target.value }))} /></Field>
                  <Field label="Args"><Area rows={5} value={mcpServerDraft.args_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, args_text: e.target.value }))} /></Field>
                  <Field label="Include Tools"><Area rows={5} value={mcpServerDraft.include_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, include_tools_text: e.target.value }))} /></Field>
                  <Field label="Exclude Tools"><Area rows={5} value={mcpServerDraft.exclude_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, exclude_tools_text: e.target.value }))} /></Field>
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">保存服务时会同时带上当前 MCP 全局开关与超时设置。</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void runAction(async () => { await probeMcpServer() }, 'MCP 测试通过')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Sparkles size={14} />测试连接</button>
                  <button onClick={() => void runAction(async () => { await saveMcpServer(); setMcpServerDialogOpen(false) }, 'MCP 服务配置已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />测试并接入</button>
                  <button onClick={() => void runAction(async () => { await deleteMcpServer(); setMcpServerDialogOpen(false) }, 'MCP 服务已删除')} disabled={!mcpServerName || mcpServerName === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                </div>
              </div>
              {mcpProbeResult && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">测试通过</div>
                      <div className="mt-1 text-xs text-slate-600">{mcpProbeResult.server_name} · {mcpProbeResult.transport} · 发现 {mcpProbeResult.count} 个工具</div>
                    </div>
                    <div className="text-xs text-slate-500">{mcpProbeResult.server_info?.name || 'MCP Server'}</div>
                  </div>
                </div>
              )}
            </div>
          </Modal>

          <Modal open={skillEditorOpen} onClose={() => setSkillEditorOpen(false)} title={skillName === NEW_KEY ? '新建技能' : skillForm.display_name || skillForm.skill_name || '技能配置'} description="在弹窗中维护技能摘要、正文与绑定工具。" widthClass="max-w-4xl">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-500">技能摘要会直接注入系统提示，正文按需加载。</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void runAction(async () => { const saved = await consoleData.saveSkill(skillFormToPayload(skillForm)); setSkillName(saved.skill_name); setSkillEditorOpen(false) }, '技能已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                  <button onClick={() => void runAction(async () => {
                    const targetName = skillForm.skill_name || selectedSkill?.skill_name || ''
                    await consoleData.deleteSkill(targetName)
                    setSkillName(skills.find(item => item.skill_name !== targetName)?.skill_name || '')
                    setSkillEditorOpen(false)
                  }, '技能已删除')} disabled={!skillForm.skill_name.trim() || skillName === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="技能名"><Input value={skillForm.skill_name} onChange={e => setSkillForm(prev => ({ ...prev, skill_name: e.target.value }))} /></Field>
                <Field label="启用状态"><Select value={skillForm.enabled ? 'true' : 'false'} onChange={e => setSkillForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
                <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={skillForm.summary} onChange={e => setSkillForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                <div className="md:col-span-2"><Field label="正文 Markdown"><Area rows={12} value={skillForm.document_md} onChange={e => setSkillForm(prev => ({ ...prev, document_md: e.target.value }))} /></Field></div>
              </div>
              <div>
                <div className="mb-3 text-sm font-medium text-slate-900">绑定工具</div>
                <div className="flex flex-wrap gap-2">
                  {tools.map(item => (
                    <Chip key={item.tool_name} active={skillForm.tool_names.includes(item.tool_name)} onClick={() => setSkillForm(prev => ({ ...prev, tool_names: toggleName(prev.tool_names, item.tool_name) }))}>
                      {item.display_name || item.tool_name}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </Modal>

          <Modal open={cardTemplateDialogOpen && Boolean(cardTemplateId)} onClose={() => setCardTemplateDialogOpen(false)} title={cardTemplateId === NEW_KEY ? '新建卡片模板' : selectedCardTemplate?.display_name || selectedCardTemplate?.template_id || '卡片模板'} description={cardTemplateId === NEW_KEY ? '在弹窗中创建模板并实时预览。' : selectedCardTemplate?.summary || '卡片模板预览与编辑'} widthClass="max-w-5xl">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">模板描述渲染结构、数据 Schema 和动作协议，保存后可直接给工具复用。</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void runAction(async () => {
                    const saved = await consoleData.saveCardTemplate(cardTemplateFormToPayload(cardTemplateForm))
                    setCardTemplateId(saved.template_id)
                  }, '卡片模板已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存模板</button>
                  <button onClick={() => void runAction(async () => {
                    const targetId = cardTemplateForm.template_id || selectedCardTemplate?.template_id || ''
                    await consoleData.deleteCardTemplate(targetId)
                    setCardTemplateId('')
                    setCardTemplateDialogOpen(false)
                  }, '卡片模板已删除')} disabled={!cardTemplateForm.template_id.trim() || cardTemplateId === NEW_KEY} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="模板 ID"><Input value={cardTemplateForm.template_id} onChange={e => setCardTemplateForm(prev => ({ ...prev, template_id: e.target.value }))} /></Field>
                  <Field label="启用状态">
                    <Select value={cardTemplateForm.enabled ? 'true' : 'false'} onChange={e => setCardTemplateForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
                      <option value="true">启用</option>
                      <option value="false">关闭</option>
                    </Select>
                  </Field>
                  <Field label="展示名"><Input value={cardTemplateForm.display_name} onChange={e => setCardTemplateForm(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
                  <Field label="模板类型"><Input value={cardTemplateForm.template_type} onChange={e => setCardTemplateForm(prev => ({ ...prev, template_type: e.target.value }))} /></Field>
                  <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={cardTemplateForm.summary} onChange={e => setCardTemplateForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                  <div className="md:col-span-2"><Field label="Renderer Key"><Input value={cardTemplateForm.renderer_key} onChange={e => setCardTemplateForm(prev => ({ ...prev, renderer_key: e.target.value }))} /></Field></div>
                  <Field label="Data Schema"><Area rows={10} value={cardTemplateForm.data_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, data_schema_text: e.target.value }))} /></Field>
                  <Field label="UI Schema"><Area rows={10} value={cardTemplateForm.ui_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, ui_schema_text: e.target.value }))} /></Field>
                  <Field label="动作 Schema"><Area rows={10} value={cardTemplateForm.action_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, action_schema_text: e.target.value }))} /></Field>
                  <Field label="样例 Payload"><Area rows={10} value={cardTemplateForm.sample_payload_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, sample_payload_text: e.target.value }))} /></Field>
                  <div className="md:col-span-2"><Field label="附加信息"><Area rows={8} value={cardTemplateForm.metadata_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, metadata_text: e.target.value }))} /></Field></div>
                </div>

                <div className="space-y-4">
                  <Surface className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-900">模板预览</div>
                      <div className="text-xs text-slate-500">实时跟随表单内容</div>
                    </div>
                    <CardRenderer card={selectedTemplateCard} onInspectPath={setCardInspectPath} />
                  </Surface>
                  <Surface className="p-5">
                    <div className="mb-3 text-sm font-medium text-slate-900">样例 JSON</div>
                    {renderHighlightedJson(selectedTemplatePreviewPayload, cardInspectPath)}
                  </Surface>
                </div>
              </div>
            </div>
          </Modal>

          <Modal open={cardBindingDialogOpen && Boolean(selectedCard)} onClose={() => setCardBindingDialogOpen(false)} title={selectedCard?.card_type || '卡片协议'} description={selectedCard ? `${selectedCard.source_kind} · ${selectedCard.source_name}` : '卡片协议详情'} widthClass="max-w-3xl">
            {selectedCard && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">通过工具或技能的输出协议映射到卡片模板，可直接在这里修改并保存。</div>
                  {selectedCard.source_kind === 'tool' ? (
                    <button onClick={() => { setCardBindingDialogOpen(false); openToolEditor(selectedCard.source_name); setView('tools') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去工具配置</button>
                  ) : (
                    <button onClick={() => { setCardBindingDialogOpen(false); openSkillEditor(selectedCard.source_name); setView('skills') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">去技能配置</button>
                  )}
                </div>
                {cardTemplates.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-500">
                    可用模板：{cardTemplates.map(item => item.display_name || item.template_id).join('、')}
                  </div>
                )}
                {selectedCard.source_kind === 'tool' ? (
                  <div className="grid gap-4">
                    <Field label="摘要"><Area rows={3} value={cardToolDraft.summary} onChange={e => setCardToolDraft(prev => ({ ...prev, summary: e.target.value }))} /></Field>
                    <Field label="Card Type"><Input value={cardToolDraft.card_type} onChange={e => setCardToolDraft(prev => ({ ...prev, card_type: e.target.value }))} /></Field>
                    <Field label="卡片绑定 JSON"><Area rows={14} value={cardToolDraft.card_binding_text} onChange={e => setCardToolDraft(prev => ({ ...prev, card_binding_text: e.target.value }))} /></Field>
                    <div>
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
                        setCardBindingDialogOpen(false)
                      }, '卡片协议已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存卡片配置</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <Field label="摘要"><Area rows={3} value={cardSkillDraft.summary} onChange={e => setCardSkillDraft(prev => ({ ...prev, summary: e.target.value }))} /></Field>
                    <Field label="卡片类型"><Area rows={10} value={cardSkillDraft.card_types_text} onChange={e => setCardSkillDraft(prev => ({ ...prev, card_types_text: e.target.value }))} /></Field>
                    <div>
                      <button onClick={() => void runAction(async () => {
                        const base = skills.find(item => item.skill_name === selectedCard.source_name)
                        if (!base) throw new Error('来源技能不存在')
                        const saved = await consoleData.saveSkill({
                          ...base,
                          summary: cardSkillDraft.summary.trim(),
                          card_types: cardSkillDraft.card_types_text.split(/[\n,]/g).map(item => item.trim()).filter(Boolean),
                        })
                        setCardId(`skill:${saved.skill_name}:${saved.card_types[0] || selectedCard.card_type}`)
                        setCardBindingDialogOpen(false)
                      }, '卡片协议已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存卡片配置</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  )
}
