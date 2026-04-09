import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FrameworkInfo } from './useFrameworkProfile'

export interface ModelCatalogModel {
  model_id: string
  display_name: string
  chat_model: string
  enabled: boolean
  input_cost_per_mtokens: number | null
  output_cost_per_mtokens: number | null
  max_context_tokens: number | null
}

export interface ModelCatalogVendor {
  vendor_id: string
  vendor_type: string
  display_name: string
  base_url: string
  enabled: boolean
  models: ModelCatalogModel[]
}

export interface ModelVendorPreset {
  vendor_type: string
  vendor_id: string
  display_name: string
  base_url: string
}

export interface ModelConfig {
  provider: string
  has_api_key: boolean
  base_url: string
  chat_model: string
  embed_model: string
  active_vendor: string
  active_model: string
  vendors: ModelCatalogVendor[]
  database_url: string
}

export interface UsageCounter {
  total_calls: number
  completed_calls: number
  error_calls: number
  pending_calls: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  input_estimated_cost: number
  output_estimated_cost: number
  estimated_cost: number
  avg_latency_ms: number
  success_rate: number
  last_called_at: number
  unique_sessions: number
}

export interface UsageTrendPoint extends UsageCounter {
  date: string
  label: string
}

export interface ModelUsageStats extends UsageCounter {
  model_id: string
  display_name: string
  chat_model: string
  enabled: boolean
  configured: boolean
  input_cost_per_mtokens: number | null
  output_cost_per_mtokens: number | null
}

export interface VendorUsageStats extends UsageCounter {
  vendor_id: string
  display_name: string
  base_url: string
  enabled: boolean
  configured: boolean
  models: ModelUsageStats[]
}

export interface FrameworkUsageStats {
  generated_at: number
  summary: UsageCounter & { window_days: number }
  trend: UsageTrendPoint[]
  vendors: VendorUsageStats[]
}

export interface McpServerConfig {
  enabled: boolean
  transport: string
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  url: string
  headers: Record<string, string>
  timeout_seconds: number
  sse_read_timeout_seconds: number
  tool_timeout_seconds: number
  scope: string
  tool_name_prefix: string
  include_tools: string[]
  exclude_tools: string[]
  risk_level: string
  confirm_policy: string
}

export interface McpConfig {
  enabled: boolean
  tool_timeout_seconds: number
  servers: Record<string, McpServerConfig>
}

export interface SessionRecord {
  id: string
  title: string
  created_at: number
  updated_at: number
  agent_id: string
}

export interface SessionMessagePart {
  type: string
  content: string
  metadata?: Record<string, any> | null
}

export interface SessionMessageRecord {
  id: string
  role: string
  agent: string
  model: string
  created_at: number
  parts: SessionMessagePart[]
}

export interface CardCatalogItem {
  id: string
  card_type: string
  source_kind: 'tool' | 'skill'
  source_name: string
  summary: string
  binding: string
}

export interface CardPreviewResult {
  card: Record<string, any>
  debug: Record<string, any>
}

export interface SkillGenerateRequest {
  skill_name: string
  display_name?: string
  tool_names: string[]
  model_vendor_id: string
  model_id: string
  current_summary?: string
  current_document_md?: string
}

export interface SkillGenerateStreamEvent {
  type: string
  content?: string
  text?: string
  summary?: string
  document_md?: string
  vendor_id?: string
  model_id?: string
  skill_name?: string
  tool_count?: number
  context?: string
}

export interface AgentApiKeyRecord {
  key_id: string
  agent_id: string
  name: string
  key_prefix: string
  enabled: boolean
  last_used_at: number
  created_at: number
  updated_at: number
}

export interface AgentApiKeyCreateResult {
  key: string
  record: AgentApiKeyRecord
}

export interface AgentApiDocsVariableRecord {
  key: string
  label: string
  description: string
  default_value: string
  required: boolean
}

export interface AgentApiDocsRecord {
  agent_id: string
  agent_name: string
  docs_url: string
  openapi_url: string
  invoke_url: string
  method: string
  auth: {
    type: string
    header: string
    bearer_supported: boolean
  }
  required_agent_variables: AgentApiDocsVariableRecord[]
  sample_request: Record<string, any>
  curl_example: string
}

export interface McpProbeToolRecord {
  public_name: string
  raw_name: string
  title: string
  description: string
  input_schema: Record<string, any>
  output_schema: Record<string, any>
  scope: string
  icons: Array<Record<string, any>>
  meta_keys: string[]
  supports_card: boolean
  card_type: string
}

export interface McpProbeResult {
  ok: boolean
  server_name: string
  transport: string
  server_info: Record<string, any>
  instructions: string
  count: number
  tools: McpProbeToolRecord[]
}

export interface ModelProbeResult {
  ok: boolean
  vendor_id: string
  model_id: string
  base_url: string
  chat_model: string
  latency_ms: number
  message: string
  usage: Record<string, any>
}

type AgentRecord = FrameworkInfo['agents'][number]
type ToolRecord = FrameworkInfo['tools'][number]
type SkillRecord = FrameworkInfo['skills'][number]
type CardCollectionRecord = FrameworkInfo['card_collections'][number]
type CardTemplateRecord = FrameworkInfo['card_templates'][number]

