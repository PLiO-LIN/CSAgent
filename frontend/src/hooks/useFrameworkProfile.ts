import { useCallback, useEffect, useState } from 'react'

export interface MemoryItem {
  id: string
  title: string
  content: string
  tags: string[]
  enabled: boolean
}

export interface FrameworkProfile {
  prompts: {
    system_core: string
    skill_guide: string
    compaction: string
  }
  long_term_memory: {
    enabled: boolean
    top_k: number
    prompt: string
    items: MemoryItem[]
  }
  ui: {
    app_name: string
    app_subtitle: string
    welcome_title: string
    welcome_description: string
    identity_label: string
    identity_hint: string
    selected_identity_prefix: string
    quick_actions: string[]
    highlights: string[]
  }
}

export interface FrameworkInfo {
  tools: Array<{
    tool_name: string
    display_name: string
    summary: string
    provider_type: string
    source_ref: string
    scope: string
    enabled: boolean
    supports_card: boolean
    card_type: string
    input_schema: Record<string, any>
    output_schema: Record<string, any>
    policy: Record<string, any>
    card_binding: Record<string, any>
    transport_config: Record<string, any>
    metadata: Record<string, any>
  }>
  skills: Array<{
    skill_name: string
    display_name: string
    summary: string
    document_md: string
    enabled: boolean
    tool_names: string[]
    global_tool_names: string[]
    card_types: string[]
    entry_intents: string[]
    phases: string[]
    source_type: string
    source_ref: string
    metadata: Record<string, any>
  }>
  agents: Array<{
    agent_id: string
    name: string
    description: string
    enabled: boolean
    published: boolean
    is_default: boolean
    system_core_prompt: string
    persona_prompt: string
    skill_guide_prompt: string
    summary_prompt: string
    memory_prompt: string
    global_tool_names: string[]
    skill_names: string[]
    model_config: Record<string, any>
    tool_policy_config: Record<string, any>
    memory_config: Record<string, any>
    metadata: Record<string, any>
  }>
  card_templates: Array<{
    template_id: string
    display_name: string
    summary: string
    enabled: boolean
    template_type: string
    renderer_key: string
    data_schema: Record<string, any>
    ui_schema: Record<string, any>
    action_schema: Record<string, any>
    sample_payload: Record<string, any>
    metadata: Record<string, any>
  }>
}

const DEFAULT_PROFILE: FrameworkProfile = {
  prompts: {
    system_core: '',
    skill_guide: '',
    compaction: '',
  },
  long_term_memory: {
    enabled: true,
    top_k: 4,
    prompt: '',
    items: [],
  },
  ui: {
    app_name: 'CSAgent Platform',
    app_subtitle: '平台控制台',
    welcome_title: '平台控制台',
    welcome_description: '管理模型、智能体、工具、技能、卡片与会话。',
    identity_label: '演示身份',
    identity_hint: '可选',
    selected_identity_prefix: '当前演示身份',
    quick_actions: [],
    highlights: [],
  },
}

export function useFrameworkProfile() {
  const [profile, setProfile] = useState<FrameworkProfile>(DEFAULT_PROFILE)
  const [info, setInfo] = useState<FrameworkInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [profileResp, infoResp] = await Promise.all([
        fetch('/api/framework/profile'),
        fetch('/api/platform/snapshot'),
      ])
      if (!profileResp.ok) throw new Error('读取框架配置失败')
      if (!infoResp.ok) throw new Error('读取平台注册中心失败')
      const profileData = await profileResp.json()
      const infoData = await infoResp.json()
      setProfile({ ...DEFAULT_PROFILE, ...profileData })
      setInfo(infoData)
    } catch (err: any) {
      setError(err?.message || '加载框架配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveProfile = useCallback(async (patch: Partial<FrameworkProfile>) => {
    setSaving(true)
    setError('')
    try {
      const resp = await fetch('/api/framework/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!resp.ok) throw new Error('保存框架配置失败')
      const data = await resp.json()
      setProfile({ ...DEFAULT_PROFILE, ...data })
      return data as FrameworkProfile
    } catch (err: any) {
      const message = err?.message || '保存框架配置失败'
      setError(message)
      throw err
    } finally {
      setSaving(false)
    }
  }, [])

  return {
    profile,
    info,
    loading,
    saving,
    error,
    refresh,
    saveProfile,
  }
}
