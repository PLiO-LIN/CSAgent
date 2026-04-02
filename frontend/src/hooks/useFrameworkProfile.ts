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
  name: string
  version: string
  mode: string
  plugins: Array<{
    plugin_id: string
    name: string
    version: string
    kind: string
    summary: string
    exports: {
      tools: string[]
      cards: string[]
      skills: string[]
    }
  }>
  skills: Array<{
    plugin_id: string
    name: string
    description: string
    tools: string[]
    card_types: string[]
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
    app_name: 'CSAgent Studio',
    app_subtitle: '通用客服智能体框架',
    welcome_title: '你好，我是通用客服智能体',
    welcome_description: '可处理问答、查询、推荐、下单等常见客服流程。',
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
        fetch('/api/framework/info'),
      ])
      if (!profileResp.ok) throw new Error('读取框架配置失败')
      if (!infoResp.ok) throw new Error('读取框架信息失败')
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