export const MODEL_VENDOR_TYPE_OPTIONS: ModelVendorPreset[] = [
  {
    vendor_type: 'siliconflow',
    vendor_id: 'siliconflow',
    display_name: '硅基流动',
    base_url: 'https://api.siliconflow.cn/v1',
  },
  {
    vendor_type: 'openai_completion',
    vendor_id: 'openai_completion',
    display_name: 'OpenAI Completion',
    base_url: 'https://api.openai.com/v1',
  },
  {
    vendor_type: 'aliyun_bailian',
    vendor_id: 'aliyun_bailian',
    display_name: '阿里云百炼',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    vendor_type: 'deepseek',
    vendor_id: 'deepseek',
    display_name: 'DeepSeek',
    base_url: 'https://api.deepseek.com',
  },
]

const MODEL_VENDOR_PRESET_MAP = new Map(MODEL_VENDOR_TYPE_OPTIONS.map(item => [item.vendor_type, item]))

const DEFAULT_MODEL_VENDORS: ModelCatalogVendor[] = [
  {
    vendor_id: 'siliconflow',
    vendor_type: 'siliconflow',
    display_name: '硅基流动',
    base_url: 'https://api.siliconflow.cn/v1',
    enabled: true,
    models: [
      {
        model_id: 'Qwen/Qwen3.5-27B',
        display_name: 'Qwen/Qwen3.5-27B',
        chat_model: 'Qwen/Qwen3.5-27B',
        enabled: true,
        input_cost_per_mtokens: null,
        output_cost_per_mtokens: null,
        max_context_tokens: null,
      },
    ],
  },
  {
    vendor_id: 'openai_completion',
    vendor_type: 'openai_completion',
    display_name: 'OpenAI Completion',
    base_url: 'https://api.openai.com/v1',
    enabled: true,
    models: [
      {
        model_id: 'gpt-4o-mini',
        display_name: 'gpt-4o-mini',
        chat_model: 'gpt-4o-mini',
        enabled: true,
        input_cost_per_mtokens: null,
        output_cost_per_mtokens: null,
        max_context_tokens: null,
      },
    ],
  },
]

export function getModelVendorPreset(vendorTypeOrId: unknown) {
  const normalizedType = normalizeVendorType(vendorTypeOrId)
  return MODEL_VENDOR_PRESET_MAP.get(normalizedType) || MODEL_VENDOR_PRESET_MAP.get(normalizeVendorId(vendorTypeOrId)) || null
}

function cloneVendor(vendor: ModelCatalogVendor): ModelCatalogVendor {
  return {
    ...vendor,
    models: (vendor.models || []).map(model => ({ ...model })),
  }
}

function normalizeVendorType(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  if (!text || text === 'default') return 'siliconflow'
  if (text === 'openai_comletion') return 'openai_completion'
  if (text === 'aliyun' || text === 'dashscope' || text === 'qwen') return 'aliyun_bailian'
  return text
}

function normalizeVendorId(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'default' ? 'siliconflow' : text
}

function normalizeVendorDisplayName(vendorId: string, vendorType: string, displayName: unknown) {
  const text = String(displayName || '').trim()
  const preset = getModelVendorPreset(vendorType || vendorId)
  if (!text || text === '默认厂商' || text === 'default' || text === vendorId || (vendorId === 'siliconflow' && text === '轨迹流动')) {
    return preset?.display_name || vendorId
  }
  return text || preset?.display_name || vendorId
}

function normalizeVendorBaseUrl(vendorType: string, vendorId: string, baseUrl: unknown) {
  const text = String(baseUrl || '').trim()
  if (text) return text
  return getModelVendorPreset(vendorType || vendorId)?.base_url || ''
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function normalizeOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return null
  return Math.round(next)
}

function createEmptyUsageCounter(): UsageCounter {
  return {
    total_calls: 0,
    completed_calls: 0,
    error_calls: 0,
    pending_calls: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_tokens: 0,
    input_estimated_cost: 0,
    output_estimated_cost: 0,
    estimated_cost: 0,
    avg_latency_ms: 0,
    success_rate: 0,
    last_called_at: 0,
    unique_sessions: 0,
  }
}

function normalizeUsageCounter(raw?: Partial<UsageCounter> | null): UsageCounter {
  const defaults = createEmptyUsageCounter()
  return {
    total_calls: Number(raw?.total_calls || defaults.total_calls),
    completed_calls: Number(raw?.completed_calls || defaults.completed_calls),
    error_calls: Number(raw?.error_calls || defaults.error_calls),
    pending_calls: Number(raw?.pending_calls || defaults.pending_calls),
    total_input_tokens: Number(raw?.total_input_tokens || defaults.total_input_tokens),
    total_output_tokens: Number(raw?.total_output_tokens || defaults.total_output_tokens),
    total_tokens: Number(raw?.total_tokens || defaults.total_tokens),
    input_estimated_cost: Number(raw?.input_estimated_cost || defaults.input_estimated_cost),
    output_estimated_cost: Number(raw?.output_estimated_cost || defaults.output_estimated_cost),
    estimated_cost: Number(raw?.estimated_cost || defaults.estimated_cost),
    avg_latency_ms: Number(raw?.avg_latency_ms || defaults.avg_latency_ms),
    success_rate: Number(raw?.success_rate || defaults.success_rate),
    last_called_at: Number(raw?.last_called_at || defaults.last_called_at),
    unique_sessions: Number(raw?.unique_sessions || defaults.unique_sessions),
  }
}

