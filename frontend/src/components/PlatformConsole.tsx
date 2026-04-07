import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Brain,
  Cable,
  Clock3,
  Cpu,
  Database,
  History,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react'
import ChatPanel from './ChatPanel'
import FrameworkStudioPanel from './FrameworkStudioPanel'
import { type UseChatController } from '../hooks/useChat'
import { type FrameworkInfo, type FrameworkProfile } from '../hooks/useFrameworkProfile'
import { usePlatformConsole } from '../hooks/usePlatformConsole'

type TabKey = 'models' | 'agents' | 'tools' | 'skills' | 'cards' | 'chat' | 'sessions' | 'studio'

interface Props {
  chat: UseChatController
  profile: FrameworkProfile
  info: FrameworkInfo | null
  loading: boolean
  saving: boolean
  error: string
  saveProfile: (patch: Partial<FrameworkProfile>) => Promise<unknown>
}

const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: any; hint: string }> = [
  { key: 'models', label: '模型配置', icon: Cpu, hint: '配置模型与网关' },
  { key: 'agents', label: '智能体', icon: Bot, hint: '管理 Agent' },
  { key: 'tools', label: '工具', icon: Wrench, hint: '查看 Tool 能力' },
  { key: 'skills', label: '技能', icon: Brain, hint: '管理 Skill 视图' },
  { key: 'cards', label: '卡片协议', icon: Sparkles, hint: '查看卡片绑定' },
  { key: 'chat', label: '智能体对话', icon: MessageSquare, hint: '联调对话链路' },
  { key: 'sessions', label: '对话记录', icon: History, hint: '查看 SQLite 会话' },
  { key: 'studio', label: '平台工作室', icon: Settings2, hint: '提示词与 UI 配置' },
]

