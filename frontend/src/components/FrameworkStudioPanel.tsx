import { useEffect, useMemo, useState } from 'react'
import { Database, Save, Settings2, Puzzle, Brain, Plus, Trash2 } from 'lucide-react'
import type { FrameworkInfo, FrameworkProfile, MemoryItem } from '../hooks/useFrameworkProfile'

interface Props {
  profile: FrameworkProfile
  info: FrameworkInfo | null
  loading: boolean
  saving: boolean
  error: string
  selectedIdentity: string
  onSelectIdentity: (value: string) => void
  onSave: (patch: Partial<FrameworkProfile>) => Promise<unknown>
}

const DEMO_IDENTITIES = [
  { value: '', label: '不绑定演示身份' },
  { value: '18018609133', label: '张三 · 18018609133' },
  { value: '15088889999', label: '孙悦 · 15088889999' },
  { value: '13912345678', label: '李四 · 13912345678' },
  { value: '19916970157', label: '陈晨 · 19916970157' },
]

function cloneProfile(profile: FrameworkProfile): FrameworkProfile {
  return JSON.parse(JSON.stringify(profile)) as FrameworkProfile
}

function createMemoryItem(): MemoryItem {
  return {
    id: `mem_${Date.now()}`,
    title: '新长期记忆',
    content: '',
    tags: [],
    enabled: true,
  }
}