function normalizeUsageStats(raw?: Partial<FrameworkUsageStats> | null): FrameworkUsageStats {
  const summaryCounter = normalizeUsageCounter(raw?.summary)
  return {
    generated_at: Number(raw?.generated_at || 0),
    summary: {
      ...summaryCounter,
      window_days: Number((raw?.summary as Record<string, any> | undefined)?.window_days || 7),
    },
    trend: Array.isArray(raw?.trend)
      ? raw!.trend.map(item => ({
        ...normalizeUsageCounter(item),
        date: String(item?.date || ''),
        label: String(item?.label || ''),
      }))
      : [],
    vendors: Array.isArray(raw?.vendors)
      ? raw!.vendors.map(vendor => ({
        ...normalizeUsageCounter(vendor),
        vendor_id: String(vendor?.vendor_id || '').trim(),
        display_name: String(vendor?.display_name || vendor?.vendor_id || '').trim(),
        base_url: String(vendor?.base_url || '').trim(),
        enabled: vendor?.enabled !== false,
        configured: vendor?.configured !== false,
        models: Array.isArray(vendor?.models)
          ? vendor.models.map(model => ({
            ...normalizeUsageCounter(model),
            model_id: String(model?.model_id || '').trim(),
            display_name: String(model?.display_name || model?.model_id || '').trim(),
            chat_model: String(model?.chat_model || model?.model_id || '').trim(),
            enabled: model?.enabled !== false,
            configured: model?.configured !== false,
            input_cost_per_mtokens: normalizeOptionalNumber(model?.input_cost_per_mtokens),
            output_cost_per_mtokens: normalizeOptionalNumber(model?.output_cost_per_mtokens),
          }))
          : [],
      }))
      : [],
  }
}

function mergeVendorModels(baseModels: ModelCatalogModel[], incomingModels: ModelCatalogModel[]) {
  const merged = new Map(baseModels.map(model => [model.model_id, { ...model }]))
  incomingModels.forEach(model => {
    if (!model.model_id) return
    const existing = merged.get(model.model_id)
    merged.set(model.model_id, existing ? { ...existing, ...model } : { ...model })
  })
  return Array.from(merged.values())
}

function normalizeModelConfig(raw?: Partial<ModelConfig> | null): ModelConfig {
  const defaults: ModelConfig = {
    provider: 'openai_compatible',
    has_api_key: false,
    base_url: 'https://api.siliconflow.cn/v1',
    chat_model: 'Qwen/Qwen3.5-27B',
    embed_model: 'BAAI/bge-m3',
    active_vendor: 'siliconflow',
    active_model: 'Qwen/Qwen3.5-27B',
    vendors: DEFAULT_MODEL_VENDORS.map(cloneVendor),
    database_url: 'sqlite+aiosqlite:///./csagent.db',
  }

  const vendorMap = new Map(defaults.vendors.map(vendor => [vendor.vendor_id, cloneVendor(vendor)]))
  for (const item of Array.isArray(raw?.vendors) ? raw?.vendors || [] : []) {
    const vendorId = normalizeVendorId(item?.vendor_id || item?.vendor_type)
    const vendorType = normalizeVendorType(item?.vendor_type || vendorId)
    if (!vendorId) continue
    const nextVendor: ModelCatalogVendor = {
      vendor_id: vendorId,
      vendor_type: vendorType || vendorId,
      display_name: normalizeVendorDisplayName(vendorId, vendorType, item?.display_name),
      base_url: normalizeVendorBaseUrl(vendorType, vendorId, item?.base_url),
      enabled: item?.enabled !== false,
      models: Array.isArray(item?.models)
        ? item.models
          .map(model => {
            const modelId = String(model?.model_id || '').trim()
            if (!modelId) return null
            return {
              model_id: modelId,
              display_name: String(model?.display_name || '').trim() || modelId,
              chat_model: String(model?.chat_model || '').trim() || modelId,
              enabled: model?.enabled !== false,
              input_cost_per_mtokens: normalizeOptionalNumber(model?.input_cost_per_mtokens),
              output_cost_per_mtokens: normalizeOptionalNumber(model?.output_cost_per_mtokens),
              max_context_tokens: normalizeOptionalInteger(model?.max_context_tokens),
            }
          })
          .filter((model): model is ModelCatalogModel => Boolean(model))
        : [],
    }
    const existing = vendorMap.get(vendorId)
    if (!existing) {
      vendorMap.set(vendorId, nextVendor)
      continue
    }
    vendorMap.set(vendorId, {
      ...existing,
      ...nextVendor,
      display_name: nextVendor.display_name || existing.display_name,
      base_url: nextVendor.base_url || existing.base_url,
      models: mergeVendorModels(existing.models || [], nextVendor.models || []),
    })
  }

  const vendors = Array.from(vendorMap.values())
  const requestedVendorId = normalizeVendorId(raw?.active_vendor)
  const activeVendor = vendors.some(vendor => vendor.vendor_id === requestedVendorId)
    ? requestedVendorId
    : (vendors.find(vendor => vendor.enabled)?.vendor_id || vendors[0]?.vendor_id || defaults.active_vendor)
  const selectedVendor = vendors.find(vendor => vendor.vendor_id === activeVendor) || vendors[0] || null
  const requestedModelId = String(raw?.active_model || '').trim()
  const activeModel = selectedVendor?.models.some(model => model.model_id === requestedModelId)
    ? requestedModelId
    : (selectedVendor?.models.find(model => model.enabled)?.model_id || selectedVendor?.models[0]?.model_id || '')
  const selectedModel = selectedVendor?.models.find(model => model.model_id === activeModel) || selectedVendor?.models[0] || null

  return {
    provider: String(raw?.provider || defaults.provider),
    has_api_key: Boolean(raw?.has_api_key),
    base_url: String(raw?.base_url || selectedVendor?.base_url || defaults.base_url),
    chat_model: String(raw?.chat_model || selectedModel?.chat_model || defaults.chat_model),
    embed_model: String(raw?.embed_model || defaults.embed_model),
    active_vendor: activeVendor,
    active_model: activeModel,
    vendors,
    database_url: String(raw?.database_url || defaults.database_url),
  }
}

