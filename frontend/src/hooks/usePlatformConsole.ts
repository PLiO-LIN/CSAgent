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

type AgentRecord = FrameworkInfo['agents'][number]
type ToolRecord = FrameworkInfo['tools'][number]
type SkillRecord = FrameworkInfo['skills'][number]
type CardTemplateRecord = FrameworkInfo['card_templates'][number]

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai_compatible',
  has_api_key: false,
  base_url: '',
  chat_model: '',
  embed_model: '',
  active_vendor: '',
  active_model: '',
  vendors: [],
  database_url: 'sqlite+aiosqlite:///./csagent.db',
}

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

function upsertByKey<T extends Record<string, any>>(items: T[], key: string, record: T) {
  const target = String(record?.[key] ?? '').trim()
  if (!target) return items
  const index = items.findIndex(item => String(item?.[key] ?? '').trim() === target)
  if (index < 0) return [record, ...items]
  const next = [...items]
  next[index] = record
  return next
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
      setModelConfig({ ...DEFAULT_MODEL_CONFIG, ...data })
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
      setModelConfig({ ...DEFAULT_MODEL_CONFIG, ...data })
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

  const cardCatalog = useMemo<CardCatalogItem[]>(() => {
    const tools = (registryInfo.tools || [])
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
  }, [registryInfo])

  const stats = useMemo(() => ({
    modelsReady: modelConfig.vendors.reduce((count, vendor) => count + vendor.models.filter(item => item.enabled).length, 0) || (modelConfig.chat_model ? 1 : 0),
    agents: registryInfo.agents?.length || 0,
    tools: registryInfo.tools?.length || 0,
    skills: registryInfo.skills?.length || 0,
    cards: cardCatalog.length + (registryInfo.card_templates?.length || 0),
    sessions: sessions.length,
  }), [modelConfig.chat_model, modelConfig.vendors, registryInfo, cardCatalog.length, sessions.length])

  return {
    registryInfo,
    registryRefreshing,
    registryError,
    refreshRegistry,
    agents: registryInfo.agents,
    tools: registryInfo.tools,
    skills: registryInfo.skills,
    cardTemplates: registryInfo.card_templates || [],
    saveAgent,
    publishAgent,
    saveTool,
    saveSkill,
    saveCardTemplate,
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
