import type { FrameworkInfo } from '../hooks/useFrameworkProfile'

export type AgentRecord = FrameworkInfo['agents'][number]
export type ToolRecord = FrameworkInfo['tools'][number]
export type SkillRecord = FrameworkInfo['skills'][number]

export interface AgentForm {
  agent_id: string
  name: string
  description: string
  enabled: boolean
  published: boolean
  is_default: boolean
  global_tool_names: string[]
  skill_names: string[]
  persona_prompt: string
  model_vendor_id: string
  model_id: string
  system_core_prompt: string
  skill_guide_prompt: string
  summary_prompt: string
  memory_prompt: string
  tool_policy_config_text: string
  memory_config_text: string
  metadata_text: string
}

export interface ToolForm {
  tool_name: string
  display_name: string
  summary: string
  provider_type: string
  source_ref: string
  scope: string
  enabled: boolean
  supports_card: boolean
  card_type: string
  input_schema_text: string
  output_schema_text: string
  policy_text: string
  card_binding_text: string
  transport_config_text: string
  metadata_text: string
}

export interface SkillForm {
  skill_name: string
  display_name: string
  summary: string
  document_md: string
  enabled: boolean
  tool_names: string[]
  global_tool_names_text: string
  card_types_text: string
  entry_intents_text: string
  phases_text: string
  source_type: string
  source_ref: string
  metadata_text: string
}

export function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

export function parseJsonText<T>(value: string, fallback: T, label: string): T {
  const text = String(value || '').trim()
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label} 不是合法 JSON`)
  }
}

export function parseListText(value: string) {
  return String(value || '')
    .split(/[\n,]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

export function formatListText(values: string[]) {
  return (values || []).map(item => item.trim()).filter(Boolean).join('\n')
}

export function createAgentForm(record?: Partial<AgentRecord>): AgentForm {
  const modelConfig = record?.model_config || {}
  return {
    agent_id: String(record?.agent_id || ''),
    name: String(record?.name || ''),
    description: String(record?.description || ''),
    enabled: Boolean(record?.enabled ?? true),
    published: Boolean(record?.published ?? false),
    is_default: Boolean(record?.is_default ?? false),
    global_tool_names: [...(record?.global_tool_names || [])],
    skill_names: [...(record?.skill_names || [])],
    persona_prompt: String(record?.persona_prompt || ''),
    model_vendor_id: String((modelConfig as any)?.vendor_id || ''),
    model_id: String((modelConfig as any)?.model_id || ''),
    system_core_prompt: String(record?.system_core_prompt || ''),
    skill_guide_prompt: String(record?.skill_guide_prompt || ''),
    summary_prompt: String(record?.summary_prompt || ''),
    memory_prompt: String(record?.memory_prompt || ''),
    tool_policy_config_text: formatJson(record?.tool_policy_config || {}),
    memory_config_text: formatJson(record?.memory_config || {}),
    metadata_text: formatJson(record?.metadata || {}),
  }
}

export function agentFormToPayload(form: AgentForm): AgentRecord {
  return {
    agent_id: form.agent_id.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
    published: form.published,
    is_default: form.is_default,
    system_core_prompt: form.system_core_prompt,
    persona_prompt: form.persona_prompt,
    skill_guide_prompt: form.skill_guide_prompt,
    summary_prompt: form.summary_prompt,
    memory_prompt: form.memory_prompt,
    global_tool_names: form.global_tool_names,
    skill_names: form.skill_names,
    model_config: {
      vendor_id: form.model_vendor_id.trim(),
      model_id: form.model_id.trim(),
    },
    tool_policy_config: parseJsonText(form.tool_policy_config_text, {}, '工具策略'),
    memory_config: parseJsonText(form.memory_config_text, {}, '记忆配置'),
    metadata: parseJsonText(form.metadata_text, {}, '附加信息'),
  }
}

export function createToolForm(record?: Partial<ToolRecord>): ToolForm {
  return {
    tool_name: String(record?.tool_name || ''),
    display_name: String(record?.display_name || ''),
    summary: String(record?.summary || ''),
    provider_type: String(record?.provider_type || 'local'),
    source_ref: String(record?.source_ref || ''),
    scope: String(record?.scope || 'global'),
    enabled: Boolean(record?.enabled ?? true),
    supports_card: Boolean(record?.supports_card ?? false),
    card_type: String(record?.card_type || ''),
    input_schema_text: formatJson(record?.input_schema || {}),
    output_schema_text: formatJson(record?.output_schema || {}),
    policy_text: formatJson(record?.policy || {}),
    card_binding_text: formatJson(record?.card_binding || {}),
    transport_config_text: formatJson(record?.transport_config || {}),
    metadata_text: formatJson(record?.metadata || {}),
  }
}

export function toolFormToPayload(form: ToolForm): ToolRecord {
  return {
    tool_name: form.tool_name.trim(),
    display_name: form.display_name.trim(),
    summary: form.summary.trim(),
    provider_type: form.provider_type.trim(),
    source_ref: form.source_ref.trim(),
    scope: form.scope.trim(),
    enabled: form.enabled,
    supports_card: form.supports_card,
    card_type: form.card_type.trim(),
    input_schema: parseJsonText(form.input_schema_text, {}, '输入 Schema'),
    output_schema: parseJsonText(form.output_schema_text, {}, '输出 Schema'),
    policy: parseJsonText(form.policy_text, {}, '工具策略'),
    card_binding: parseJsonText(form.card_binding_text, {}, '卡片绑定'),
    transport_config: parseJsonText(form.transport_config_text, {}, '传输配置'),
    metadata: parseJsonText(form.metadata_text, {}, '附加信息'),
  }
}

export function createSkillForm(record?: Partial<SkillRecord>): SkillForm {
  return {
    skill_name: String(record?.skill_name || ''),
    display_name: String(record?.display_name || ''),
    summary: String(record?.summary || ''),
    document_md: String(record?.document_md || ''),
    enabled: Boolean(record?.enabled ?? true),
    tool_names: [...(record?.tool_names || [])],
    global_tool_names_text: formatListText(record?.global_tool_names || []),
    card_types_text: formatListText(record?.card_types || []),
    entry_intents_text: formatListText(record?.entry_intents || []),
    phases_text: formatListText(record?.phases || []),
    source_type: String(record?.source_type || 'local'),
    source_ref: String(record?.source_ref || ''),
    metadata_text: formatJson(record?.metadata || {}),
  }
}

export function skillFormToPayload(form: SkillForm): SkillRecord {
  return {
    skill_name: form.skill_name.trim(),
    display_name: form.display_name.trim() || form.skill_name.trim(),
    summary: form.summary.trim(),
    document_md: form.document_md,
    enabled: form.enabled,
    tool_names: [...form.tool_names],
    global_tool_names: parseListText(form.global_tool_names_text),
    card_types: parseListText(form.card_types_text),
    entry_intents: parseListText(form.entry_intents_text),
    phases: parseListText(form.phases_text),
    source_type: form.source_type.trim(),
    source_ref: form.source_ref.trim(),
    metadata: parseJsonText(form.metadata_text, {}, '附加信息'),
  }
}
