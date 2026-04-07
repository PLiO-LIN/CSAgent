import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FrameworkInfo } from './useFrameworkProfile'

export interface ModelCatalogModel {
  model_id: string
  display_name: string
  chat_model: string
  enabled: boolean
}

export interface ModelCatalogVendor {
  vendor_id: string
  display_name: string
  base_url: string
  enabled: boolean
  models: ModelCatalogModel[]
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

type AgentRecord = FrameworkInfo['agents'][number]
type ToolRecord = FrameworkInfo['tools'][number]
type SkillRecord = FrameworkInfo['skills'][number]
type CardTemplateRecord = FrameworkInfo['card_templates'][number]

const PRESET_MODEL_VENDORS: ModelCatalogVendor[] = [
  {
    vendor_id: 'siliconflow',
    display_name: '轨迹流动',
    base_url: 'https://api.siliconflow.cn/v1',
    enabled: true,
    models: [
      {
        model_id: 'Qwen/Qwen3.5-27B',
        display_name: 'Qwen/Qwen3.5-27B',
        chat_model: 'Qwen/Qwen3.5-27B',
        enabled: true,
      },
    ],
  },
  {
    vendor_id: 'openai_completion',
    display_name: 'openai_completion',
    base_url: 'https://api.openai.com/v1',
    enabled: true,
    models: [
      {
        model_id: 'gpt-4o-mini',
        display_name: 'gpt-4o-mini',
        chat_model: 'gpt-4o-mini',
        enabled: true,
      },
    ],
  },
]

function cloneVendor(vendor: ModelCatalogVendor): ModelCatalogVendor {
  return {
    ...vendor,
    models: (vendor.models || []).map(model => ({ ...model })),
  }
}

function normalizeVendorId(value: unknown) {
  const text = String(value || '').trim()
  return text === 'default' ? 'siliconflow' : text
}

function normalizeVendorDisplayName(vendorId: string, displayName: unknown) {
  const text = String(displayName || '').trim()
  if (vendorId === 'siliconflow' && (!text || text === '默认厂商' || text === 'default')) {
    return '轨迹流动'
  }
  return text || vendorId
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
    vendors: PRESET_MODEL_VENDORS.map(cloneVendor),
    database_url: 'sqlite+aiosqlite:///./csagent.db',
  }

  const vendorMap = new Map(defaults.vendors.map(vendor => [vendor.vendor_id, cloneVendor(vendor)]))
  for (const item of Array.isArray(raw?.vendors) ? raw?.vendors || [] : []) {
    const vendorId = normalizeVendorId(item?.vendor_id)
    if (!vendorId) continue
    const nextVendor: ModelCatalogVendor = {
      vendor_id: vendorId,
      display_name: normalizeVendorDisplayName(vendorId, item?.display_name),
      base_url: String(item?.base_url || '').trim(),
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

const DEFAULT_MCP_CONFIG: McpConfig = {
  enabled: false,
  tool_timeout_seconds: 60,
  servers: {},
}

const EMPTY_INFO: FrameworkInfo = {
  tools: [],
  skills: [],
  agents: [],
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

  useEffect(() => {
    setRegistryInfo(info || EMPTY_INFO)
  }, [info])

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

  const saveSkill = useCallback(async (payload: SkillRecord) => {
    const skillName = String(payload?.skill_name || '').trim()
    if (!skillName) throw new Error('技能名称不能为空')
    const exists = registryInfo.skills.some(item => item.skill_name === skillName)
    const resp = await fetch(exists ? `/api/platform/skills/${encodeURIComponent(skillName)}` : '/api/platform/skills', {
      method: exists ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error('保存技能失败')
    const data = await resp.json()
    setRegistryInfo(prev => ({
      ...prev,
      skills: upsertByKey(prev.skills, 'skill_name', data),
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

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const resp = await fetch('/api/sessions')
      if (!resp.ok) throw new Error('读取会话记录失败')
      const data = await resp.json()
      const next = Array.isArray(data) ? data : []
      setSessions(next)
      setSelectedSessionId(prev => prev || next[0]?.id || '')
    } catch (err: any) {
      setSessionsError(err?.message || '读取会话记录失败')
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

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

  const selectSession = useCallback(async (sessionId: string) => {
    const sid = String(sessionId || '').trim()
    setSelectedSessionId(sid)
    await loadSessionMessages(sid)
  }, [loadSessionMessages])

  useEffect(() => {
    void refreshModelConfig()
    void refreshMcpConfig()
    void refreshSessions()
  }, [refreshMcpConfig, refreshModelConfig, refreshSessions])

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
    cardTemplates: registryInfo.card_templates || [],
    saveAgent,
    deleteAgent,
    publishAgent,
    saveTool,
    deleteTool,
    saveSkill,
    deleteSkill,
    saveCardTemplate,
    deleteCardTemplate,
    previewCard,
    syncLocalTools,
    syncMcpTools,
    modelConfig,
    configLoading,
    configSaving,
    configError,
    refreshModelConfig,
    saveModelConfig,
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