const DEFAULT_MODEL_CONFIG: ModelConfig = normalizeModelConfig()

const DEFAULT_USAGE_STATS: FrameworkUsageStats = normalizeUsageStats()

const DEFAULT_MCP_CONFIG: McpConfig = {
  enabled: false,
  tool_timeout_seconds: 60,
  servers: {},
}

const EMPTY_INFO: FrameworkInfo = {
  tools: [],
  skills: [],
  agents: [],
  card_collections: [],
  card_templates: [],
}

const LEGACY_ADMIN_HIDDEN_TOOL_NAMES = new Set(['load_skill', 'load_skills', 'list_skills', 'list_tools'])

function upsertByKey<T extends Record<string, any>>(items: T[], key: string, record: T) {
  const target = String(record?.[key] ?? '').trim()
  if (!target) return items
  const index = items.findIndex(item => String(item?.[key] ?? '').trim() === target)
  if (index < 0) return [record, ...items]
  const next = [...items]
  next[index] = record
  return next
}

function removeByKey<T extends Record<string, any>>(items: T[], key: string, target: string) {
  const normalized = String(target || '').trim()
  if (!normalized) return items
  return items.filter(item => String(item?.[key] ?? '').trim() !== normalized)
}

function isAdminVisibleTool(tool: ToolRecord) {
  const metadata = tool?.metadata || {}
  const toolName = String(tool?.tool_name || '').trim()
  if (metadata?.admin_hidden === true) return false
  if (metadata?.internal === true) return false
  if (LEGACY_ADMIN_HIDDEN_TOOL_NAMES.has(toolName)) return false
  return true
}