export default function FrameworkStudioPanel({
  profile,
  info,
  loading,
  saving,
  error,
  selectedIdentity,
  onSelectIdentity,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<FrameworkProfile>(profile)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    setDraft(cloneProfile(profile))
  }, [profile])

  const registrySummary = useMemo(() => {
    return {
      tools: info?.tools || [],
      skills: info?.skills || [],
      agents: info?.agents || [],
    }
  }, [info])

  const updatePrompt = (key: keyof FrameworkProfile['prompts'], value: string) => {
    setDraft(prev => ({
      ...prev,
      prompts: {
        ...prev.prompts,
        [key]: value,
      },
    }))
  }

  const updateUi = (key: keyof FrameworkProfile['ui'], value: string | string[]) => {
    setDraft(prev => ({
      ...prev,
      ui: {
        ...prev.ui,
        [key]: value,
      },
    }))
  }

  const updateMemory = (index: number, patch: Partial<MemoryItem>) => {
    setDraft(prev => {
      const items = [...prev.long_term_memory.items]
      items[index] = { ...items[index], ...patch }
      return {
        ...prev,
        long_term_memory: {
          ...prev.long_term_memory,
          items,
        },
      }
    })
  }

  const addMemory = () => {
    setDraft(prev => ({
      ...prev,
      long_term_memory: {
        ...prev.long_term_memory,
        items: [...prev.long_term_memory.items, createMemoryItem()],
      },
    }))
  }

  const removeMemory = (index: number) => {
    setDraft(prev => ({
      ...prev,
      long_term_memory: {
        ...prev.long_term_memory,
        items: prev.long_term_memory.items.filter((_item, idx) => idx !== index),
      },
    }))
  }

  const handleSave = async () => {
    try {
      await onSave({
        prompts: draft.prompts,
        long_term_memory: draft.long_term_memory,
        ui: draft.ui,
      })
      setSaveMessage('已保存')
      window.setTimeout(() => setSaveMessage(''), 1600)
    } catch {
      setSaveMessage('')
    }
  }

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.90),rgba(240,246,255,0.96))]">
      <div className="border-b border-[rgba(15,111,255,0.08)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">框架工作台</div>
            <div className="mt-1 text-xs text-slate-500">编辑通用提示词、长期记忆和前端文案</div>
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="studio-primary-btn rounded-[16px] px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? '保存中' : '保存'}
          </button>
        </div>
        {(error || saveMessage) && (
          <div className={`mt-2 text-xs ${error ? 'text-rose-500' : 'text-emerald-600'}`}>
            {error || saveMessage}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="studio-inner-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Settings2 size={15} className="text-[var(--studio-blue-600)]" />
            前端承载层
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">应用名称</label>
              <input
                value={draft.ui.app_name}
                onChange={e => updateUi('app_name', e.target.value)}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">副标题</label>
              <input
                value={draft.ui.app_subtitle}
                onChange={e => updateUi('app_subtitle', e.target.value)}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">欢迎标题</label>
              <input
                value={draft.ui.welcome_title}
                onChange={e => updateUi('welcome_title', e.target.value)}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">欢迎说明</label>
              <textarea
                value={draft.ui.welcome_description}
                onChange={e => updateUi('welcome_description', e.target.value)}
                rows={4}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">快捷动作（每行一个）</label>
              <textarea
                value={draft.ui.quick_actions.join('\n')}
                onChange={e => updateUi('quick_actions', e.target.value.split('\n').map(item => item.trim()).filter(Boolean))}
                rows={4}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">亮点标签（每行一个）</label>
              <textarea
                value={draft.ui.highlights.join('\n')}
                onChange={e => updateUi('highlights', e.target.value.split('\n').map(item => item.trim()).filter(Boolean))}
                rows={3}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="studio-inner-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Database size={15} className="text-[var(--studio-blue-600)]" />
            {draft.ui.identity_label || '演示身份'}
          </div>
          <div className="text-xs leading-5 text-slate-500">{draft.ui.identity_hint || '可选；用于给演示工具补充默认用户标识。'}</div>
          <div className="mt-3 grid gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">身份区标题</label>
              <input
                value={draft.ui.identity_label}
                onChange={e => updateUi('identity_label', e.target.value)}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">身份提示文案</label>
              <input
                value={draft.ui.identity_hint}
                onChange={e => updateUi('identity_hint', e.target.value)}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">已选身份前缀</label>
              <input
                value={draft.ui.selected_identity_prefix}
                onChange={e => updateUi('selected_identity_prefix', e.target.value)}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>
          <select
            value={selectedIdentity}
            onChange={e => onSelectIdentity(e.target.value)}
            className="studio-input mt-3 w-full px-3 py-2 text-sm"
          >
            {DEMO_IDENTITIES.map(item => (
              <option key={item.value || 'none'} value={item.value}>{item.label}</option>
            ))}
          </select>
        </section>

        <section className="studio-inner-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Brain size={15} className="text-[var(--studio-blue-600)]" />
            提示词
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">系统提示词</label>
              <textarea
                value={draft.prompts.system_core}
                onChange={e => updatePrompt('system_core', e.target.value)}
                rows={8}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">技能引导提示词</label>
              <textarea
                value={draft.prompts.skill_guide}
                onChange={e => updatePrompt('skill_guide', e.target.value)}
                rows={8}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">长期记忆提示词</label>
              <textarea
                value={draft.long_term_memory.prompt}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  long_term_memory: {
                    ...prev.long_term_memory,
                    prompt: e.target.value,
                  },
                }))}
                rows={5}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">摘要压缩提示词</label>
              <textarea
                value={draft.prompts.compaction}
                onChange={e => updatePrompt('compaction', e.target.value)}
                rows={6}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="studio-inner-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
            <div className="flex items-center gap-2">
              <Brain size={15} className="text-[var(--studio-blue-600)]" />
              长期记忆
            </div>
            <button onClick={addMemory} className="studio-secondary-btn rounded-[14px] px-3 py-1.5 text-xs">
              <Plus size={12} />
              新增
            </button>
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={draft.long_term_memory.enabled}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  long_term_memory: {
                    ...prev.long_term_memory,
                    enabled: e.target.checked,
                  },
                }))}
              />
              启用长期记忆注入
            </label>
            <div>
              <label className="mb-1 block text-xs text-slate-500">单次注入条数</label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.long_term_memory.top_k}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  long_term_memory: {
                    ...prev.long_term_memory,
                    top_k: Math.max(1, Number(e.target.value || 1)),
                  },
                }))}
                className="studio-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-3">
            {draft.long_term_memory.items.map((item, index) => (
              <div key={item.id || index} className="rounded-[18px] border border-[rgba(15,111,255,0.08)] bg-white/90 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={e => updateMemory(index, { enabled: e.target.checked })}
                    />
                    启用
                  </label>
                  <button onClick={() => removeMemory(index)} className="text-rose-500 transition-opacity hover:opacity-80">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    value={item.title}
                    onChange={e => updateMemory(index, { title: e.target.value })}
                    placeholder="记忆标题"
                    className="studio-input w-full px-3 py-2 text-sm"
                  />
                  <textarea
                    value={item.content}
                    onChange={e => updateMemory(index, { content: e.target.value })}
                    placeholder="记忆内容"
                    rows={4}
                    className="studio-input w-full px-3 py-2 text-sm"
                  />
                  <input
                    value={(item.tags || []).join(', ')}
                    onChange={e => updateMemory(index, { tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })}
                    placeholder="标签，逗号分隔"
                    className="studio-input w-full px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ))}
            {draft.long_term_memory.items.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-[rgba(15,111,255,0.14)] px-3 py-4 text-center text-xs text-slate-400">
                还没有长期记忆，点击上方“新增”添加。
              </div>
            )}
          </div>
        </section>

        <section className="studio-inner-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Puzzle size={15} className="text-[var(--studio-blue-600)]" />
            平台注册中心
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Agents</div>
              {registrySummary.agents.map(agent => (
                <div key={agent.agent_id} className="rounded-[16px] border border-[rgba(15,111,255,0.08)] bg-white/90 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-800">{agent.name || agent.agent_id}</div>
                    <div className="text-[11px] text-slate-400">{agent.is_default ? 'default' : agent.published ? 'published' : 'draft'}</div>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{agent.description || agent.agent_id}</div>
                  <div className="mt-2 text-[11px] text-slate-400">tools {agent.global_tool_names.length} · skills {agent.skill_names.length}</div>
                </div>
              ))}
              {!loading && registrySummary.agents.length === 0 && (
                <div className="rounded-[16px] border border-dashed border-[rgba(15,111,255,0.14)] px-3 py-4 text-center text-xs text-slate-400">
                  当前没有 Agent 记录。
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Tools</div>
              {registrySummary.tools.map(tool => (
                <div key={tool.tool_name} className="rounded-[16px] border border-[rgba(15,111,255,0.08)] bg-white/90 px-3 py-3">
                  <div className="text-sm font-medium text-slate-800">{tool.display_name || tool.tool_name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{tool.summary || tool.tool_name}</div>
                  <div className="mt-2 text-[11px] text-slate-400">{tool.provider_type} · {tool.scope} · {tool.supports_card ? (tool.card_type || 'card') : 'no-card'}</div>
                </div>
              ))}
              {!loading && registrySummary.tools.length === 0 && (
                <div className="rounded-[16px] border border-dashed border-[rgba(15,111,255,0.14)] px-3 py-4 text-center text-xs text-slate-400">
                  当前没有 Tool 记录。
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Skills</div>
              {registrySummary.skills.map(skill => (
                <div key={skill.skill_name} className="rounded-[16px] border border-[rgba(15,111,255,0.08)] bg-white/90 px-3 py-3">
                  <div className="text-sm font-medium text-slate-800">{skill.display_name || skill.skill_name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{skill.summary || skill.skill_name}</div>
                  <div className="mt-2 text-[11px] text-slate-400">{skill.tool_names.length ? skill.tool_names.join(', ') : '无绑定工具'}</div>
                </div>
              ))}
              {!loading && registrySummary.skills.length === 0 && (
                <div className="rounded-[16px] border border-dashed border-[rgba(15,111,255,0.14)] px-3 py-4 text-center text-xs text-slate-400">
                  当前没有 Skill 记录。
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