function formatTime(value: number) {
  if (!value) return '—'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function countText(value: string) {
  return String(value || '').trim().length
}

const LEGACY_ADMIN_HIDDEN_TOOL_NAMES = new Set(['load_skill', 'load_skills', 'list_skills', 'list_tools'])

function isAdminVisibleTool(tool: FrameworkInfo['tools'][number]) {
  const metadata = tool?.metadata || {}
  const toolName = String(tool?.tool_name || '').trim()
  if (metadata?.admin_hidden === true) return false
  if (metadata?.internal === true) return false
  if (LEGACY_ADMIN_HIDDEN_TOOL_NAMES.has(toolName)) return false
  return true
}

export default function PlatformConsole({ chat, profile, info, loading, saving, error, saveProfile }: Props) {
  const consoleData = usePlatformConsole(info)
  const [tab, setTab] = useState<TabKey>('models')
  const [toolName, setToolName] = useState('')
  const [skillName, setSkillName] = useState('')
  const [cardId, setCardId] = useState('')
  const [modelDraft, setModelDraft] = useState({ api_key: '', base_url: '', chat_model: '', embed_model: '' })

  const agents = info?.agents || []
  const tools = (info?.tools || []).filter(isAdminVisibleTool)
  const skills = info?.skills || []
  const activeAgent = agents.find(item => item.agent_id === chat.agentId) || agents.find(item => item.is_default) || agents[0]
  const activeTool = tools.find(item => item.tool_name === toolName) || tools[0]
  const activeSkill = skills.find(item => item.skill_name === skillName) || skills[0]
  const activeCard = consoleData.cardCatalog.find(item => item.id === cardId) || consoleData.cardCatalog[0]

  useEffect(() => {
    setModelDraft({
      api_key: '',
      base_url: consoleData.modelConfig.base_url,
      chat_model: consoleData.modelConfig.chat_model,
      embed_model: consoleData.modelConfig.embed_model,
    })
  }, [consoleData.modelConfig])

  useEffect(() => {
    const fallbackAgent = agents.find(item => item.is_default)?.agent_id || agents[0]?.agent_id || ''
    if (!chat.agentId && fallbackAgent) chat.setAgentId(fallbackAgent)
  }, [agents, chat.agentId, chat.setAgentId])

  useEffect(() => {
    if (!toolName && tools[0]?.tool_name) setToolName(tools[0].tool_name)
  }, [toolName, tools])

  useEffect(() => {
    if (!skillName && skills[0]?.skill_name) setSkillName(skills[0].skill_name)
  }, [skillName, skills])

  useEffect(() => {
    if (!cardId && consoleData.cardCatalog[0]?.id) setCardId(consoleData.cardCatalog[0].id)
  }, [cardId, consoleData.cardCatalog])

  const headerTitle = useMemo(() => {
    return NAV_ITEMS.find(item => item.key === tab)?.label || '平台控制台'
  }, [tab])

  const renderModels = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
      <section className="rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.64)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/72">Model Gateway</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">先把模型配置成平台入口的第一抓手</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">API Key 留空表示保持当前密钥；SQLite 仍然作为底层数据存储，不参与本页修改。</p>
          </div>
          <button
            onClick={() => void consoleData.saveModelConfig(modelDraft)}
            disabled={consoleData.configLoading || consoleData.configSaving}
            className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {consoleData.configSaving ? '保存中...' : '保存模型配置'}
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300">
            <span>API Key</span>
            <input value={modelDraft.api_key} onChange={e => setModelDraft(prev => ({ ...prev, api_key: e.target.value }))} placeholder={consoleData.modelConfig.has_api_key ? '已配置，留空表示保持当前密钥' : '输入新的 API Key'} className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10" />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Base URL</span>
            <input value={modelDraft.base_url} onChange={e => setModelDraft(prev => ({ ...prev, base_url: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10" />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Chat Model</span>
            <input value={modelDraft.chat_model} onChange={e => setModelDraft(prev => ({ ...prev, chat_model: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10" />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Embedding Model</span>
            <input value={modelDraft.embed_model} onChange={e => setModelDraft(prev => ({ ...prev, embed_model: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:bg-white/10" />
          </label>
        </div>
        {consoleData.configError && <div className="mt-4 text-sm text-rose-300">{consoleData.configError}</div>}
      </section>
      <section className="space-y-4">
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-white"><KeyRound size={18} className="text-cyan-300" /> 鉴权状态</div>
          <div className="mt-4 text-3xl font-semibold text-white">{consoleData.modelConfig.has_api_key ? 'Ready' : 'Missing'}</div>
          <div className="mt-2 text-sm text-slate-300">{consoleData.modelConfig.has_api_key ? '当前已存在可用 API Key' : '未检测到 API Key，聊天会直接 401'}</div>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-white"><Database size={18} className="text-cyan-300" /> SQLite</div>
          <div className="mt-4 break-all text-sm leading-6 text-slate-300">{consoleData.modelConfig.database_url}</div>
        </div>
      </section>
    </div>
  )

  const renderRegistry = (kind: 'agents' | 'tools' | 'skills' | 'cards') => {
    const list = kind === 'agents' ? agents : kind === 'tools' ? tools : kind === 'skills' ? skills : consoleData.cardCatalog
    const selected = kind === 'agents' ? activeAgent : kind === 'tools' ? activeTool : kind === 'skills' ? activeSkill : activeCard
    const select = (id: string) => {
      if (kind === 'agents') chat.setAgentId(id)
      if (kind === 'tools') setToolName(id)
      if (kind === 'skills') setSkillName(id)
      if (kind === 'cards') setCardId(id)
    }
    return (
      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.64)] p-4 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
            <span>{headerTitle}</span>
            <span>{list.length}</span>
          </div>
          <div className="space-y-3">
            {list.map((item: any) => {
              const id = item.agent_id || item.tool_name || item.skill_name || item.id
              const title = item.name || item.display_name || item.tool_name || item.skill_name || item.card_type
              const subtitle = item.description || item.summary || item.source_name || ''
              const active = (selected as any)?.agent_id === id || (selected as any)?.tool_name === id || (selected as any)?.skill_name === id || (selected as any)?.id === id
              return (
                <button key={id} onClick={() => select(id)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-cyan-300/70 bg-cyan-400/10' : 'border-white/8 bg-white/5 hover:bg-white/9'}`}>
                  <div className="text-sm font-medium text-white">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{subtitle || '—'}</div>
                </button>
              )
            })}
          </div>
        </section>
        <section className="rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.64)] p-6 backdrop-blur-xl">
          {!selected && <div className="text-sm text-slate-400">当前没有可展示记录。</div>}
          {selected && (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Detail</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{(selected as any).name || (selected as any).display_name || (selected as any).tool_name || (selected as any).skill_name || (selected as any).card_type}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{(selected as any).description || (selected as any).summary || '暂无描述'}</p>
              </div>
              {kind === 'agents' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">状态：{activeAgent?.published ? 'published' : 'draft'} / {activeAgent?.enabled ? 'enabled' : 'disabled'}</div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">全局工具：{activeAgent?.global_tool_names.length || 0}</div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">技能：{activeAgent?.skill_names.length || 0}</div>
                </div>
              )}
              {kind === 'skills' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">绑定工具：{activeSkill?.tool_names.join(', ') || '无'}</div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">全局工具：{activeSkill?.global_tool_names.join(', ') || '无'}</div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">卡片：{activeSkill?.card_types.join(', ') || '无'}</div>
                </div>
              )}
              {kind === 'cards' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">来源：{activeCard?.source_kind}</div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">来源名称：{activeCard?.source_name}</div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm text-slate-300">绑定：{activeCard?.binding}</div>
                </div>
              )}
              <pre className="overflow-x-auto rounded-[24px] border border-white/8 bg-slate-950/70 p-4 text-xs leading-6 text-slate-300">{formatJson(selected)}</pre>
            </div>
          )}
        </section>
      </div>
    )
  }

  const renderChat = () => (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-h-[72vh] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl">
        <ChatPanel {...chat} appName={profile.ui.app_name} appSubtitle={profile.ui.app_subtitle} welcomeTitle={profile.ui.welcome_title} welcomeDescription={profile.ui.welcome_description} quickActions={profile.ui.quick_actions} highlights={profile.ui.highlights} selectedIdentityPrefix={profile.ui.selected_identity_prefix} />
      </div>
      <section className="space-y-4 rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.64)] p-5 backdrop-blur-xl">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Runtime</div>
          <div className="mt-2 text-lg font-semibold text-white">联调上下文</div>
        </div>
        <label className="space-y-2 text-sm text-slate-300">
          <span>当前 Agent</span>
          <select value={chat.agentId} onChange={e => chat.setAgentId(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none">
            {agents.map(item => <option key={item.agent_id} value={item.agent_id}>{item.name || item.agent_id}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>演示身份</span>
          <input value={chat.phone} onChange={e => chat.setPhone(e.target.value)} placeholder="可选，联调使用" className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none" />
        </label>
        <div className="rounded-2xl border border-white/8 bg-white/5 p-4 text-sm leading-6 text-slate-300">
          <div>会话 ID：{chat.sessionId || '未开始'}</div>
          <div>消息数：{chat.messages.length}</div>
          <div>模型状态：{consoleData.modelConfig.has_api_key ? '可调用' : '未配置密钥'}</div>
        </div>
      </section>
    </div>
  )

  const renderSessions = () => (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.64)] p-4 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
          <span>SQLite 会话记录</span>
          <button onClick={() => void consoleData.refreshSessions()} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/8"><RefreshCw size={12} className="inline-block" /> 刷新</button>
        </div>
        <div className="space-y-3">
          {consoleData.sessions.map(item => (
            <button key={item.id} onClick={() => void consoleData.selectSession(item.id)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${consoleData.selectedSessionId === item.id ? 'border-cyan-300/70 bg-cyan-400/10' : 'border-white/8 bg-white/5 hover:bg-white/9'}`}>
              <div className="text-sm font-medium text-white">{item.title || item.id}</div>
              <div className="mt-1 text-xs text-slate-400">{formatTime(item.created_at)}</div>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.64)] p-6 backdrop-blur-xl">
        {!consoleData.selectedSessionId && <div className="text-sm text-slate-400">请选择一条会话记录。</div>}
        {consoleData.selectedSessionId && (
          <div className="space-y-4">
            {consoleData.sessionMessages.map(item => (
              <div key={item.id} className="rounded-[24px] border border-white/8 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>{item.role} · {item.agent || 'default'} · {item.model || '—'}</span>
                  <span>{formatTime(item.created_at)}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {item.parts.map((part, index) => (
                    <div key={`${item.id}-${index}`} className="rounded-2xl border border-white/8 bg-slate-950/60 p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/72">{part.type}</div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{part.content || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06111d] text-white" style={{ fontFamily: '"Segoe UI Variable Display", "Bahnschrift", "PingFang SC", sans-serif' }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,211,255,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(42,94,255,0.18),transparent_26%),linear-gradient(180deg,#06111d_0%,#0b1a2d_100%)]" />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[280px] border-r border-white/8 bg-[rgba(5,12,23,0.82)] p-6 backdrop-blur-xl lg:block">
          <div>
            <div className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">CSAgent Platform</div>
            <div className="mt-3 text-3xl font-semibold leading-tight text-white">平台控制台</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">模型、智能体、工具、技能、卡片、对话与记录的统一入口。</div>
          </div>
          <div className="mt-8 space-y-2">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon
              const active = item.key === tab
              return (
                <button key={item.key} onClick={() => setTab(item.key)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${active ? 'bg-cyan-400 text-slate-950' : 'bg-white/4 text-slate-200 hover:bg-white/8'}`}>
                  <Icon size={18} />
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className={`text-xs ${active ? 'text-slate-900/72' : 'text-slate-400'}`}>{item.hint}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="mt-8 grid gap-3">
            {[
              ['Models Ready', String(consoleData.stats.modelsReady)],
              ['Agents', String(consoleData.stats.agents)],
              ['Tools', String(consoleData.stats.tools)],
              ['Skills', String(consoleData.stats.skills)],
              ['Cards', String(consoleData.stats.cards)],
              ['Sessions', String(consoleData.stats.sessions)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </aside>
        <main className="relative flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-[1700px]">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/6 px-6 py-5 backdrop-blur-xl">
              <div>
                <div className="text-xs uppercase tracking-[0.26em] text-cyan-300/70">Workspace</div>
                <h1 className="mt-2 text-3xl font-semibold text-white">{headerTitle}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2"><Clock3 size={14} /> SQLite 存储</span>
                  <span className="inline-flex items-center gap-2"><Cable size={14} /> Registry Driven</span>
                  <span className="inline-flex items-center gap-2"><LayoutDashboard size={14} /> 当前 Agent：{activeAgent?.name || '—'}</span>
                </div>
              </div>
              <button onClick={() => { void consoleData.refreshModelConfig(); void consoleData.refreshSessions() }} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/8">刷新控制面数据</button>
            </header>
            <div className="mb-5 flex gap-2 overflow-x-auto rounded-[24px] border border-white/8 bg-white/5 p-2 backdrop-blur-xl lg:hidden">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon
                const active = item.key === tab
                return (
                  <button key={item.key} onClick={() => setTab(item.key)} className={`inline-flex min-w-max items-center gap-2 rounded-2xl px-4 py-3 text-sm transition ${active ? 'bg-cyan-400 text-slate-950' : 'bg-white/4 text-slate-200 hover:bg-white/8'}`}>
                    <Icon size={16} />
                    {item.label}
                  </button>
                )
              })}
            </div>
            {tab === 'models' && renderModels()}
            {tab === 'agents' && renderRegistry('agents')}
            {tab === 'tools' && renderRegistry('tools')}
            {tab === 'skills' && renderRegistry('skills')}
            {tab === 'cards' && renderRegistry('cards')}
            {tab === 'chat' && renderChat()}
            {tab === 'sessions' && renderSessions()}
            {tab === 'studio' && (
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl">
                <FrameworkStudioPanel profile={profile} info={info} loading={loading} saving={saving} error={error} selectedIdentity={chat.phone} onSelectIdentity={chat.setPhone} onSave={saveProfile} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