export function usePlatformConsole(info: FrameworkInfo | null) {
  const [registryInfo, setRegistryInfo] = useState<FrameworkInfo>(info || EMPTY_INFO)
  const [registryRefreshing, setRegistryRefreshing] = useState(false)
  const [registryError, setRegistryError] = useState('')
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG)
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState('')
  const [usageStats, setUsageStats] = useState<FrameworkUsageStats>(DEFAULT_USAGE_STATS)
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState('')
  const [mcpConfig, setMcpConfig] = useState<McpConfig>(DEFAULT_MCP_CONFIG)
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpSaving, setMcpSaving] = useState(false)
  const [mcpError, setMcpError] = useState('')

  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [sessionMessages, setSessionMessages] = useState<SessionMessageRecord[]>([])
  const [sessionMessagesLoading, setSessionMessagesLoading] = useState(false)
  const selectedSessionIdRef = useRef('')

  useEffect(() => {
    setRegistryInfo(info || EMPTY_INFO)
  }, [info])

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId
  }, [selectedSessionId])

  const refreshRegistry = useCallback(async () => {
    setRegistryRefreshing(true)
    setRegistryError('')
    try {
      const resp = await fetch('/api/platform/snapshot')
      if (!resp.ok) throw new Error('读取平台注册中心失败')
      const data = await resp.json()
      setRegistryInfo({ ...EMPTY_INFO, ...data })
    } catch (err: any) {
      setRegistryError(err?.message || '读取平台注册中心失败')
    } finally {
      setRegistryRefreshing(false)
    }
  }, [])

  const testModelConfig = useCallback(async (payload: {
    api_key?: string
    base_url?: string
    chat_model?: string
    active_vendor?: string
    active_model?: string
    vendors?: ModelCatalogVendor[]
  }) => {
    const resp = await fetch('/api/framework/model-config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      let message = '模型测试失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as ModelProbeResult
  }, [])

  const saveAgent = useCallback(async (payload: AgentRecord) => {
    const agentId = String(payload?.agent_id || '').trim()
    if (!agentId) throw new Error('智能体 ID 不能为空')
    const exists = registryInfo.agents.some(item => item.agent_id === agentId)
    const resp = await fetch(exists ? `/api/platform/agents/${encodeURIComponent(agentId)}` : '/api/platform/agents', {
      method: exists ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error('保存智能体失败')
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      agents: upsertByKey(prev.agents, 'agent_id', data),
    }))
    return data as AgentRecord
  }, [registryInfo.agents])

  const deleteAgent = useCallback(async (agentId: string) => {
    const id = String(agentId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    const resp = await fetch(`/api/platform/agents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      const message = await resp.text()
      throw new Error(message || '删除智能体失败')
    }
    setRegistryInfo(prev => ({
      ...prev,
      agents: removeByKey(prev.agents, 'agent_id', id),
    }))
  }, [])

  const publishAgent = useCallback(async (agentId: string) => {
    const id = String(agentId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    const resp = await fetch(`/api/platform/agents/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    })
    if (!resp.ok) throw new Error('发布智能体失败')
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      agents: upsertByKey(prev.agents, 'agent_id', data),
    }))
    return data as AgentRecord
  }, [])

  const getAgentApiDocs = useCallback(async (agentId: string) => {
    const id = String(agentId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    const resp = await fetch(`/api/platform/agents/${encodeURIComponent(id)}/api-docs`)
    if (!resp.ok) {
      let message = '读取智能体 API 文档失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as AgentApiDocsRecord
  }, [])

  const listAgentApiKeys = useCallback(async (agentId: string) => {
    const id = String(agentId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    const resp = await fetch(`/api/platform/agents/${encodeURIComponent(id)}/api-keys`)
    if (!resp.ok) {
      let message = '读取智能体 API Key 失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as AgentApiKeyRecord[]
  }, [])

  const createAgentApiKey = useCallback(async (agentId: string, name: string) => {
    const id = String(agentId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    const resp = await fetch(`/api/platform/agents/${encodeURIComponent(id)}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: String(name || '').trim() }),
    })
    if (!resp.ok) {
      let message = '创建智能体 API Key 失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as AgentApiKeyCreateResult
  }, [])

  const deleteAgentApiKey = useCallback(async (agentId: string, keyId: string) => {
    const id = String(agentId || '').trim()
    const targetKeyId = String(keyId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    if (!targetKeyId) throw new Error('Key ID 不能为空')
    const resp = await fetch(`/api/platform/agents/${encodeURIComponent(id)}/api-keys/${encodeURIComponent(targetKeyId)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      let message = '删除智能体 API Key 失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as { ok: boolean; key_id: string; agent_id: string }
  }, [])

  const saveTool = useCallback(async (payload: ToolRecord) => {
    const toolName = String(payload?.tool_name || '').trim()
    if (!toolName) throw new Error('工具名称不能为空')
    const exists = registryInfo.tools.some(item => item.tool_name === toolName)
    const resp = await fetch(exists ? `/api/platform/tools/${encodeURIComponent(toolName)}` : '/api/platform/tools', {
      method: exists ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error('保存工具失败')
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      tools: upsertByKey(prev.tools, 'tool_name', data),
    }))
    return data as ToolRecord
  }, [registryInfo.tools])

  const deleteTool = useCallback(async (toolName: string) => {
    const name = String(toolName || '').trim()
    if (!name) throw new Error('工具名称不能为空')
    const resp = await fetch(`/api/platform/tools/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      const message = await resp.text()
      throw new Error(message || '删除工具失败')
    }
    setRegistryInfo(prev => ({
      ...prev,
      tools: removeByKey(prev.tools, 'tool_name', name),
      skills: prev.skills.map(skill => ({
        ...skill,
        tool_names: (skill.tool_names || []).filter(item => item !== name),
        global_tool_names: (skill.global_tool_names || []).filter(item => item !== name),
      })),
      agents: prev.agents.map(agent => ({
        ...agent,
        global_tool_names: (agent.global_tool_names || []).filter(item => item !== name),
      })),
    }))
  }, [])

  const syncLocalTools = useCallback(async () => {
    const resp = await fetch('/api/platform/tools/sync/local', {
      method: 'POST',
    })
    if (!resp.ok) throw new Error('同步本地工具失败')
    await refreshRegistry()
    return await resp.json()
  }, [refreshRegistry])

  const saveSkill = useCallback(async (payload: SkillRecord, originalSkillName = '') => {
    const skillName = String(payload?.skill_name || '').trim()
    const previousSkillName = String(originalSkillName || '').trim()
    if (!skillName) throw new Error('技能名称不能为空')
    const updateKey = previousSkillName || skillName
    const exists = registryInfo.skills.some(item => item.skill_name === updateKey)
    const resp = await fetch(exists ? `/api/platform/skills/${encodeURIComponent(updateKey)}` : '/api/platform/skills', {
      method: exists ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      let message = '保存技能失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      skills: upsertByKey(removeByKey(prev.skills, 'skill_name', updateKey), 'skill_name', data),
      agents: prev.agents.map(agent => ({
        ...agent,
        skill_names: (agent.skill_names || []).map(item => item === updateKey ? data.skill_name : item),
      })),
    }))
    return data as SkillRecord
  }, [registryInfo.skills])

  const deleteSkill = useCallback(async (skillName: string) => {
    const name = String(skillName || '').trim()
    if (!name) throw new Error('技能名称不能为空')
    const resp = await fetch(`/api/platform/skills/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      const message = await resp.text()
      throw new Error(message || '删除技能失败')
    }
    setRegistryInfo(prev => ({
      ...prev,
      skills: removeByKey(prev.skills, 'skill_name', name),
      agents: prev.agents.map(agent => ({
        ...agent,
        skill_names: (agent.skill_names || []).filter(item => item !== name),
      })),
    }))
  }, [])

  const streamSkillGeneration = useCallback(async (
    payload: SkillGenerateRequest,
    options?: {
      signal?: AbortSignal
      onEvent?: (event: SkillGenerateStreamEvent) => void
    },
  ) => {
    const resp = await fetch('/api/platform/skills/generate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options?.signal,
    })
    if (!resp.ok) {
      let message = 'Skill 生成失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    if (!resp.body) throw new Error('Skill 生成流不可用')

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let doneEvent: SkillGenerateStreamEvent | null = null

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return
      const raw = line.slice(6).trim()
      if (!raw) return
      const event = JSON.parse(raw) as SkillGenerateStreamEvent
      options?.onEvent?.(event)
      if (event.type === 'error') {
        throw new Error(event.text || 'Skill 生成失败')
      }
      if (event.type === 'done') {
        doneEvent = event
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        processLine(line)
      }
    }
    if (buffer.trim()) processLine(buffer)
    return doneEvent
  }, [])

  const saveCardCollection = useCallback(async (payload: CardCollectionRecord) => {
    const collectionId = String(payload?.collection_id || '').trim()
    if (!collectionId) throw new Error('卡片集 ID 不能为空')
    const exists = (registryInfo.card_collections || []).some(item => item.collection_id === collectionId)
    const resp = await fetch(exists ? `/api/platform/card-collections/${encodeURIComponent(collectionId)}` : '/api/platform/card-collections', {
      method: exists ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error('保存卡片集失败')
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      card_collections: upsertByKey(prev.card_collections || [], 'collection_id', data),
    }))
    return data as CardCollectionRecord
  }, [registryInfo.card_collections])

  const deleteCardCollection = useCallback(async (collectionId: string) => {
    const id = String(collectionId || '').trim()
    if (!id) throw new Error('卡片集 ID 不能为空')
    const resp = await fetch(`/api/platform/card-collections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      let message = '删除卡片集失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    setRegistryInfo(prev => ({
      ...prev,
      card_collections: removeByKey(prev.card_collections || [], 'collection_id', id),
      card_templates: (prev.card_templates || []).map(template => template.collection_id === id ? { ...template, collection_id: 'default' } : template),
    }))
  }, [])

  const saveCardTemplate = useCallback(async (payload: CardTemplateRecord) => {
    const templateId = String(payload?.template_id || '').trim()
    if (!templateId) throw new Error('模板 ID 不能为空')
    const exists = (registryInfo.card_templates || []).some(item => item.template_id === templateId)
    const resp = await fetch(exists ? `/api/platform/card-templates/${encodeURIComponent(templateId)}` : '/api/platform/card-templates', {
      method: exists ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error('保存卡片模板失败')
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      card_templates: upsertByKey(prev.card_templates || [], 'template_id', data),
    }))
    return data as CardTemplateRecord
  }, [registryInfo.card_templates])

  const deleteCardTemplate = useCallback(async (templateId: string) => {
    const id = String(templateId || '').trim()
    if (!id) throw new Error('模板 ID 不能为空')
    const resp = await fetch(`/api/platform/card-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) {
      const message = await resp.text()
      throw new Error(message || '删除卡片模板失败')
    }
    setRegistryInfo(prev => ({
      ...prev,
      card_templates: removeByKey(prev.card_templates || [], 'template_id', id),
      tools: prev.tools.map(tool => {
        const binding = { ...(tool.card_binding || {}) }
        const bindingTemplateId = String(binding.template_id || binding.templateId || '').trim()
        if (bindingTemplateId !== id) return tool
        return { ...tool, card_binding: {} }
      }),
    }))
  }, [])

  const previewCard = useCallback(async (payload: { template: CardTemplateRecord; source_payload: Record<string, any>; binding?: Record<string, any> }) => {
    const resp = await fetch('/api/platform/cards/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: payload.template,
        source_payload: payload.source_payload || {},
        binding: payload.binding || {},
      }),
    })
    if (!resp.ok) throw new Error('卡片预览失败')
    return await resp.json() as CardPreviewResult
  }, [])

  const importCardPack = useCallback(async (pack: Record<string, any>) => {
    const resp = await fetch('/api/platform/card-packs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pack),
    })
    if (!resp.ok) throw new Error('卡片包导入失败')
    const result = await resp.json()
    await refreshRegistry()
    return result as { pack_id: string; display_name: string; collections_imported: number; templates_imported: number; errors: string[] }
  }, [refreshRegistry])

  const scanCardPacks = useCallback(async () => {
    const resp = await fetch('/api/platform/card-packs/scan', { method: 'POST' })
    if (!resp.ok) throw new Error('卡片包扫描失败')
    const results = await resp.json()
    await refreshRegistry()
    return results as Array<{ pack_id: string; display_name: string; collections_imported: number; templates_imported: number; errors: string[] }>
  }, [refreshRegistry])

  const getCardPackTemplate = useCallback(async () => {
    const resp = await fetch('/api/platform/card-packs/template')
    if (!resp.ok) throw new Error('读取卡片包模板失败')
    return await resp.json() as Record<string, any>
  }, [])

  const exportCardPack = useCallback(async (packId: string) => {
    const targetPackId = String(packId || '').trim()
    if (!targetPackId) throw new Error('卡片包 ID 不能为空')
    const resp = await fetch(`/api/platform/card-packs/${encodeURIComponent(targetPackId)}/export`)
    if (!resp.ok) {
      let message = '导出卡片包失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as Record<string, any>
  }, [])

  const refreshModelConfig = useCallback(async () => {
    setConfigLoading(true)
    setConfigError('')
    try {
      const resp = await fetch('/api/framework/model-config')
      if (!resp.ok) throw new Error('读取模型配置失败')
      const data = await resp.json()
      setModelConfig(normalizeModelConfig(data))
    } catch (err: any) {
      setConfigError(err?.message || '读取模型配置失败')
    } finally {
      setConfigLoading(false)
    }
  }, [])

  const saveModelConfig = useCallback(async (patch: {
    api_key?: string
    base_url?: string
    chat_model?: string
    embed_model?: string
    active_vendor?: string
    active_model?: string
    vendors?: ModelCatalogVendor[]
  }) => {
    setConfigSaving(true)
    setConfigError('')
    try {
      const resp = await fetch('/api/framework/model-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!resp.ok) throw new Error('保存模型配置失败')
      const data = await resp.json()
      setModelConfig(normalizeModelConfig(data))
    } catch (err: any) {
      const message = err?.message || '保存模型配置失败'
      setConfigError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setConfigSaving(false)
    }
  }, [])

  const refreshUsageStats = useCallback(async () => {
    setUsageLoading(true)
    setUsageError('')
    try {
      const resp = await fetch('/api/framework/usage-stats')
      if (!resp.ok) throw new Error('读取模型调用统计失败')
      const data = await resp.json()
      setUsageStats(normalizeUsageStats(data))
    } catch (err: any) {
      setUsageError(err?.message || '读取模型调用统计失败')
      setUsageStats(DEFAULT_USAGE_STATS)
    } finally {
      setUsageLoading(false)
    }
  }, [])

  const refreshMcpConfig = useCallback(async () => {
    setMcpLoading(true)
    setMcpError('')
    try {
      const resp = await fetch('/api/framework/mcp-config')
      if (!resp.ok) throw new Error('读取 MCP 配置失败')
      const data = await resp.json()
      setMcpConfig({ ...DEFAULT_MCP_CONFIG, ...data })
    } catch (err: any) {
      setMcpError(err?.message || '读取 MCP 配置失败')
    } finally {
      setMcpLoading(false)
    }
  }, [])

  const saveMcpConfig = useCallback(async (patch: Partial<McpConfig>) => {
    setMcpSaving(true)
    setMcpError('')
    try {
      const resp = await fetch('/api/framework/mcp-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!resp.ok) throw new Error('保存 MCP 配置失败')
      const data = await resp.json()
      setMcpConfig({ ...DEFAULT_MCP_CONFIG, ...data })
      return data as McpConfig
    } catch (err: any) {
      const message = err?.message || '保存 MCP 配置失败'
      setMcpError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setMcpSaving(false)
    }
  }, [])

  const testMcpServer = useCallback(async (name: string, server: Partial<McpServerConfig>) => {
    const targetName = String(name || '').trim() || 'probe'
    const resp = await fetch('/api/framework/mcp-servers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: targetName,
        server,
      }),
    })
    if (!resp.ok) {
      let message = 'MCP 测试失败'
      try {
        const data = await resp.json()
        message = data?.detail || message
      } catch {
        message = await resp.text() || message
      }
      throw new Error(message)
    }
    return await resp.json() as McpProbeResult
  }, [])

  const syncMcpTools = useCallback(async () => {
    const resp = await fetch('/api/platform/tools/sync/mcp', {
      method: 'POST',
    })
    if (!resp.ok) throw new Error('同步 MCP 工具失败')
    await Promise.all([refreshRegistry(), refreshMcpConfig()])
    return await resp.json()
  }, [refreshMcpConfig, refreshRegistry])

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    const sid = String(sessionId || '').trim()
    if (!sid) {
      setSessionMessages([])
      return
    }
    setSessionMessagesLoading(true)
    try {
      const resp = await fetch(`/api/sessions/${sid}/messages`)
      if (!resp.ok) throw new Error('读取会话消息失败')
      const data = await resp.json()
      setSessionMessages(Array.isArray(data) ? data : [])
    } finally {
      setSessionMessagesLoading(false)
    }
  }, [])

  const refreshSessions = useCallback(async (preferredSessionId = '') => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const resp = await fetch('/api/sessions')
      if (!resp.ok) throw new Error('读取会话记录失败')
      const data = await resp.json()
      const next = Array.isArray(data) ? data : []
      const currentSelectedId = selectedSessionIdRef.current
      const preferredId = String(preferredSessionId || '').trim()
      const nextSelectedId = (preferredId && next.some(item => item.id === preferredId))
        ? preferredId
        : ((currentSelectedId && next.some(item => item.id === currentSelectedId)) ? currentSelectedId : (next[0]?.id || ''))
      setSessions(next)
      setSelectedSessionId(nextSelectedId)
      if (!nextSelectedId) {
        setSessionMessages([])
      } else if (nextSelectedId === currentSelectedId) {
        await loadSessionMessages(nextSelectedId)
      }
    } catch (err: any) {
      setSessionsError(err?.message || '读取会话记录失败')
      setSessions([])
      setSessionMessages([])
    } finally {
      setSessionsLoading(false)
    }
  }, [loadSessionMessages])

  const selectSession = useCallback(async (sessionId: string) => {
    const sid = String(sessionId || '').trim()
    setSelectedSessionId(sid)
    await loadSessionMessages(sid)
  }, [loadSessionMessages])

  useEffect(() => {
    void refreshModelConfig()
    void refreshUsageStats()
    void refreshMcpConfig()
    void refreshSessions()
  }, [refreshMcpConfig, refreshModelConfig, refreshSessions, refreshUsageStats])

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionMessages([])
      return
    }
    void loadSessionMessages(selectedSessionId)
  }, [selectedSessionId, loadSessionMessages])

  const adminVisibleTools = useMemo(
    () => (registryInfo.tools || []).filter(isAdminVisibleTool),
    [registryInfo.tools],
  )

  const cardCatalog = useMemo<CardCatalogItem[]>(() => {
    const tools = adminVisibleTools
      .filter(item => item.supports_card || item.card_type)
      .map(item => ({
        id: `tool:${item.tool_name}:${item.card_type || 'bound'}`,
        card_type: item.card_type || 'bound-card',
        source_kind: 'tool' as const,
        source_name: item.tool_name,
        summary: item.summary || item.display_name || item.tool_name,
        binding: Object.keys(item.card_binding || {}).length ? JSON.stringify(item.card_binding) : 'tool-metadata',
      }))

    const skills = (registryInfo.skills || []).flatMap(item =>
      (item.card_types || []).map(cardType => ({
        id: `skill:${item.skill_name}:${cardType}`,
        card_type: cardType,
        source_kind: 'skill' as const,
        source_name: item.skill_name,
        summary: item.summary || item.display_name || item.skill_name,
        binding: 'skill-card-type',
      })),
    )

    return [...tools, ...skills]
  }, [adminVisibleTools, registryInfo.skills])

  const stats = useMemo(() => ({
    modelsReady: modelConfig.vendors.reduce((count, vendor) => count + vendor.models.filter(item => item.enabled).length, 0) || (modelConfig.chat_model ? 1 : 0),
    agents: registryInfo.agents?.length || 0,
    tools: adminVisibleTools.length,
    skills: registryInfo.skills?.length || 0,
    cards: cardCatalog.length + (registryInfo.card_templates?.length || 0),
    sessions: sessions.length,
  }), [adminVisibleTools.length, modelConfig.chat_model, modelConfig.vendors, registryInfo.agents?.length, registryInfo.card_templates?.length, registryInfo.skills?.length, cardCatalog.length, sessions.length])

  return {
    registryInfo,
    registryRefreshing,
    registryError,
    refreshRegistry,
    agents: registryInfo.agents,
    tools: adminVisibleTools,
    skills: registryInfo.skills,
    cardCollections: registryInfo.card_collections || [],
    cardTemplates: registryInfo.card_templates || [],
    saveAgent,
    deleteAgent,
    publishAgent,
    getAgentApiDocs,
    listAgentApiKeys,
    createAgentApiKey,
    deleteAgentApiKey,
    saveTool,
    deleteTool,
    saveSkill,
    deleteSkill,
    streamSkillGeneration,
    saveCardCollection,
    deleteCardCollection,
    saveCardTemplate,
    deleteCardTemplate,
    previewCard,
    importCardPack,
    scanCardPacks,
    getCardPackTemplate,
    exportCardPack,
    syncLocalTools,
    syncMcpTools,
    modelConfig,
    configLoading,
    configSaving,
    configError,
    refreshModelConfig,
    saveModelConfig,
    testModelConfig,
    usageStats,
    usageLoading,
    usageError,
    refreshUsageStats,
    mcpConfig,
    mcpLoading,
    mcpSaving,
    mcpError,
    refreshMcpConfig,
    saveMcpConfig,
    testMcpServer,
    sessions,
    sessionsLoading,
    sessionsError,
    refreshSessions,
    selectedSessionId,
    selectSession,
    sessionMessages,
    sessionMessagesLoading,
    cardCatalog,
    stats,
  }
}
