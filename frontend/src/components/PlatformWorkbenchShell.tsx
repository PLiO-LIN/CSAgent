import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Bot, Brain, ChevronRight, Cpu, LayoutDashboard, Plus, RefreshCw, Save, SendHorizontal, Sparkles, Trash2, Upload, Wrench } from 'lucide-react'
import ChatWorkspace from './ChatWorkspace'
import CardRenderer from './CardRenderer'
import { MODEL_VENDOR_TYPE_OPTIONS, getModelVendorPreset, usePlatformConsole, type AgentApiDocsRecord, type AgentApiKeyRecord, type McpProbeResult, type ModelCatalogModel, type ModelCatalogVendor, type ModelProbeResult, type UsageTrendPoint, type VendorUsageStats } from '../hooks/usePlatformConsole'
import { type UseChatController } from '../hooks/useChat'
import { type FrameworkInfo, type FrameworkProfile } from '../hooks/useFrameworkProfile'
import { resolveChatActionInput } from '../lib/chatDisplay'
import {
  type AgentToolArgBindingFormField,
  type AgentVariableFormField,
  agentFormToPayload,
  cardCollectionFormToPayload,
  cardTemplateFormToPayload,
  createAgentForm,
  createCardCollectionForm,
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

function createVendorCreateDraft(vendorType = MODEL_VENDOR_TYPE_OPTIONS[0]?.vendor_type || 'siliconflow') {
  const preset = getModelVendorPreset(vendorType) || MODEL_VENDOR_TYPE_OPTIONS[0] || null
  return {
    vendor_type: String(preset?.vendor_type || vendorType || 'siliconflow'),
    vendor_id: String(preset?.vendor_id || vendorType || 'siliconflow'),
    display_name: String(preset?.display_name || ''),
    base_url: String(preset?.base_url || ''),
    enabled: true,
  }
}

const EMPTY_MODEL_CREATE_DRAFT = { model_id: '', display_name: '', chat_model: '', enabled: true, input_cost_per_mtokens: null as number | null, output_cost_per_mtokens: null as number | null }

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function formatTime(value: number) {
  if (!value) return '--'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function getVendorVisualMeta(vendorTypeOrId: unknown) {
  const vendorType = getModelVendorPreset(vendorTypeOrId)?.vendor_type || String(vendorTypeOrId || 'siliconflow')
  if (vendorType === 'openai_completion') {
    return { mark: 'OA', gradient: 'from-slate-900 via-slate-700 to-emerald-500', ring: 'ring-slate-200', text: 'text-slate-700' }
  }
  if (vendorType === 'aliyun_bailian') {
    return { mark: 'AL', gradient: 'from-orange-400 via-amber-500 to-yellow-500', ring: 'ring-orange-100', text: 'text-orange-700' }
  }
  if (vendorType === 'deepseek') {
    return { mark: 'DS', gradient: 'from-sky-500 via-cyan-500 to-indigo-600', ring: 'ring-sky-100', text: 'text-sky-700' }
  }
  return { mark: 'SF', gradient: 'from-emerald-400 via-teal-500 to-cyan-500', ring: 'ring-emerald-100', text: 'text-emerald-700' }
}

function VendorLogo({ vendorTypeOrId, size = 'md' }: { vendorTypeOrId: unknown; size?: 'sm' | 'md' | 'lg' }) {
  const meta = getVendorVisualMeta(vendorTypeOrId)
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-base' : size === 'sm' ? 'h-9 w-9 text-[11px]' : 'h-11 w-11 text-xs'
  return (
    <span className={cx('inline-flex items-center justify-center rounded-2xl bg-gradient-to-br font-semibold tracking-[0.08em] text-white shadow-[0_12px_30px_rgba(15,23,42,0.12)] ring-4', meta.gradient, meta.ring, sizeClass)}>
      {meta.mark}
    </span>
  )
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cx('rounded-full border px-3 py-1.5 text-xs transition', active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600')}>
      {children}
    </button>
  )
}

function ResourceList<T>({
  title,
  items,
  selectedKey,
  onSelect,
  onNew,
  getKey,
  getTitle,
  getMeta,
  newLabel,
}: {
  title: string
  items: T[]
  selectedKey: string
  onSelect: (key: string) => void
  onNew?: () => void
  getKey: (item: T) => string
  getTitle: (item: T) => string
  getMeta?: (item: T) => string
  newLabel?: string
}) {
  return (
    <Surface className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">选择已有条目，或新建一个继续配置。</div>
        </div>
        {onNew && (
          <button onClick={onNew} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
            <Plus size={14} />
            {newLabel || '新建'}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const key = getKey(item)
          const active = key === selectedKey
          return (
            <button key={key} onClick={() => onSelect(key)} className={cx('w-full rounded-2xl border px-4 py-3 text-left transition', active ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-100 hover:bg-emerald-50/40')}>
              <div className="text-sm font-medium text-slate-900">{getTitle(item)}</div>
              {getMeta && <div className="mt-1 text-xs text-slate-500">{getMeta(item)}</div>}
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

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const INTEGER_FORMATTER = new Intl.NumberFormat('zh-CN')

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function parseNullableNumberInput(value: string) {
  const text = String(value || '').trim()
  if (!text) return null
  const next = Number(text)
  return Number.isFinite(next) ? next : null
}

function formatCompactMetric(value: number) {
  return COMPACT_NUMBER_FORMATTER.format(Number(value || 0))
}

function trimMetricNumber(value: number, digits: number) {
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function formatTokenMetric(value: number) {
  const next = Number(value || 0)
  const abs = Math.abs(next)
  if (!abs) return '0K'
  if (abs >= 10000) {
    const scaled = next / 1000000
    return `${trimMetricNumber(scaled, Math.abs(scaled) >= 1 ? 2 : 3)}M`
  }
  const scaled = next / 1000
  return `${trimMetricNumber(scaled, Math.abs(scaled) >= 10 ? 1 : 2)}K`
}

function formatInteger(value: number) {
  return INTEGER_FORMATTER.format(Math.round(Number(value || 0)))
}

function formatPercent(value: number) {
  const next = Number(value || 0)
  return `${next.toFixed(next > 0 && next < 10 ? 1 : 0)}%`
}

function formatCurrency(value: number) {
  const next = Number(value || 0)
  if (!next) return '¥0.00'
  if (Math.abs(next) >= 1000) return `¥${formatCompactMetric(next)}`
  if (Math.abs(next) >= 100) return `¥${next.toFixed(0)}`
  if (Math.abs(next) >= 10) return `¥${next.toFixed(1)}`
  return `¥${next.toFixed(2)}`
}

function formatCostPerM(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Not set'
  const next = Number(value)
  if (!Number.isFinite(next)) return 'Not set'
  return `¥${next.toFixed(next >= 10 ? 2 : next >= 1 ? 3 : 4)}/M`
}

function formatLatency(value: number) {
  const next = Math.round(Number(value || 0))
  return next > 0 ? `${formatInteger(next)} ms` : '--'
}

function buildChartPoints(values: number[], width: number, height: number, padding = 18) {
  const safeValues = values.map(item => (Number.isFinite(item) ? Number(item) : 0))
  const maxValue = Math.max(...safeValues, 1)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2
  const step = safeValues.length > 1 ? usableWidth / (safeValues.length - 1) : 0
  return safeValues.map((value, index) => ({
    x: padding + step * index,
    y: height - padding - (value / maxValue) * usableHeight,
    value,
  }))
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildAreaPath(points: Array<{ x: number; y: number }>, height: number, padding = 18) {
  if (!points.length) return ''
  return `${buildLinePath(points)} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
}

function MetricCard({ label, value, hint, accent = 'emerald' }: { label: string; value: string; hint?: string; accent?: 'emerald' | 'sky' | 'violet' | 'amber' }) {
  const accentClass = {
    emerald: 'from-emerald-500/10 via-emerald-50 to-white text-emerald-700',
    sky: 'from-sky-500/10 via-sky-50 to-white text-sky-700',
    violet: 'from-violet-500/10 via-violet-50 to-white text-violet-700',
    amber: 'from-amber-500/10 via-amber-50 to-white text-amber-700',
  }[accent]
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <div className={cx('inline-flex rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-medium', accentClass)}>{label}</div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-2 text-sm text-slate-500">{hint}</div>}
    </div>
  )
}

function RingMeter({ label, value, helper, color = '#10b981' }: { label: string; value: number; helper?: string; color?: string }) {
  const progress = clamp(value)
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <div className="mt-5 flex items-center gap-5">
        <div className="relative h-24 w-24 rounded-full" style={{ background: `conic-gradient(${color} ${progress * 3.6}deg, #e2e8f0 0deg)` }}>
          <div className="absolute inset-[10px] rounded-full bg-white" />
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-900">{formatPercent(progress)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm text-slate-600">当前调用表现</div>
          {helper && <div className="mt-1 text-xs leading-5 text-slate-500">{helper}</div>}
        </div>
      </div>
    </div>
  )
}

function RatioBar({ value, maxValue, tone = 'emerald' }: { value: number; maxValue: number; tone?: 'emerald' | 'sky' | 'violet' | 'amber' }) {
  const percent = maxValue > 0 ? Math.max((value / maxValue) * 100, 3) : 0
  const toneClass = {
    emerald: 'from-emerald-400 to-emerald-500',
    sky: 'from-sky-400 to-sky-500',
    violet: 'from-violet-400 to-violet-500',
    amber: 'from-amber-400 to-amber-500',
  }[tone]
  return (
    <div className="h-2 rounded-full bg-slate-100">
      <div className={cx('h-2 rounded-full bg-gradient-to-r transition-all', toneClass)} style={{ width: `${clamp(percent, 0, 100)}%` }} />
    </div>
  )
}

function AreaTrendChart({
  title,
  subtitle,
  points,
  getValue,
  valueFormatter,
  gradientId,
  stroke = '#10b981',
}: {
  title: string
  subtitle?: string
  points: UsageTrendPoint[]
  getValue?: (point: UsageTrendPoint) => number
  valueFormatter: (value: number) => string
  gradientId: string
  stroke?: string
}) {
  const width = 640
  const height = 220
  const resolveValue = getValue || ((point: UsageTrendPoint) => Number(point.total_calls || 0))
  const values = points.map(item => Number(resolveValue(item) || 0))
  const coordinates = buildChartPoints(values, width, height)
  const linePath = buildLinePath(coordinates)
  const areaPath = buildAreaPath(coordinates, height)
  const peakValue = Math.max(...values, 0)

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">峰值 {valueFormatter(peakValue)}</div>
      </div>
      <div className="mt-6">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coordinates.map((point, index) => (
            <g key={`${points[index]?.date || index}-point`}>
              <circle cx={point.x} cy={point.y} r="4" fill="white" stroke={stroke} strokeWidth="2" />
            </g>
          ))}
        </svg>
        <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[11px] text-slate-400">
          {points.map(point => (
            <div key={point.date}>{point.label}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RankingList({
  title,
  items,
  valueFormatter,
  highlightKey = '',
}: {
  title: string
  items: Array<{ key: string; label: string; value: number; meta?: string }>
  valueFormatter: (value: number) => string
  highlightKey?: string
}) {
  const maxValue = Math.max(...items.map(item => item.value), 1)
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="mt-5 space-y-4">
        {items.map(item => {
          const active = item.key === highlightKey
          return (
            <div key={item.key} className={cx('rounded-2xl border p-4 transition', active ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-[#fbfefd]')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{item.label}</div>
                  {item.meta && <div className="mt-1 truncate text-xs text-slate-500">{item.meta}</div>}
                </div>
                <div className="text-sm font-semibold text-slate-700">{valueFormatter(item.value)}</div>
              </div>
              <div className="mt-3">
                <RatioBar value={item.value} maxValue={maxValue} tone={active ? 'emerald' : 'sky'} />
              </div>
            </div>
          )
        })}
        {!items.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">暂无统计数据。</div>}
      </div>
    </div>
  )
}

function TokenSplitCard({ inputTokens, outputTokens, title, subtitle }: { inputTokens: number; outputTokens: number; title: string; subtitle?: string }) {
  const total = inputTokens + outputTokens
  const inputRatio = total > 0 ? (inputTokens / total) * 100 : 0
  const outputRatio = total > 0 ? (outputTokens / total) * 100 : 0
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      <div className="mt-6 overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          <div className="bg-emerald-400" style={{ width: `${clamp(inputRatio, 0, 100)}%` }} />
          <div className="bg-sky-400" style={{ width: `${clamp(outputRatio, 0, 100)}%` }} />
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">Input</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatTokenMetric(inputTokens)}</div>
          <div className="mt-1 text-xs text-slate-500">{formatPercent(inputRatio)} · {formatTokenMetric(inputTokens)}</div>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-sky-700">Output</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatTokenMetric(outputTokens)}</div>
          <div className="mt-1 text-xs text-slate-500">{formatPercent(outputRatio)} · {formatTokenMetric(outputTokens)}</div>
        </div>
      </div>
    </div>
  )
}

function resolveVendorModelUsage(vendor: VendorUsageStats | null | undefined, model: Pick<ModelCatalogModel, 'model_id' | 'chat_model'> | null | undefined) {
  if (!vendor || !model) return null
  return vendor.models.find(item => item.model_id === model.model_id || item.chat_model === model.chat_model || item.model_id === model.chat_model) || null
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
  const [cardCollectionId, setCardCollectionId] = useState('')
  const [cardsMode, setCardsMode] = useState<'templates' | 'bindings'>('templates')
  const [cardTemplateId, setCardTemplateId] = useState('')
  const [cardCollectionEditorId, setCardCollectionEditorId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [selectedModelStatsId, setSelectedModelStatsId] = useState('')
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
  const [modelCreateVendorId, setModelCreateVendorId] = useState('')
  const [mcpMetaDraft, setMcpMetaDraft] = useState({ enabled: false, tool_timeout_seconds: 60 })
  const [vendorCreateDraft, setVendorCreateDraft] = useState(createVendorCreateDraft())
  const [modelCreateDraft, setModelCreateDraft] = useState(EMPTY_MODEL_CREATE_DRAFT)
  const [agentForm, setAgentForm] = useState(createAgentForm())
  const [toolForm, setToolForm] = useState(createToolForm())
  const [skillForm, setSkillForm] = useState(createSkillForm())
  const [skillGenerateDraft, setSkillGenerateDraft] = useState({ model_vendor_id: '', model_id: '' })
  const [skillGenerating, setSkillGenerating] = useState(false)
  const [skillGenerateStatus, setSkillGenerateStatus] = useState('')
  const skillGenerateAbortRef = useRef<AbortController | null>(null)
  const [cardCollectionForm, setCardCollectionForm] = useState(createCardCollectionForm())
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
  const [agentApiDialogOpen, setAgentApiDialogOpen] = useState(false)
  const [agentApiOwnerId, setAgentApiOwnerId] = useState('')
  const [agentApiDocs, setAgentApiDocs] = useState<AgentApiDocsRecord | null>(null)
  const [agentApiKeys, setAgentApiKeys] = useState<AgentApiKeyRecord[]>([])
  const [agentApiKeyName, setAgentApiKeyName] = useState('')
  const [agentApiCreatedKey, setAgentApiCreatedKey] = useState('')
  const [agentApiLoading, setAgentApiLoading] = useState(false)
  const [vendorCreateDialogOpen, setVendorCreateDialogOpen] = useState(false)
  const [modelCreateDialogOpen, setModelCreateDialogOpen] = useState(false)
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [agentEditorOpen, setAgentEditorOpen] = useState(false)
  const [toolEditorOpen, setToolEditorOpen] = useState(false)
  const [mcpServerDialogOpen, setMcpServerDialogOpen] = useState(false)
  const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const [cardCollectionDialogOpen, setCardCollectionDialogOpen] = useState(false)
  const [cardTemplateDialogOpen, setCardTemplateDialogOpen] = useState(false)
  const [cardBindingDialogOpen, setCardBindingDialogOpen] = useState(false)

  const agents = consoleData.agents
  const tools = consoleData.tools
  const skills = consoleData.skills
  const cardCollections = consoleData.cardCollections
  const cardTemplates = consoleData.cardTemplates
  const selectedAgent = agents.find(item => item.agent_id === agentId) || null
  const selectedTool = tools.find(item => item.tool_name === toolName) || null
  const selectedSkill = skills.find(item => item.skill_name === skillName) || null
  const selectedCardCollection = cardCollections.find(item => item.collection_id === cardCollectionId) || cardCollections[0] || null
  const selectedCard = consoleData.cardCatalog.find(item => item.id === cardId) || null
  const selectedCardTemplate = cardTemplates.find(item => item.template_id === cardTemplateId) || null
  const editingCardCollection = cardCollections.find(item => item.collection_id === cardCollectionEditorId) || null
  const cardTemplateCountByCollection = useMemo(() => {
    const next = new Map<string, number>()
    for (const item of cardTemplates) {
      const key = String(item.collection_id || 'default').trim() || 'default'
      next.set(key, (next.get(key) || 0) + 1)
    }
    return next
  }, [cardTemplates])
  const cardTemplateGallery = useMemo(
    () => cardTemplates.map(item => ({
      template: item,
      previewCard: buildTemplatePreviewCard(item as Record<string, any>),
    })),
    [cardTemplates],
  )
  const filteredCardTemplateGallery = useMemo(
    () => selectedCardCollection ? cardTemplateGallery.filter(item => item.template.collection_id === selectedCardCollection.collection_id) : cardTemplateGallery,
    [cardTemplateGallery, selectedCardCollection],
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
  const skillGenerateVendor = consoleData.modelConfig.vendors.find(item => item.vendor_id === skillGenerateDraft.model_vendor_id) || consoleData.modelConfig.vendors[0] || null
  const skillGenerateModel = skillGenerateVendor?.models.find(item => item.model_id === skillGenerateDraft.model_id) || skillGenerateVendor?.models[0] || null
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
  const allUsageModels = useMemo(() => (
    consoleData.usageStats.vendors.flatMap(vendor =>
      vendor.models.map(model => ({
        ...model,
        vendor_id: vendor.vendor_id,
        vendor_display_name: vendor.display_name,
        base_url: vendor.base_url,
      })),
    )
  ), [consoleData.usageStats.vendors])
  const selectedUsageVendor = useMemo(() => {
    const preferredVendorId = vendorId || selectedVendor?.vendor_id || modelDraft.active_vendor
    if (preferredVendorId) {
      return consoleData.usageStats.vendors.find(item => item.vendor_id === preferredVendorId) || null
    }
    const firstDraftVendorId = modelDraft.vendors[0]?.vendor_id || ''
    if (firstDraftVendorId) {
      return consoleData.usageStats.vendors.find(item => item.vendor_id === firstDraftVendorId) || null
    }
    return consoleData.usageStats.vendors[0] || null
  }, [consoleData.usageStats.vendors, modelDraft.active_vendor, modelDraft.vendors, selectedVendor?.vendor_id, vendorId])
  const selectedModelUsage = useMemo(() => {
    if (!selectedUsageVendor) return null
    const candidates = [
      selectedModelStatsId,
      selectedVendor?.models.find(item => item.model_id === selectedModelStatsId)?.chat_model || '',
      selectedUsageVendor.vendor_id === modelDraft.active_vendor ? modelDraft.active_model : '',
      selectedVendor?.models[0]?.model_id || '',
      selectedUsageVendor.models[0]?.model_id || '',
    ].filter(Boolean)
    for (const candidate of candidates) {
      const matched = selectedUsageVendor.models.find(item => item.model_id === candidate || item.chat_model === candidate)
      if (matched) return matched
    }
    return selectedUsageVendor.models[0] || null
  }, [modelDraft.active_model, modelDraft.active_vendor, selectedModelStatsId, selectedUsageVendor, selectedVendor])
  const topUsageVendors = useMemo(() => (
    [...consoleData.usageStats.vendors].sort((left, right) => right.total_calls - left.total_calls).slice(0, 5)
  ), [consoleData.usageStats.vendors])
  const topUsageModels = useMemo(() => (
    [...allUsageModels].sort((left, right) => right.total_calls - left.total_calls).slice(0, 6)
  ), [allUsageModels])
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
  const agentSessionCountMap = useMemo(() => {
    const next = new Map<string, number>()
    for (const session of consoleData.sessions) {
      const owner = String(session.agent_id || '').trim()
      if (!owner) continue
      next.set(owner, (next.get(owner) || 0) + 1)
    }
    return next
  }, [consoleData.sessions])

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
    setSelectedModelStatsId(nextDraft.active_model || nextDraft.vendors[0]?.models[0]?.model_id || '')
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
    await consoleData.refreshUsageStats()
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
    if (!selectedUsageVendor) {
      if (selectedModelStatsId) setSelectedModelStatsId('')
      return
    }
    if (!selectedUsageVendor.models.length) {
      if (selectedModelStatsId) setSelectedModelStatsId('')
      return
    }
    if (selectedModelStatsId && selectedUsageVendor.models.some(item => item.model_id === selectedModelStatsId || item.chat_model === selectedModelStatsId)) {
      return
    }
    setSelectedModelStatsId(selectedUsageVendor.models[0]?.model_id || '')
  }, [selectedModelStatsId, selectedUsageVendor])

  useEffect(() => {
    if (!mcpServerName && mcpServerNames[0]) setMcpServerName(mcpServerNames[0])
  }, [mcpServerName, mcpServerNames])

  useEffect(() => {
    setMcpMetaDraft({
      enabled: Boolean(consoleData.mcpConfig.enabled),
      tool_timeout_seconds: Number(consoleData.mcpConfig.tool_timeout_seconds || 60),
    })
  }, [consoleData.mcpConfig.enabled, consoleData.mcpConfig.tool_timeout_seconds])

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
    const preferredVendor = consoleData.modelConfig.vendors.find(item => item.vendor_id === skillGenerateDraft.model_vendor_id)
      || consoleData.modelConfig.vendors.find(item => item.vendor_id === consoleData.modelConfig.active_vendor)
      || consoleData.modelConfig.vendors[0]
      || null
    const nextVendorId = preferredVendor?.vendor_id || ''
    const nextModelId = preferredVendor?.models.some(item => item.model_id === skillGenerateDraft.model_id)
      ? skillGenerateDraft.model_id
      : (nextVendorId === consoleData.modelConfig.active_vendor ? consoleData.modelConfig.active_model : (preferredVendor?.models.find(item => item.enabled)?.model_id || preferredVendor?.models[0]?.model_id || ''))
    if (skillGenerateDraft.model_vendor_id === nextVendorId && skillGenerateDraft.model_id === nextModelId) return
    setSkillGenerateDraft({ model_vendor_id: nextVendorId, model_id: nextModelId })
  }, [consoleData.modelConfig.active_model, consoleData.modelConfig.active_vendor, consoleData.modelConfig.vendors, skillGenerateDraft.model_id, skillGenerateDraft.model_vendor_id])

  useEffect(() => {
    const nextCollectionId = cardCollections.some(item => item.collection_id === cardCollectionId)
      ? cardCollectionId
      : (cardCollections[0]?.collection_id || '')
    if (nextCollectionId === cardCollectionId) return
    setCardCollectionId(nextCollectionId)
  }, [cardCollectionId, cardCollections])

  useEffect(() => {
    const next = cardCollectionEditorId === NEW_KEY
      ? createCardCollectionForm({ enabled: true })
      : createCardCollectionForm(editingCardCollection || undefined)
    setCardCollectionForm(next)
  }, [cardCollectionEditorId, editingCardCollection])

  useEffect(() => {
    const next = cardTemplateId === NEW_KEY
      ? createCardTemplateForm({
        collection_id: selectedCardCollection?.collection_id || cardCollections[0]?.collection_id || 'default',
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
        sample_payload: { title: '示例标题', summary: '示例摘要', fields: [] },
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
  }, [cardCollections, cardTemplateId, selectedCardCollection?.collection_id, selectedCardTemplate])

  useEffect(() => {
    if (cardTemplateDialogOpen || cardTemplateId === NEW_KEY) return
    const visibleIds = new Set(filteredCardTemplateGallery.map(item => item.template.template_id))
    if (cardTemplateId && visibleIds.has(cardTemplateId)) return
    const nextTemplateId = filteredCardTemplateGallery[0]?.template.template_id || ''
    if (nextTemplateId === cardTemplateId) return
    setCardTemplateId(nextTemplateId)
  }, [cardTemplateDialogOpen, cardTemplateId, filteredCardTemplateGallery])

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
    if (skillEditorOpen) return
    if (skillGenerateAbortRef.current) {
      skillGenerateAbortRef.current.abort()
      skillGenerateAbortRef.current = null
    }
    if (skillGenerating) setSkillGenerating(false)
    if (skillGenerateStatus) setSkillGenerateStatus('')
  }, [skillEditorOpen, skillGenerating, skillGenerateStatus])

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

  const stopSkillGeneration = () => {
    skillGenerateAbortRef.current?.abort()
    skillGenerateAbortRef.current = null
    setSkillGenerating(false)
    setSkillGenerateStatus('已停止生成')
  }

  const generateSkillWithModel = async () => {
    const skillKey = String(skillForm.skill_name || '').trim()
    const toolNames = (skillForm.tool_names || []).map(item => item.trim()).filter(Boolean)
    const vendorKey = String(skillGenerateDraft.model_vendor_id || '').trim()
    const modelKey = String(skillGenerateDraft.model_id || '').trim()
    if (!skillKey) throw new Error('请先填写技能名')
    if (!toolNames.length) throw new Error('请至少绑定一个工具')
    if (!vendorKey || !modelKey) throw new Error('请选择生成模型')

    skillGenerateAbortRef.current?.abort()
    const controller = new AbortController()
    skillGenerateAbortRef.current = controller
    setActionError('')
    setBanner('')
    setSkillGenerating(true)
    setSkillGenerateStatus('正在开始生成...')
    setSkillForm(prev => ({ ...prev, summary: '', document_md: '' }))

    try {
      const done = await consoleData.streamSkillGeneration({
        skill_name: skillKey,
        display_name: skillForm.display_name,
        tool_names: toolNames,
        model_vendor_id: vendorKey,
        model_id: modelKey,
        current_summary: skillForm.summary,
        current_document_md: skillForm.document_md,
      }, {
        signal: controller.signal,
        onEvent: event => {
          if (event.type === 'meta') {
            setSkillGenerateStatus(`正在使用 ${event.model_id || modelKey} 生成技能`)
            return
          }
          if (event.type === 'summary_delta') {
            setSkillForm(prev => ({ ...prev, summary: `${prev.summary}${event.content || ''}` }))
            return
          }
          if (event.type === 'document_delta') {
            setSkillForm(prev => ({ ...prev, document_md: `${prev.document_md}${event.content || ''}` }))
            return
          }
          if (event.type === 'summary_replace') {
            setSkillForm(prev => ({ ...prev, summary: event.summary || '' }))
            return
          }
          if (event.type === 'document_replace') {
            setSkillForm(prev => ({ ...prev, document_md: event.document_md || '' }))
          }
        },
      }) as { summary?: string; document_md?: string } | null
      if (done?.summary || done?.document_md) {
        setSkillForm(prev => ({
          ...prev,
          summary: done?.summary || prev.summary,
          document_md: done?.document_md || prev.document_md,
        }))
      }
      setSkillGenerateStatus('生成完成，可继续编辑后再保存')
      setBanner('技能摘要和正文已生成')
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setSkillGenerateStatus('已停止生成')
        return
      }
      const message = err?.message || '技能生成失败'
      setActionError(message)
      setSkillGenerateStatus(message)
    } finally {
      if (skillGenerateAbortRef.current === controller) {
        skillGenerateAbortRef.current = null
      }
      setSkillGenerating(false)
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

  const focusModelAnalytics = (targetVendorId: string, targetModelId = '') => {
    const targetVendor = modelDraft.vendors.find(item => item.vendor_id === targetVendorId) || null
    focusVendor(targetVendorId)
    setSelectedModelStatsId(targetModelId || targetVendor?.models[0]?.model_id || '')
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

  const openVendorCreateDialog = () => {
    const nextPreset = MODEL_VENDOR_TYPE_OPTIONS.find(option => !modelDraft.vendors.some(item => (item.vendor_type || item.vendor_id) === option.vendor_type || item.vendor_id === option.vendor_id)) || MODEL_VENDOR_TYPE_OPTIONS[0]
    setVendorCreateDraft(createVendorCreateDraft(nextPreset?.vendor_type || 'siliconflow'))
    setVendorCreateDialogOpen(true)
  }

  const openModelCreateDialog = (targetVendorId: string) => {
    focusModelAnalytics(targetVendorId)
    setModelCreateDraft(EMPTY_MODEL_CREATE_DRAFT)
    setModelCreateVendorId(targetVendorId)
    setModelCreateDialogOpen(true)
  }

  const openModelEditor = (targetVendorId: string, targetModelId = '') => {
    focusModelAnalytics(targetVendorId, targetModelId)
    setModelProbeResult(null)
    setModelEditorOpen(true)
  }

  const openAgentEditor = (targetAgentId: string) => {
    setAgentId(targetAgentId)
    setAgentEditorOpen(true)
  }

  const openUrlInNewTab = (targetUrl: string) => {
    const url = String(targetUrl || '').trim()
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const copyText = async (value: string, success: string) => {
    const text = String(value || '').trim()
    if (!text) return
    await navigator.clipboard.writeText(text)
    setBanner(success)
  }

  const loadAgentApiData = async (targetAgentId: string) => {
    const id = String(targetAgentId || '').trim()
    if (!id) throw new Error('智能体 ID 不能为空')
    setAgentApiLoading(true)
    try {
      const [docs, keys] = await Promise.all([
        consoleData.getAgentApiDocs(id),
        consoleData.listAgentApiKeys(id),
      ])
      setAgentApiOwnerId(id)
      setAgentApiDocs(docs)
      setAgentApiKeys(keys)
      return { docs, keys }
    } finally {
      setAgentApiLoading(false)
    }
  }

  const openAgentApiDialog = async (targetAgentId: string) => {
    const id = String(targetAgentId || '').trim()
    if (!id) return
    setActionError('')
    setBanner('')
    setAgentApiCreatedKey('')
    setAgentApiKeyName('')
    setAgentApiOwnerId(id)
    setAgentApiDialogOpen(true)
    try {
      await loadAgentApiData(id)
    } catch (err: any) {
      setActionError(err?.message || '读取智能体 API 信息失败')
    }
  }

  const createAgentApiKey = async () => {
    const id = String(agentApiOwnerId || '').trim()
    if (!id) throw new Error('请先选择智能体')
    const result = await consoleData.createAgentApiKey(id, agentApiKeyName)
    setAgentApiCreatedKey(result.key || '')
    setAgentApiKeyName('')
    const nextKeys = await consoleData.listAgentApiKeys(id)
    setAgentApiKeys(nextKeys)
    setBanner('智能体 API Key 已创建，请立即复制保存')
  }

  const removeAgentApiKey = async (keyId: string) => {
    const id = String(agentApiOwnerId || '').trim()
    if (!id) throw new Error('请先选择智能体')
    await consoleData.deleteAgentApiKey(id, keyId)
    setAgentApiKeys(prev => prev.filter(item => item.key_id !== keyId))
    setBanner('智能体 API Key 已删除')
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
    setSkillGenerateStatus('')
    setSkillName(targetSkillName)
    setSkillEditorOpen(true)
  }

  const openCardCollectionDialog = (targetCollectionId: string) => {
    if (targetCollectionId !== NEW_KEY) setCardCollectionId(targetCollectionId)
    setCardCollectionEditorId(targetCollectionId)
    setCardCollectionDialogOpen(true)
  }

  const openCardTemplateDialog = (targetTemplateId: string) => {
    setCardTemplateId(targetTemplateId)
    setCardTemplateDialogOpen(true)
  }

  const openCardBindingDialog = (targetCardId: string) => {
    setCardId(targetCardId)
    setCardBindingDialogOpen(true)
  }

  const changeSkillGenerateVendor = (targetVendorId: string) => {
    const nextVendor = consoleData.modelConfig.vendors.find(item => item.vendor_id === targetVendorId) || null
    setSkillGenerateDraft({
      model_vendor_id: targetVendorId,
      model_id: nextVendor?.models.find(item => item.enabled)?.model_id || nextVendor?.models[0]?.model_id || '',
    })
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
    const vendorType = String(vendorCreateDraft.vendor_type || '').trim()
    const preset = getModelVendorPreset(vendorType)
    const vendorKey = String(vendorCreateDraft.vendor_id || preset?.vendor_id || vendorType).trim()
    if (!vendorType) throw new Error('请选择厂商类型')
    if (!vendorKey) throw new Error('厂商标识无效')
    if (modelDraft.vendors.some(item => item.vendor_id === vendorKey)) throw new Error('该厂商已存在')
    const nextVendor: ModelCatalogVendor = {
      vendor_id: vendorKey,
      vendor_type: String(preset?.vendor_type || vendorType || vendorKey),
      display_name: vendorCreateDraft.display_name.trim() || preset?.display_name || vendorKey,
      base_url: vendorCreateDraft.base_url.trim() || preset?.base_url || '',
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
    setVendorCreateDraft(createVendorCreateDraft())
  }

  const addVendorModel = async (targetVendorId = '') => {
    const ownerVendorId = String(targetVendorId || selectedVendor?.vendor_id || '').trim()
    if (!ownerVendorId) throw new Error('请先选择厂商')
    const ownerVendor = modelDraft.vendors.find(item => item.vendor_id === ownerVendorId) || null
    if (!ownerVendor) throw new Error('Target vendor does not exist')
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
          input_cost_per_mtokens: modelCreateDraft.input_cost_per_mtokens,
          output_cost_per_mtokens: modelCreateDraft.output_cost_per_mtokens,
        },
      ],
    })
    setModelDraft(prev => ({
      ...prev,
      active_vendor: prev.active_vendor || ownerVendor.vendor_id,
      active_model: prev.active_model || modelKey,
    }))
    setVendorId(ownerVendor.vendor_id)
    setSelectedModelStatsId(modelKey)
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
    setSelectedModelStatsId(currentVendor?.models[0]?.model_id || '')
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
    if (!targetName) throw new Error('MCP server name is required')
    const result = await consoleData.testMcpServer(targetName, buildMcpServerConfig())
    setMcpProbeResult(result)
    return result
  }

  const saveMcpServer = async () => {
    const targetName = mcpServerDraft.name.trim()
    if (!targetName) throw new Error('MCP server name is required')
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
    setBanner(`MCP 服务已连接，发现 ${probe.count} 个工具`)
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

  const renderOverview = () => {
    const summary = consoleData.usageStats.summary
    const trend = consoleData.usageStats.trend
    const pricedModelCount = modelDraft.vendors.reduce((count, vendor) => count + vendor.models.filter(model => model.input_cost_per_mtokens !== null || model.output_cost_per_mtokens !== null).length, 0)
    const trackedModelCount = allUsageModels.filter(item => item.total_calls > 0).length
    const callsToday = trend[trend.length - 1]?.total_calls || 0
    const costToday = trend[trend.length - 1]?.estimated_cost || 0
    const activeModelKey = `${activeModelDraft.vendor?.vendor_id || ''}:${activeModelDraft.model?.chat_model || activeModelDraft.model?.model_id || ''}`
    const generatedLabel = consoleData.usageStats.generated_at ? formatTime(consoleData.usageStats.generated_at) : '尚无调用记录'

    return (
      <div className="space-y-6">
        {consoleData.usageError && (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-800">
            {consoleData.usageError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="7天调用" value={formatCompactMetric(summary.total_calls)} hint={`成功率 ${formatPercent(summary.success_rate)} · 今日 ${formatInteger(callsToday)} 次`} accent="emerald" />
          <MetricCard label="Token 总量" value={formatTokenMetric(summary.total_tokens)} hint={`输入 ${formatTokenMetric(summary.total_input_tokens)} · 输出 ${formatTokenMetric(summary.total_output_tokens)}`} accent="sky" />
          <MetricCard label="预估成本" value={formatCurrency(summary.estimated_cost)} hint={`今日 ${formatCurrency(costToday)} · ${formatInteger(summary.unique_sessions)} 会话`} accent="violet" />
          <MetricCard label="平均延迟" value={formatLatency(summary.avg_latency_ms)} hint={`错误 ${formatInteger(summary.error_calls)} 次 · 更新时间 ${generatedLabel}`} accent="amber" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {overviewStats.map(item => (
            <button key={item.label} onClick={item.onClick} className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 text-left shadow-[0_12px_40px_rgba(15,23,42,0.04)] transition hover:border-emerald-200 hover:bg-emerald-50/40">
              <div className="text-sm text-slate-500">{item.label}</div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">{item.value}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
          <AreaTrendChart
            title="模型调用趋势"
            subtitle={`最近 ${summary.window_days} 天调用趋势`}
            points={trend}
            valueFormatter={formatCompactMetric}
            gradientId="overview-call-trend"
            stroke="#10b981"
          />

          <div className="grid gap-5">
            <RingMeter label="成功率" value={summary.success_rate} helper={`完成 ${formatInteger(summary.completed_calls)} · 错误 ${formatInteger(summary.error_calls)} · 平均延迟 ${formatLatency(summary.avg_latency_ms)}`} />
            <TokenSplitCard title="输入 / 输出分布" subtitle={`最近 ${summary.window_days} 天累计 token 结构`} inputTokens={summary.total_input_tokens} outputTokens={summary.total_output_tokens} />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <AreaTrendChart
            title="Token 用量趋势"
            subtitle="按天累计输入与输出 token，用于观察峰值与增长斜率"
            points={trend}
            getValue={point => point.total_tokens}
            valueFormatter={formatTokenMetric}
            gradientId="overview-token-trend"
            stroke="#0ea5e9"
          />

          <Surface className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">当前默认模型</div>
                <div className="mt-1 text-sm text-slate-500">默认模型会作为平台侧新建 Agent 的首选配置，价格字段也会参与调用成本估算。</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void consoleData.refreshUsageStats()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
                  <RefreshCw size={14} className={cx(consoleData.usageLoading && 'animate-spin')} />
                  刷新统计
                </button>
                <button onClick={() => setView('models')} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">进入模型页</button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">默认厂商</div>
                <div className="mt-3 flex items-center gap-3">
                  <VendorLogo vendorTypeOrId={activeModelDraft.vendor?.vendor_type || activeModelDraft.vendor?.vendor_id || 'siliconflow'} size="md" />
                  <div className="min-w-0">
                    <div className="text-xl font-semibold text-slate-900">{activeModelDraft.vendor?.display_name || '未选择'}</div>
                    <div className="mt-2 truncate text-sm text-slate-500">{activeModelDraft.base_url || '--'}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">默认模型</div>
                <div className="mt-3 text-xl font-semibold text-slate-900">{activeModelDraft.model?.display_name || '未选择'}</div>
                <div className="mt-2 truncate text-sm text-slate-500">{activeModelDraft.chat_model || '--'}</div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Input 单价</div>
                <div className="mt-3 text-xl font-semibold text-slate-900">{formatCostPerM(activeModelDraft.model?.input_cost_per_mtokens)}</div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Output 单价</div>
                <div className="mt-3 text-xl font-semibold text-slate-900">{formatCostPerM(activeModelDraft.model?.output_cost_per_mtokens)}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">已配置单价模型 {formatInteger(pricedModelCount)} 个</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">已有调用记录模型 {formatInteger(trackedModelCount)} 个</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">在线模型 {formatInteger(consoleData.stats.modelsReady)} 个</span>
            </div>
          </Surface>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <RankingList
            title="高频厂商"
            items={topUsageVendors.map(item => ({
              key: item.vendor_id,
              label: item.display_name || item.vendor_id,
              value: item.total_calls,
              meta: `${formatCurrency(item.estimated_cost)} · ${formatLatency(item.avg_latency_ms)}`,
            }))}
            valueFormatter={formatCompactMetric}
            highlightKey={activeModelDraft.vendor?.vendor_id || ''}
          />
          <RankingList
            title="高频模型"
            items={topUsageModels.map(item => ({
              key: `${item.vendor_id}:${item.chat_model || item.model_id}`,
              label: item.display_name || item.model_id,
              value: item.total_calls,
              meta: `${item.vendor_display_name} · ${formatCurrency(item.estimated_cost)}`,
            }))}
            valueFormatter={formatCompactMetric}
            highlightKey={activeModelKey}
          />
        </div>
      </div>
    )
  }

  const renderModels = () => {
    const pricedModelCount = modelDraft.vendors.reduce((count, vendor) => count + vendor.models.filter(model => model.input_cost_per_mtokens !== null || model.output_cost_per_mtokens !== null).length, 0)
    const selectedDraftModel = selectedVendor?.models.find(item => item.model_id === selectedModelStatsId || item.chat_model === selectedModelStatsId || item.model_id === selectedModelUsage?.model_id || item.chat_model === selectedModelUsage?.chat_model) || selectedVendor?.models[0] || null
    const currentModelUsage = resolveVendorModelUsage(selectedUsageVendor, selectedDraftModel) || selectedModelUsage
    const currentVendorId = selectedVendor?.vendor_id || selectedUsageVendor?.vendor_id || ''
    const currentModelId = selectedDraftModel?.model_id || ''
    const currentModelChatName = currentModelUsage?.chat_model || selectedDraftModel?.chat_model || ''
    const currentModelHighlightKey = `${selectedUsageVendor?.vendor_id || currentVendorId}:${currentModelUsage?.chat_model || currentModelUsage?.model_id || currentModelId}`

    return (
      <div className="space-y-6">
        {consoleData.usageError && (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-800">
            {consoleData.usageError}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Surface className="p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">厂商目录</div>
                <div className="mt-1 text-xs text-slate-500">左侧浏览厂商和模型，右侧聚焦查看调用表现与成本情况。</div>
              </div>
              <button onClick={openVendorCreateDialog} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
                <Plus size={14} />
                添加厂商
              </button>
            </div>

            <div className="space-y-3">
              {modelDraft.vendors.map(vendor => {
                const expanded = isVendorExpanded(vendor.vendor_id)
                const selected = selectedVendor?.vendor_id === vendor.vendor_id
                const vendorUsage = consoleData.usageStats.vendors.find(item => item.vendor_id === vendor.vendor_id) || null
                return (
                  <div key={vendor.vendor_id} className={cx('rounded-[24px] border p-4 transition', selected ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-[#fbfefd]')}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleVendorExpanded(vendor.vendor_id)} className="mt-0.5 rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600">
                        <ChevronRight size={14} className={cx('transition', expanded && 'rotate-90')} />
                      </button>
                      <button onClick={() => focusModelAnalytics(vendor.vendor_id)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <VendorLogo vendorTypeOrId={vendor.vendor_type || vendor.vendor_id} size="sm" />
                          <div className="text-sm font-medium text-slate-900">{vendor.display_name || vendor.vendor_id}</div>
                          {modelDraft.active_vendor === vendor.vendor_id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">默认厂商</span>}
                          {!vendor.enabled && <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] text-slate-600">已停用</span>}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">{vendor.base_url || vendor.vendor_id}</div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{formatCompactMetric(vendorUsage?.total_calls || 0)} 次调用</span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">成本 {formatCurrency(vendorUsage?.estimated_cost || 0)}</span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{vendor.models.length} 个模型</span>
                        </div>
                      </button>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => openModelCreateDialog(vendor.vendor_id)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
                          <Plus size={12} />添加模型
                        </button>
                        <button onClick={() => openModelEditor(vendor.vendor_id, vendor.models[0]?.model_id || '')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑</button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <div className="space-y-2">
                          {vendor.models.map(model => {
                            const modelUsage = resolveVendorModelUsage(vendorUsage, model)
                            const active = currentVendorId === vendor.vendor_id && (currentModelChatName === model.chat_model || currentModelId === model.model_id)
                            const hasPricing = model.input_cost_per_mtokens !== null || model.output_cost_per_mtokens !== null
                            return (
                              <button key={model.model_id} onClick={() => focusModelAnalytics(vendor.vendor_id, model.model_id)} className={cx('flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition', active ? 'border-emerald-200 bg-white shadow-[0_12px_32px_rgba(16,185,129,0.10)]' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40')}>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-sm font-medium text-slate-900">{model.display_name || model.model_id}</div>
                                    {modelDraft.active_vendor === vendor.vendor_id && modelDraft.active_model === model.model_id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">默认模型</span>}
                                    {hasPricing && <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-700">已配置单价</span>}
                                    {!model.enabled && <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] text-slate-600">已停用</span>}
                                  </div>
                                  <div className="mt-1 truncate text-xs text-slate-500">{model.chat_model || model.model_id}</div>
                                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                                    <span>{formatCompactMetric(modelUsage?.total_calls || 0)} 次调用</span>
                                    <span>{formatTokenMetric(modelUsage?.total_tokens || 0)} Token</span>
                                    <span>{formatLatency(modelUsage?.avg_latency_ms || 0)}</span>
                                  </div>
                                </div>
                                <div className="ml-3 text-right">
                                  <div className="text-sm font-semibold text-slate-700">{formatCurrency(modelUsage?.estimated_cost || 0)}</div>
                                  <div className="mt-1 text-[11px] text-slate-400">{formatTime(modelUsage?.last_called_at || 0)}</div>
                                </div>
                              </button>
                            )
                          })}
                          {!vendor.models.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">当前厂商还没有模型。</div>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Surface>

          <div className="space-y-5">
            <Surface className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <VendorLogo vendorTypeOrId={selectedVendor?.vendor_type || selectedUsageVendor?.vendor_id || 'siliconflow'} size="md" />
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{selectedUsageVendor?.display_name || selectedVendor?.display_name || '模型统计看板'}</div>
                    <div className="mt-1 text-sm text-slate-500">{`当前聚焦：${currentModelUsage?.display_name || selectedDraftModel?.display_name || '未选择模型'} · 用于查看调用次数、Tokens、成本与成功率。`}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void consoleData.refreshUsageStats()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">
                    <RefreshCw size={14} className={cx(consoleData.usageLoading && 'animate-spin')} />
                    刷新统计
                  </button>
                  <button onClick={() => openModelEditor(currentVendorId, currentModelId)} disabled={!currentVendorId} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40">编辑配置</button>
                  <button onClick={() => void runAction(saveModelCatalog, '模型目录已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存目录</button>
                  <button onClick={() => void runAction(async () => { await probeModelSelection(currentVendorId, currentModelId) }, '模型测试通过')} disabled={!currentVendorId || !currentModelId} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40"><Sparkles size={14} />测试连接</button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="模型调用" value={formatCompactMetric(currentModelUsage?.total_calls || 0)} hint={`会话 ${formatInteger(currentModelUsage?.unique_sessions || 0)}`} accent="emerald" />
                <MetricCard label="累计 Tokens" value={formatTokenMetric(currentModelUsage?.total_tokens || 0)} hint={`输入 ${formatTokenMetric(currentModelUsage?.total_input_tokens || 0)} · 输出 ${formatTokenMetric(currentModelUsage?.total_output_tokens || 0)}`} accent="sky" />
                <MetricCard label="预估成本" value={formatCurrency(currentModelUsage?.estimated_cost || 0)} hint={`Input ${formatCurrency(currentModelUsage?.input_estimated_cost || 0)} · Output ${formatCurrency(currentModelUsage?.output_estimated_cost || 0)}`} accent="violet" />
                <MetricCard label="平均延迟" value={formatLatency(currentModelUsage?.avg_latency_ms || 0)} hint={`成功率 ${formatPercent(currentModelUsage?.success_rate || 0)}`} accent="amber" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">厂商</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{selectedUsageVendor?.display_name || selectedVendor?.display_name || '--'}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{selectedUsageVendor?.base_url || selectedVendor?.base_url || '--'}</div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Chat Model</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{currentModelUsage?.chat_model || selectedDraftModel?.chat_model || '--'}</div>
                  <div className="mt-1 text-xs text-slate-500">最后调用：{formatTime(currentModelUsage?.last_called_at || 0)}</div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Input 单价</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{formatCostPerM(selectedDraftModel?.input_cost_per_mtokens)}</div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Output 单价</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{formatCostPerM(selectedDraftModel?.output_cost_per_mtokens)}</div>
                </div>
              </div>
            </Surface>

            <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
              <div className="grid gap-5">
                <RingMeter label="当前模型成功率" value={currentModelUsage?.success_rate || 0} helper={`完成 ${formatInteger(currentModelUsage?.completed_calls || 0)} · 错误 ${formatInteger(currentModelUsage?.error_calls || 0)}`} />
                <TokenSplitCard title="当前模型 Token 分布" subtitle="累计输入 / 输出 token 分布" inputTokens={currentModelUsage?.total_input_tokens || 0} outputTokens={currentModelUsage?.total_output_tokens || 0} />
              </div>

              <RankingList
                title={`${selectedUsageVendor?.display_name || selectedVendor?.display_name || '当前厂商'} · 模型热度`}
                items={(selectedUsageVendor?.models || []).map(item => ({
                  key: `${selectedUsageVendor?.vendor_id || ''}:${item.chat_model || item.model_id}`,
                  label: item.display_name || item.model_id,
                  value: item.total_calls,
                  meta: `${formatCurrency(item.estimated_cost)} · ${formatLatency(item.avg_latency_ms)}`,
                }))}
                valueFormatter={formatCompactMetric}
                highlightKey={currentModelHighlightKey}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
              <Surface className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">厂商汇总</div>
                    <div className="mt-1 text-sm text-slate-500">用于观察当前厂商整体负载、稳定性与费用累积。</div>
                  </div>
                  <button onClick={() => setView('overview')} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">查看概览</button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">厂商调用</div>
                    <div className="mt-3 text-2xl font-semibold text-slate-900">{formatCompactMetric(selectedUsageVendor?.total_calls || 0)}</div>
                    <div className="mt-1 text-xs text-slate-500">成功率 {formatPercent(selectedUsageVendor?.success_rate || 0)}</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">厂商成本</div>
                    <div className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrency(selectedUsageVendor?.estimated_cost || 0)}</div>
                    <div className="mt-1 text-xs text-slate-500">累计 {formatTokenMetric(selectedUsageVendor?.total_tokens || 0)} Token</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">默认配置</div>
                    <div className="mt-3 text-lg font-semibold text-slate-900">{modelDraft.active_vendor === currentVendorId ? '当前厂商为默认厂商' : '当前厂商不是默认厂商'}</div>
                    <div className="mt-1 text-xs text-slate-500">默认模型：{activeModelDraft.model?.display_name || '--'}</div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">价格配置覆盖</div>
                    <div className="mt-3 text-lg font-semibold text-slate-900">{formatInteger(pricedModelCount)} / {formatInteger(modelDraft.vendors.reduce((count, vendor) => count + vendor.models.length, 0))}</div>
                    <div className="mt-1 text-xs text-slate-500">已登记单价的模型数量</div>
                  </div>
                </div>
              </Surface>

              <AreaTrendChart
                title="平台调用背景趋势"
                subtitle="保留全局 7 天调用趋势，便于在查看单模型时快速横向对比。"
                points={consoleData.usageStats.trend}
                valueFormatter={formatCompactMetric}
                gradientId="model-page-call-trend"
                stroke="#8b5cf6"
              />
            </div>

            {modelProbeResult && (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="text-sm font-semibold text-slate-900">模型测试通过</div>
                <div className="mt-1 text-xs text-slate-600">{modelProbeResult.vendor_id} / {modelProbeResult.model_id} · {modelProbeResult.chat_model} · {modelProbeResult.latency_ms} ms</div>
                <div className="mt-3 text-xs leading-6 text-slate-600">返回内容：{modelProbeResult.message || '--'}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  const renderAgents = () => {
    const enabledAgents = agents.filter(item => item.enabled).length
    const publishedAgents = agents.filter(item => item.published).length
    const defaultAgent = agents.find(item => item.is_default) || null

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="智能体" value={formatInteger(agents.length)} hint={`已启用 ${formatInteger(enabledAgents)} 个`} accent="emerald" />
          <MetricCard label="已发布" value={formatInteger(publishedAgents)} hint={`默认智能体 ${defaultAgent?.name || defaultAgent?.agent_id || '未设置'}`} accent="sky" />
          <MetricCard label="会话" value={formatInteger(consoleData.stats.sessions)} hint="会话历史按智能体维度归档。" accent="violet" />
          <MetricCard label="全局资源" value={formatInteger(tools.length + skills.length)} hint={`工具 ${formatInteger(tools.length)} · 技能 ${formatInteger(skills.length)}`} accent="amber" />
        </div>

        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">智能体列表</div>
              <div className="mt-1 text-sm text-slate-500">先查看各智能体的定位与状态，再点击编辑进入弹窗维护角色 Prompt、模型、技能和固定入参。</div>
            </div>
            <button onClick={() => openAgentEditor(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新建智能体</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map(item => {
              const modelVendorId = String((item.model_config as any)?.vendor_id || '').trim()
              const modelId = String((item.model_config as any)?.model_id || '').trim()
              const sessionCount = agentSessionCountMap.get(item.agent_id) || 0
              const active = item.agent_id === agentId
              return (
                <div key={item.agent_id} className={cx('rounded-[26px] border p-5 transition', active ? 'border-emerald-200 bg-emerald-50/40 shadow-[0_18px_48px_rgba(16,185,129,0.10)]' : 'border-slate-200 bg-[#fbfefd]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-slate-900">{item.name || item.agent_id}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{item.agent_id}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {item.is_default && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] text-emerald-700">默认</span>}
                      {item.published && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] text-sky-700">已发布</span>}
                      {!item.enabled && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] text-slate-600">已停用</span>}
                    </div>
                  </div>

                  <div className="mt-4 min-h-[68px] text-sm leading-6 text-slate-600">{item.description || '暂未填写描述。'}</div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">模型</div>
                      <div className="mt-2 text-sm font-medium text-slate-900">{modelId || '未选择'}</div>
                      <div className="mt-1 text-xs text-slate-500">{modelVendorId || '未设置厂商'}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">资源绑定</div>
                      <div className="mt-2 text-sm font-medium text-slate-900">{formatInteger((item.global_tool_names || []).length)} 工具 · {formatInteger((item.skill_names || []).length)} 技能</div>
                      <div className="mt-1 text-xs text-slate-500">{formatInteger(sessionCount)} 条会话</div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button onClick={() => openAgentEditor(item.agent_id)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑</button>
                    {item.published && <button onClick={() => void openAgentApiDialog(item.agent_id)} className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 transition hover:border-sky-300 hover:text-sky-800">API 文档</button>}
                    <button onClick={() => openAgentChat(item.agent_id)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800"><SendHorizontal size={14} />对话</button>
                  </div>
                </div>
              )
            })}
            {!agents.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">当前还没有智能体，点击右上角新建。</div>}
          </div>
        </Surface>
      </div>
    )
  }

  const renderTools = () => {
    const cardToolCount = tools.filter(item => item.supports_card).length
    const globalToolCount = tools.filter(item => item.scope === 'global').length

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openToolEditor(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增协议工具</button>
          <button onClick={() => openMcpServerDialog(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增 MCP</button>
          <button onClick={() => void runAction(async () => { await consoleData.syncLocalTools() }, '本地工具已同步')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />同步本地工具</button>
          <button onClick={() => void runAction(async () => { await consoleData.syncMcpTools() }, 'MCP 工具已同步')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />同步 MCP 工具</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="工具" value={formatInteger(tools.length)} hint={`独立工具 ${formatInteger(standaloneTools.length)}`} accent="emerald" />
          <MetricCard label="MCP 服务" value={formatInteger(mcpToolGroups.length)} hint={`当前已同步 ${formatInteger(tools.filter(item => item.provider_type === 'mcp').length)} 个 MCP 工具`} accent="sky" />
          <MetricCard label="卡片工具" value={formatInteger(cardToolCount)} hint="支持卡片输出的工具" accent="violet" />
          <MetricCard label="全局工具" value={formatInteger(globalToolCount)} hint={`技能作用域工具 ${formatInteger(tools.length - globalToolCount)}`} accent="amber" />
        </div>

        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">独立工具</div>
              <div className="mt-1 text-sm text-slate-500">先查看工具的来源、作用域和卡片能力，点击编辑后再进入弹窗维护协议字段。</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {standaloneTools.map(item => {
              const active = toolName === item.tool_name
              return (
                <div key={item.tool_name} className={cx('rounded-[26px] border p-5 transition', active ? 'border-emerald-200 bg-emerald-50/40 shadow-[0_18px_48px_rgba(16,185,129,0.10)]' : 'border-slate-200 bg-[#fbfefd]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-slate-900">{item.display_name || item.tool_name}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{item.tool_name}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{item.provider_type}</span>
                      {item.supports_card && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] text-emerald-700">card</span>}
                      {!item.enabled && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] text-slate-600">已停用</span>}
                    </div>
                  </div>
                  <div className="mt-4 min-h-[68px] text-sm leading-6 text-slate-600">{item.summary || item.source_ref || '暂未填写摘要。'}</div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">作用域 {item.scope}</span>
                    {item.card_type && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">卡片 {item.card_type}</span>}
                  </div>
                  <div className="mt-5">
                    <button onClick={() => openToolEditor(item.tool_name)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑</button>
                  </div>
                </div>
              )
            })}
            {!standaloneTools.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">当前没有独立登记的工具。</div>}
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">MCP 服务</div>
              <div className="mt-1 text-sm text-slate-500">服务卡片展示传输方式、同步出的工具数量，点击编辑服务或工具即可进入弹窗。</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {mcpToolGroups.map(group => {
              const expanded = isToolServerExpanded(group.name)
              const active = mcpServerName === group.name
              return (
                <div key={group.name} className={cx('rounded-[26px] border p-5 transition', active ? 'border-emerald-200 bg-emerald-50/40 shadow-[0_18px_48px_rgba(16,185,129,0.10)]' : 'border-slate-200 bg-[#fbfefd]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">{group.name}</div>
                      <div className="mt-1 text-sm text-slate-500">{group.transport || '未声明 transport'} · {formatInteger(group.tools.length)} 个工具</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleToolServerExpanded(group.name)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-emerald-200 hover:text-emerald-600">
                        <ChevronRight size={14} className={cx('transition', expanded && 'rotate-90')} />
                      </button>
                      <button onClick={() => openMcpServerDialog(group.name)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑服务</button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">全局开关 {mcpMetaDraft.enabled ? '启用' : '关闭'}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">超时 {formatInteger(mcpMetaDraft.tool_timeout_seconds)} 秒</span>
                  </div>

                  {expanded && (
                    <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
                      {group.tools.map(item => (
                        <div key={item.tool_name} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-slate-900">{item.display_name || item.tool_name}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">{item.summary || item.tool_name}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{item.scope}</span>
                              {item.supports_card && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] text-emerald-700">card</span>}
                              <button onClick={() => openToolEditor(item.tool_name)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑工具</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!group.tools.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">当前服务还没有同步出工具。</div>}
                    </div>
                  )}
                </div>
              )
            })}
            {!mcpToolGroups.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">当前没有 MCP 服务，点击上方新增即可接入。</div>}
          </div>
        </Surface>
      </div>
    )
  }

  const renderSkills = () => {
    const enabledSkills = skills.filter(item => item.enabled).length
    const boundToolSet = new Set(skills.flatMap(item => item.tool_names || []))

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="技能" value={formatInteger(skills.length)} hint={`已启用 ${formatInteger(enabledSkills)}`} accent="emerald" />
          <MetricCard label="绑定工具覆盖" value={formatInteger(boundToolSet.size)} hint="被技能引用的唯一工具数量" accent="sky" />
          <MetricCard label="可用工具" value={formatInteger(tools.length)} hint="平台工具可直接绑定到技能" accent="violet" />
          <MetricCard label="摘要注入" value={formatInteger(enabledSkills)} hint="已启用技能摘要默认注入系统提示" accent="amber" />
        </div>

        <Surface className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">技能配置</div>
              <div className="mt-1 text-sm text-slate-500">先浏览摘要与绑定工具，再点击编辑进入弹窗维护正文、摘要和绑定关系。</div>
            </div>
            <button onClick={() => openSkillEditor(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增技能</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {skills.map(item => {
              const active = skillName === item.skill_name
              const previewTools = (item.tool_names || []).slice(0, 4)
              return (
                <div key={item.skill_name} className={cx('rounded-[26px] border p-5 transition', active ? 'border-emerald-200 bg-emerald-50/40 shadow-[0_18px_48px_rgba(16,185,129,0.10)]' : 'border-slate-200 bg-[#fbfefd]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-slate-900">{item.display_name || item.skill_name}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{item.skill_name}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{item.source_type || 'local'}</span>
                      {!item.enabled && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] text-slate-600">已停用</span>}
                    </div>
                  </div>

                  <div className="mt-4 min-h-[68px] text-sm leading-6 text-slate-600">{item.summary || '暂无摘要。'}</div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {previewTools.map(toolNameItem => (
                      <span key={`${item.skill_name}-${toolNameItem}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500">{toolNameItem}</span>
                    ))}
                    {(item.tool_names || []).length > 4 && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500">+{(item.tool_names || []).length - 4}</span>}
                    {!previewTools.length && <span className="rounded-full border border-dashed border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-400">未绑定工具</span>}
                  </div>

                  <div className="mt-5">
                    <button onClick={() => openSkillEditor(item.skill_name)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑</button>
                  </div>
                </div>
              )
            })}
            {!skills.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">当前还没有技能，点击右上角新建。</div>}
          </div>
        </Surface>
      </div>
    )
  }

  const renderCards = () => (
    <div className="space-y-5">
      <Surface className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={cardsMode === 'templates'} onClick={() => setCardsMode('templates')}>模板库</Chip>
          <Chip active={cardsMode === 'bindings'} onClick={() => setCardsMode('bindings')}>绑定协议</Chip>
          <div className="ml-auto flex flex-wrap gap-2">
            <input id="card-pack-file-input" type="file" accept=".json" className="hidden" onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                try {
                  const pack = JSON.parse(reader.result as string)
                  void runAction(async () => {
                    const result = await consoleData.importCardPack(pack)
                    if (result.errors?.length) console.warn('卡片包导入警告:', result.errors)
                  }, `卡片包已导入：${(pack as any).display_name || (pack as any).pack_id || file.name}`)
                } catch { void runAction(() => Promise.reject(new Error('JSON 解析失败，请检查文件格式')), '') }
              }
              reader.readAsText(file, 'utf-8')
              e.target.value = ''
            }} />
            <button onClick={() => document.getElementById('card-pack-file-input')?.click()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Upload size={14} />导入卡片包</button>
            <button onClick={() => void runAction(async () => {
              const results = await consoleData.scanCardPacks()
              if (!results.length) throw new Error('card_packs/ 目录不存在或无 JSON 文件')
            }, '卡片包目录已扫描')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />扫描目录</button>
          </div>
        </div>
      </Surface>

      {cardsMode === 'templates' ? (
        <div className="grid gap-5 xl:grid-cols-[280px_320px_minmax(0,1fr)]">
          <ResourceList
            title="卡片集"
            items={cardCollections}
            selectedKey={selectedCardCollection?.collection_id || ''}
            onSelect={setCardCollectionId}
            onNew={() => openCardCollectionDialog(NEW_KEY)}
            getKey={item => item.collection_id}
            getTitle={item => item.display_name || item.collection_id}
            getMeta={item => item.summary || `${cardTemplateCountByCollection.get(item.collection_id) || 0} 个模板`}
            newLabel="新建卡片集"
          />

          <Surface className="p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">模板列表</div>
                <div className="mt-1 text-xs text-slate-500">{selectedCardCollection?.display_name || '未选择卡片集'} · {cardTemplateCountByCollection.get(selectedCardCollection?.collection_id || '') || 0} 个模板</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openCardCollectionDialog(selectedCardCollection?.collection_id || NEW_KEY)} disabled={!selectedCardCollection} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40">编辑卡片集</button>
                <button onClick={() => openCardTemplateDialog(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={12} />新增模板</button>
              </div>
            </div>

            {filteredCardTemplateGallery.length ? (
              <div className="space-y-2">
                {filteredCardTemplateGallery.map(item => {
                  const active = cardTemplateId === item.template.template_id
                  return (
                    <button key={item.template.template_id} onClick={() => setCardTemplateId(item.template.template_id)} className={cx('w-full rounded-[22px] border p-4 text-left transition', active ? 'border-emerald-300 bg-emerald-50/50 shadow-[0_12px_36px_rgba(16,185,129,0.10)]' : 'border-slate-200 bg-[#fbfefd] hover:border-emerald-200 hover:bg-emerald-50/30')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{item.template.display_name || item.template.template_id}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{item.template.template_id}</div>
                        </div>
                        {!item.template.enabled && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] text-slate-600">已停用</span>}
                      </div>
                      <div className="mt-3 text-xs leading-5 text-slate-500">{item.template.summary || '未填写模板摘要。'}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{item.template.template_type || 'info_detail'}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{item.template.renderer_key || '未配置渲染器'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">当前卡片集还没有模板，点击上方新建。</div>
            )}
          </Surface>

          {selectedCardTemplate && cardTemplateId !== NEW_KEY ? (
            <div className="space-y-5">
              <Surface className="p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{selectedCardTemplate.display_name || selectedCardTemplate.template_id}</div>
                    <div className="mt-1 text-sm text-slate-500">{selectedCardTemplate.summary || '点击编辑后可维护模板摘要、Schema 与预览配置。'}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{selectedCardTemplate.template_id}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{selectedCardTemplate.template_type || 'info_detail'}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{selectedCardCollection?.display_name || selectedCardTemplate.collection_id || 'default'}</span>
                      {!selectedCardTemplate.enabled && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-600">已停用</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openCardTemplateDialog(selectedCardTemplate.template_id)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">编辑模板</button>
                    <button onClick={() => openCardTemplateDialog(NEW_KEY)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增模板</button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-[#fbfefd] p-4">
                  <CardRenderer card={selectedTemplateCard} onInspectPath={setCardInspectPath} />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium text-slate-900">样例 JSON</div>
                  {renderHighlightedJson(selectedTemplatePreviewPayload, cardInspectPath)}
                </div>
              </Surface>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Surface className="p-6">
                  <div className="mb-4 text-lg font-semibold text-slate-900">模板结构</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="模板 ID"><Input readOnly value={cardTemplateForm.template_id} /></Field>
                    <Field label="渲染器 Key"><Input readOnly value={cardTemplateForm.renderer_key} /></Field>
                    <Field label="数据 Schema"><Area rows={12} readOnly value={cardTemplateForm.data_schema_text} /></Field>
                    <Field label="UI 模板"><Area rows={12} readOnly value={cardTemplateForm.ui_schema_text} /></Field>
                    <Field label="动作 Schema"><Area rows={12} readOnly value={cardTemplateForm.action_schema_text} /></Field>
                    <Field label="样例 Payload"><Area rows={12} readOnly value={cardTemplateForm.sample_payload_text} /></Field>
                  </div>
                </Surface>

                <Surface className="p-6">
                  <div className="mb-4 text-lg font-semibold text-slate-900">模板元数据</div>
                  <div className="grid gap-4">
                    <Field label="摘要"><Area rows={4} readOnly value={cardTemplateForm.summary} /></Field>
                    <Field label="附加信息"><Area rows={18} readOnly value={cardTemplateForm.metadata_text} /></Field>
                  </div>
                </Surface>
              </div>
            </div>
          ) : (
            <Surface className="p-6 text-sm text-slate-500">在中间选择一个模板后，这里会展示卡片样式、Schema 与元数据详情。</Surface>
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
                  <button onClick={() => { setToolName(selectedCard.source_name); setView('tools') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">前往工具配置</button>
                ) : (
                  <button onClick={() => { setSkillName(selectedCard.source_name); setView('skills') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">前往技能配置</button>
                )}
              </div>

              {cardTemplates.length > 0 && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-500">
                  可用模板：{cardTemplates.map(item => item.display_name || item.template_id).join(', ')}
                </div>
              )}

              {selectedCard.source_kind === 'tool' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={cardToolDraft.summary} onChange={e => setCardToolDraft(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                  <Field label="卡片类型"><Input value={cardToolDraft.card_type} onChange={e => setCardToolDraft(prev => ({ ...prev, card_type: e.target.value }))} /></Field>
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
                    }, '卡片绑定已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存绑定</button>
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
                    }, '卡片绑定已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存绑定</button>
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
              <div className="mt-1 text-xs text-slate-500">{activeAgentSessionOwner ? 'Only sessions for the current agent are shown here.' : 'Open chat from an agent detail page first, then review that agent\'s history here.'}</div>
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
                {activeAgentSessionOwner ? 'No session history for the current agent yet.' : 'Select an agent and enter chat first. Its session history will appear here.'}
              </div>
            )}
          </div>
        </Surface>

        <Surface className="p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold text-slate-900">{selectedActiveAgentSession?.title || '会话消息'}</div>
            <div className="mt-1 text-xs text-slate-500">{selectedActiveAgentSession ? `${selectedActiveAgentSession.agent_id || 'default'} · ${formatTime(selectedActiveAgentSession.updated_at || selectedActiveAgentSession.created_at)}` : 'Select a session on the left to inspect its messages.'}</div>
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
                  <span>{item.role} · {item.agent || 'default'} · {item.model || '--'}</span>
                  <span>{formatTime(item.created_at)}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {item.parts.map((part, index) => (
                    <div key={`${item.id}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-600">{part.type}</div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{part.content || '--'}</div>
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
  const selectedVendorUsage = selectedVendor ? (consoleData.usageStats.vendors.find(item => item.vendor_id === selectedVendor.vendor_id) || null) : null
  const selectedTemplateCard = cardTemplateGallery.find(item => item.template.template_id === cardTemplateId)?.previewCard || selectedTemplatePreviewCard

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6fbfa_0%,#f3faf7_42%,#eef7f3_100%)] text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-5 px-4 py-5 sm:px-6">
        <aside className="hidden w-[228px] flex-col rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.04)] xl:flex">
          <div className="px-2 py-3">
            <div className="text-xs uppercase tracking-[0.28em] text-emerald-600">CSAgent</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">骞冲彴鎺у埗鍙</div>
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
                <div className="mt-1 text-3xl font-semibold text-slate-900">{view === 'agent-chat' ? (activeAgentForChat?.name || 'Agent Chat') : NAV_ITEMS.find(item => item.key === view)?.label || 'Overview'}</div>
              </div>
              <button onClick={() => void runAction(async () => { await Promise.all([consoleData.refreshModelConfig(), consoleData.refreshUsageStats(), consoleData.refreshMcpConfig(), consoleData.refreshSessions(), consoleData.refreshRegistry()]) }, '鎺у埗鍙版暟鎹凡鍒锋柊')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><RefreshCw size={14} />鍒锋柊</button>
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

          <Modal open={vendorCreateDialogOpen} onClose={() => setVendorCreateDialogOpen(false)} title="添加厂商" description="先注册厂商，再添加模型。" widthClass="max-w-2xl">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="厂商类型">
                  <Select value={vendorCreateDraft.vendor_type} onChange={e => setVendorCreateDraft(prev => ({ ...createVendorCreateDraft(e.target.value), enabled: prev.enabled }))}>
                    {MODEL_VENDOR_TYPE_OPTIONS.map(item => <option key={item.vendor_type} value={item.vendor_type}>{item.display_name}</option>)}
                  </Select>
                </Field>
                <Field label="系统标识"><Input value={vendorCreateDraft.vendor_id} disabled /></Field>
                <Field label="显示名"><Input value={vendorCreateDraft.display_name} onChange={e => setVendorCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} placeholder="控制台显示名称" /></Field>
                <div className="md:col-span-2"><Field label="Base URL"><Input value={vendorCreateDraft.base_url} onChange={e => setVendorCreateDraft(prev => ({ ...prev, base_url: e.target.value }))} placeholder="例如 https://api.example.com/v1" /></Field></div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                <div className="flex items-center gap-4">
                  <VendorLogo vendorTypeOrId={vendorCreateDraft.vendor_type} size="lg" />
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-slate-900">{vendorCreateDraft.display_name || vendorCreateDraft.vendor_id}</div>
                    <div className="mt-1 text-xs text-slate-500">{vendorCreateDraft.base_url || '未设置 Base URL'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Chip active={vendorCreateDraft.enabled} onClick={() => setVendorCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
              <div className="flex items-center gap-2">
                <button onClick={() => setVendorCreateDialogOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">取消</button>
                <button onClick={() => void runAction(async () => { await addVendor(); setVendorCreateDialogOpen(false) }, '厂商已添加')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Plus size={14} />添加厂商</button>
              </div>
            </div>
          </Modal>

          <Modal open={modelCreateDialogOpen} onClose={() => setModelCreateDialogOpen(false)} title="添加模型" description={`所属厂商：${modelCreateOwner?.display_name || modelCreateOwner?.vendor_id || '未选择'}`} widthClass="max-w-2xl">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="模型 ID"><Input value={modelCreateDraft.model_id} onChange={e => setModelCreateDraft(prev => ({ ...prev, model_id: e.target.value }))} placeholder="例如 gpt-4o-mini" /></Field>
              <Field label="显示名"><Input value={modelCreateDraft.display_name} onChange={e => setModelCreateDraft(prev => ({ ...prev, display_name: e.target.value }))} placeholder="控制台显示名称" /></Field>
              <div className="md:col-span-2"><Field label="实际模型名"><Input value={modelCreateDraft.chat_model} onChange={e => setModelCreateDraft(prev => ({ ...prev, chat_model: e.target.value }))} placeholder="实际请求模型名" /></Field></div>
              <Field label="Input 单价（元 / M tokens，可选）"><Input type="number" step="0.0001" value={modelCreateDraft.input_cost_per_mtokens ?? ''} onChange={e => setModelCreateDraft(prev => ({ ...prev, input_cost_per_mtokens: parseNullableNumberInput(e.target.value) }))} placeholder="例如 2.5000" /></Field>
              <Field label="Output 单价（元 / M tokens，可选）"><Input type="number" step="0.0001" value={modelCreateDraft.output_cost_per_mtokens ?? ''} onChange={e => setModelCreateDraft(prev => ({ ...prev, output_cost_per_mtokens: parseNullableNumberInput(e.target.value) }))} placeholder="例如 8.0000" /></Field>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Chip active={modelCreateDraft.enabled} onClick={() => setModelCreateDraft(prev => ({ ...prev, enabled: !prev.enabled }))}>默认启用</Chip>
              <div className="flex items-center gap-2">
                <button onClick={() => setModelCreateDialogOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">取消</button>
                <button onClick={() => void runAction(async () => { await addVendorModel(modelCreateVendorId); setModelCreateDialogOpen(false) }, '模型已添加')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Plus size={14} />添加模型</button>
              </div>
            </div>
          </Modal>

          <Modal open={modelEditorOpen && Boolean(selectedVendor)} onClose={() => setModelEditorOpen(false)} title={selectedVendor?.display_name || selectedVendor?.vendor_id || '模型编辑'} description="在弹窗中编辑厂商和模型设置，并可直接测试连接。" widthClass="max-w-6xl">
            {selectedVendor && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="API Key"><Input value={modelDraft.api_key} onChange={e => setModelDraft(prev => ({ ...prev, api_key: e.target.value }))} placeholder={consoleData.modelConfig.has_api_key ? '已配置，留空保持不变' : '输入 API Key'} /></Field>
                  <Field label="嵌入模型"><Input value={modelDraft.embed_model} onChange={e => setModelDraft(prev => ({ ...prev, embed_model: e.target.value }))} /></Field>
                  <Field label="默认厂商">
                    <Select value={modelDraft.active_vendor} onChange={e => {
                      const nextVendorId = e.target.value
                      const nextVendor = modelDraft.vendors.find(item => item.vendor_id === nextVendorId)
                      setModelDraft(prev => ({ ...prev, active_vendor: nextVendorId, active_model: nextVendor?.models[0]?.model_id || '' }))
                      if (nextVendorId) focusModelAnalytics(nextVendorId, nextVendor?.models[0]?.model_id || '')
                    }}>
                      <option value="">未选择</option>
                      {modelDraft.vendors.map(item => <option key={item.vendor_id} value={item.vendor_id}>{item.display_name || item.vendor_id}</option>)}
                    </Select>
                  </Field>
                  <Field label="默认模型">
                    <Select value={modelDraft.active_model} onChange={e => {
                      const nextModelId = e.target.value
                      setModelDraft(prev => ({ ...prev, active_model: nextModelId }))
                      if (modelDraft.active_vendor) setSelectedModelStatsId(nextModelId)
                    }}>
                      <option value="">未选择</option>
                      {(modelDraft.vendors.find(item => item.vendor_id === modelDraft.active_vendor)?.models || []).map(item => <option key={item.model_id} value={item.model_id}>{item.display_name || item.model_id}</option>)}
                    </Select>
                  </Field>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip active={selectedVendor.enabled} onClick={() => updateVendor(selectedVendor.vendor_id, { enabled: !selectedVendor.enabled })}>厂商启用</Chip>
                    <Chip active={modelDraft.active_vendor === selectedVendor.vendor_id} onClick={() => {
                      setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: selectedVendor.models[0]?.model_id || '' }))
                      setSelectedModelStatsId(selectedVendor.models[0]?.model_id || '')
                    }}>设为默认厂商</Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openModelCreateDialog(selectedVendor.vendor_id)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={14} />新增模型</button>
                    <button onClick={() => void runAction(saveModelCatalog, '模型目录已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                    <button onClick={() => void runAction(deleteVendor, '厂商已删除')} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} />删除厂商</button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="厂商类型"><Input value={getModelVendorPreset(selectedVendor.vendor_type || selectedVendor.vendor_id)?.display_name || selectedVendor.vendor_type || selectedVendor.vendor_id} disabled /></Field>
                  <Field label="系统标识"><Input value={selectedVendor.vendor_id} disabled /></Field>
                  <Field label="显示名"><Input value={selectedVendor.display_name} onChange={e => updateVendor(selectedVendor.vendor_id, { display_name: e.target.value })} /></Field>
                  <Field label="Base URL"><Input value={selectedVendor.base_url} onChange={e => updateVendor(selectedVendor.vendor_id, { base_url: e.target.value })} /></Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {selectedVendor.models.map(model => (
                    (() => {
                      const modelUsage = resolveVendorModelUsage(selectedVendorUsage, model)
                      const isDefaultModel = modelDraft.active_vendor === selectedVendor.vendor_id && modelDraft.active_model === model.model_id
                      const isFocusedModel = selectedModelStatsId === model.model_id || selectedModelStatsId === model.chat_model
                      return (
                        <div key={model.model_id} className={cx('rounded-[24px] border bg-[#fbfefd] p-4', isFocusedModel ? 'border-emerald-200 shadow-[0_12px_32px_rgba(16,185,129,0.10)]' : 'border-slate-200')}>
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{model.display_name || model.model_id}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">{model.chat_model || model.model_id}</div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                                <span>{formatCompactMetric(modelUsage?.total_calls || 0)} 次调用</span>
                                <span>{formatTokenMetric(modelUsage?.total_tokens || 0)} Token</span>
                                <span>{formatCurrency(modelUsage?.estimated_cost || 0)}</span>
                              </div>
                            </div>
                            <button onClick={() => void runAction(async () => { await deleteVendorModel(model.model_id) }, '模型已删除')} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs text-rose-600 transition hover:bg-rose-50"><Trash2 size={12} />删除</button>
                          </div>
                          <div className="grid gap-3">
                            <Field label="显示名"><Input value={model.display_name} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { display_name: e.target.value })} /></Field>
                            <Field label="实际模型名"><Input value={model.chat_model} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { chat_model: e.target.value })} /></Field>
                            <Field label="Input 单价（元 / M tokens，可选）"><Input type="number" step="0.0001" value={model.input_cost_per_mtokens ?? ''} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { input_cost_per_mtokens: parseNullableNumberInput(e.target.value) })} placeholder="例如 2.5000" /></Field>
                            <Field label="Output 单价（元 / M tokens，可选）"><Input type="number" step="0.0001" value={model.output_cost_per_mtokens ?? ''} onChange={e => updateVendorModel(selectedVendor.vendor_id, model.model_id, { output_cost_per_mtokens: parseNullableNumberInput(e.target.value) })} placeholder="例如 8.0000" /></Field>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Chip active={model.enabled} onClick={() => updateVendorModel(selectedVendor.vendor_id, model.model_id, { enabled: !model.enabled })}>模型启用</Chip>
                            <Chip active={isDefaultModel} onClick={() => {
                              setModelDraft(prev => ({ ...prev, active_vendor: selectedVendor.vendor_id, active_model: model.model_id }))
                              setSelectedModelStatsId(model.model_id)
                            }}>设为默认模型</Chip>
                            <button onClick={() => focusModelAnalytics(selectedVendor.vendor_id, model.model_id)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">查看统计</button>
                            <button onClick={() => void runAction(async () => { await probeModelSelection(selectedVendor.vendor_id, model.model_id) }, '模型测试通过')} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">测试连接</button>
                          </div>
                        </div>
                      )
                    })()
                  ))}
                  {!selectedVendor.models.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">当前厂商还没有模型，先添加一个再测试。</div>}
                </div>

                {modelProbeResult && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="text-sm font-semibold text-slate-900">模型测试通过</div>
                    <div className="mt-1 text-xs text-slate-600">{modelProbeResult.vendor_id} / {modelProbeResult.model_id} · {modelProbeResult.chat_model} · {modelProbeResult.latency_ms} ms</div>
                    <div className="mt-3 text-xs leading-6 text-slate-600">返回内容：{modelProbeResult.message || '--'}</div>
                  </div>
                )}
              </div>
            )}
          </Modal>

          <Modal open={agentEditorOpen} onClose={() => setAgentEditorOpen(false)} title={agentId === NEW_KEY ? '新建智能体' : agentForm.name || agentForm.agent_id || '智能体设置'} description="在弹窗中编辑角色提示、模型选择、技能、工具和固定变量。" widthClass="max-w-6xl">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">系统核心提示、技能摘要与记忆提示由平台托管，这里维护角色提示、模型、技能和固定变量。</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void runAction(async () => { const saved = await consoleData.saveAgent(agentFormToPayload(agentForm)); setAgentId(saved.agent_id); setAgentEditorOpen(false) }, '智能体已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                  <button onClick={() => void runAction(async () => {
                    const targetId = agentForm.agent_id || selectedAgent?.agent_id || ''
                    await consoleData.deleteAgent(targetId)
                    setAgentId(agents.find(item => item.agent_id !== targetId)?.agent_id || '')
                    setAgentEditorOpen(false)
                  }, '智能体已删除')} disabled={!agentForm.agent_id.trim() || Boolean(selectedAgent?.is_default)} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                  <button onClick={() => void runAction(async () => { const saved = await consoleData.publishAgent(agentForm.agent_id); setAgentId(saved.agent_id); setAgentForm(prev => ({ ...prev, published: true })) }, '智能体已发布')} disabled={!agentForm.agent_id.trim()} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40">发布</button>
                  <button onClick={() => void openAgentApiDialog(agentForm.agent_id || selectedAgent?.agent_id || '')} disabled={!(selectedAgent?.published || agentForm.published) || !(agentForm.agent_id || selectedAgent?.agent_id)} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 transition hover:border-sky-300 hover:text-sky-800 disabled:opacity-40">API 文档</button>
                  <button onClick={() => { setAgentEditorOpen(false); openAgentChat(agentForm.agent_id || selectedAgent?.agent_id || '') }} disabled={!(agentForm.agent_id || selectedAgent?.agent_id)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800 disabled:opacity-40"><SendHorizontal size={14} />对话</button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="智能体 ID"><Input value={agentForm.agent_id} onChange={e => setAgentForm(prev => ({ ...prev, agent_id: e.target.value }))} /></Field>
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

              <div className="grid gap-4 md:grid-cols-2">
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

              <div className="grid gap-4 xl:grid-cols-2">
                <Surface className="p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">固定变量</div>
                      <div className="mt-1 text-xs text-slate-500">用于 user_id、tenant_id 等固定入参，可注入提示词，也可在运行时绑定给工具参数。</div>
                    </div>
                    <button onClick={addAgentVariable} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Plus size={12} />新增变量</button>
                  </div>
                  <div className="space-y-3">
                    {agentForm.agent_variables.map((item, index) => (
                      <div key={`${item.key || 'var'}-${index}`} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <Field label="变量 Key"><Input value={item.key} onChange={e => updateAgentVariable(index, { key: e.target.value })} placeholder="例如 user_id" /></Field>
                          <Field label="显示名"><Input value={item.label} onChange={e => updateAgentVariable(index, { label: e.target.value })} placeholder="例如 用户 ID" /></Field>
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
                      <div className="mt-1 text-xs text-slate-500">绑定后，该参数会从模型可见 schema 中移除，并在执行时由系统自动覆盖，不能被大模型填写。</div>
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
                                : '选择工具参数和变量后，系统会在执行时自动填充并覆盖该参数。'}
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

              <div className="flex flex-wrap gap-2">
                {agentFlags.map(flag => (
                  <Chip key={flag.key} active={flag.value} onClick={() => setAgentForm(prev => ({ ...prev, [flag.key]: !prev[flag.key] }))}>{flag.label}</Chip>
                ))}
              </div>

              <Surface className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">对话记录</div>
                    <div className="mt-1 text-xs text-slate-500">该智能体的历史记录已收敛到对话页查看。进入对话后，可按会话切换并查看消息明细。</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{selectedAgentSessions.length} 条会话</div>
                    <button onClick={() => { setAgentEditorOpen(false); openAgentChat(agentForm.agent_id || selectedAgent?.agent_id || '') }} disabled={!(agentForm.agent_id || selectedAgent?.agent_id)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-slate-800 disabled:opacity-40"><SendHorizontal size={14} />进入对话查看</button>
                  </div>
                </div>
              </Surface>
            </div>
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
                {toolForm.supports_card && <Field label="卡片类型"><Input value={toolForm.card_type} onChange={e => setToolForm(prev => ({ ...prev, card_type: e.target.value }))} /></Field>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip active={toolForm.enabled} onClick={() => setToolForm(prev => ({ ...prev, enabled: !prev.enabled }))}>启用</Chip>
                <Chip active={toolForm.supports_card} onClick={() => setToolForm(prev => ({ ...prev, supports_card: !prev.supports_card }))}>卡片支持</Chip>
              </div>
              {selectedTool && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                    <div className="mb-2 text-sm font-medium text-slate-900">输入 Schema</div>
                    <pre className="overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{formatJson(selectedTool.input_schema || {})}</pre>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                    <div className="mb-2 text-sm font-medium text-slate-900">输出 Schema</div>
                    <pre className="overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{formatJson(selectedTool.output_schema || {})}</pre>
                  </div>
                </div>
              )}
            </div>
          </Modal>

          <Modal open={mcpServerDialogOpen} onClose={() => setMcpServerDialogOpen(false)} title={mcpServerName === NEW_KEY ? '新建 MCP 服务' : mcpServerDraft.name || 'MCP 接入'} description="填写命令或 URL，先测试再连接平台。" widthClass="max-w-4xl">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="MCP 启用"><Select value={mcpMetaDraft.enabled ? 'true' : 'false'} onChange={e => setMcpMetaDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
                <Field label="工具超时秒数"><Input type="number" value={String(mcpMetaDraft.tool_timeout_seconds)} onChange={e => setMcpMetaDraft(prev => ({ ...prev, tool_timeout_seconds: Number(e.target.value || 0) }))} /></Field>
                <Field label="服务名称"><Input value={mcpServerDraft.name} onChange={e => setMcpServerDraft(prev => ({ ...prev, name: e.target.value }))} /></Field>
                <Field label="传输方式"><Select value={mcpServerDraft.transport} onChange={e => setMcpServerDraft(prev => ({ ...prev, transport: e.target.value }))}><option value="stdio">stdio</option><option value="sse">sse</option><option value="http">http</option><option value="ws">websocket</option></Select></Field>
                {mcpServerDraft.transport === 'stdio' ? (
                  <>
                    <Field label="命令"><Input value={mcpServerDraft.command} onChange={e => setMcpServerDraft(prev => ({ ...prev, command: e.target.value }))} /></Field>
                    <Field label="工作目录"><Input value={mcpServerDraft.cwd} onChange={e => setMcpServerDraft(prev => ({ ...prev, cwd: e.target.value }))} /></Field>
                  </>
                ) : (
                  <div className="md:col-span-2"><Field label="URL"><Input value={mcpServerDraft.url} onChange={e => setMcpServerDraft(prev => ({ ...prev, url: e.target.value }))} placeholder="例如 http://127.0.0.1:9100/mcp 或 /sse" /></Field></div>
                )}
                <Field label="作用域"><Select value={mcpServerDraft.scope} onChange={e => setMcpServerDraft(prev => ({ ...prev, scope: e.target.value }))}><option value="global">global</option><option value="skill">skill</option></Select></Field>
                <Field label="启用"><Select value={mcpServerDraft.enabled ? 'true' : 'false'} onChange={e => setMcpServerDraft(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
              </div>
              <details className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">高级选项</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="工具名前缀"><Input value={mcpServerDraft.tool_name_prefix} onChange={e => setMcpServerDraft(prev => ({ ...prev, tool_name_prefix: e.target.value }))} /></Field>
                  <Field label="启动参数"><Area rows={5} value={mcpServerDraft.args_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, args_text: e.target.value }))} /></Field>
                  <Field label="包含工具"><Area rows={5} value={mcpServerDraft.include_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, include_tools_text: e.target.value }))} /></Field>
                  <Field label="排除工具"><Area rows={5} value={mcpServerDraft.exclude_tools_text} onChange={e => setMcpServerDraft(prev => ({ ...prev, exclude_tools_text: e.target.value }))} /></Field>
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">保存服务时会同时带上当前 MCP 全局开关与超时设置。</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void runAction(async () => { await saveMcpMeta() }, 'MCP 全局配置已保存')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Save size={14} />保存全局配置</button>
                  <button onClick={() => void runAction(async () => { await probeMcpServer() }, 'MCP 测试通过')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600"><Sparkles size={14} />测试连接</button>
                  <button onClick={() => void runAction(async () => { await saveMcpServer(); setMcpServerDialogOpen(false) }, 'MCP 服务已连接')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />测试并连接</button>
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

          <Modal open={skillEditorOpen} onClose={() => setSkillEditorOpen(false)} title={skillName === NEW_KEY ? '新建技能' : skillForm.display_name || skillForm.skill_name || '技能设置'} description="在弹窗中维护技能摘要、正文和绑定工具。" widthClass="max-w-4xl">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">技能摘要会注入系统提示词，正文按需由平台加载给模型。</div>
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
                <Field label="启用"><Select value={skillForm.enabled ? 'true' : 'false'} onChange={e => setSkillForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
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
              <div className="rounded-[24px] border border-slate-200 bg-[#fbfefd] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">一键生成 Skill</div>
                    <div className="mt-1 text-xs text-slate-500">基于技能名和已绑定工具，用选定模型流式生成摘要与正文，并直接回填编辑栏。</div>
                  </div>
                  <button onClick={() => void (skillGenerating ? stopSkillGeneration() : generateSkillWithModel())} className={cx('inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition', skillGenerating ? 'border border-amber-200 bg-white text-amber-700 hover:border-amber-300' : 'bg-emerald-500 text-white hover:bg-emerald-600')}>
                    {skillGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {skillGenerating ? '停止生成' : '一键生成 Skill'}
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Field label="生成厂商">
                    <Select value={skillGenerateDraft.model_vendor_id} onChange={e => changeSkillGenerateVendor(e.target.value)}>
                      {consoleData.modelConfig.vendors.map(item => <option key={item.vendor_id} value={item.vendor_id}>{item.display_name || item.vendor_id}</option>)}
                    </Select>
                  </Field>
                  <Field label="生成模型">
                    <Select value={skillGenerateDraft.model_id} onChange={e => setSkillGenerateDraft(prev => ({ ...prev, model_id: e.target.value }))}>
                      {(skillGenerateVendor?.models || []).map(item => <option key={item.model_id} value={item.model_id}>{item.display_name || item.model_id}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{skillGenerateVendor?.display_name || '未选择厂商'}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{skillGenerateModel?.display_name || skillGenerateDraft.model_id || '未选择模型'}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{(skillForm.tool_names || []).length} 个绑定工具</span>
                  <span>{skillGenerateStatus || '点击生成后，会先流式写入摘要，再继续生成正文。'}</span>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={skillForm.summary} onChange={e => setSkillForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                <div className="md:col-span-2"><Field label="正文 Markdown"><Area rows={12} value={skillForm.document_md} onChange={e => setSkillForm(prev => ({ ...prev, document_md: e.target.value }))} /></Field></div>
              </div>
            </div>
          </Modal>

          <Modal open={agentApiDialogOpen} onClose={() => setAgentApiDialogOpen(false)} title={agentApiDocs?.agent_name || agentApiOwnerId || '智能体 API'} description="查看已发布智能体的接口文档，并创建调用 Key。" widthClass="max-w-5xl">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">外部系统可通过 API Key 调用该智能体，支持使用 Swagger 文档查看请求结构与返回格式。</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => agentApiDocs && openUrlInNewTab(agentApiDocs.docs_url)} disabled={!agentApiDocs} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-40">打开 Swagger 文档</button>
                  <button onClick={() => agentApiDocs && copyText(agentApiDocs.invoke_url, '调用地址已复制')} disabled={!agentApiDocs} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40">复制调用地址</button>
                </div>
              </div>

              {agentApiLoading ? (
                <Surface className="p-6 text-sm text-slate-500">正在加载智能体 API 信息...</Surface>
              ) : agentApiDocs ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_360px]">
                  <div className="space-y-5">
                    <Surface className="p-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="调用方式"><Input readOnly value={`${agentApiDocs.method} ${agentApiDocs.invoke_url}`} /></Field>
                        <Field label="鉴权 Header"><Input readOnly value={`${agentApiDocs.auth.header}: <your-api-key>`} /></Field>
                        <Field label="Swagger 文档"><Input readOnly value={agentApiDocs.docs_url} /></Field>
                        <Field label="OpenAPI JSON"><Input readOnly value={agentApiDocs.openapi_url} /></Field>
                        <div className="md:col-span-2"><Field label="curl 示例"><Area rows={8} readOnly value={agentApiDocs.curl_example} /></Field></div>
                        <div className="md:col-span-2"><Field label="请求示例 JSON"><Area rows={12} readOnly value={formatJson(agentApiDocs.sample_request)} /></Field></div>
                      </div>
                    </Surface>

                    <Surface className="p-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">固定变量要求</div>
                          <div className="mt-1 text-sm text-slate-500">调用时如该智能体配置了固定变量，请按要求传入 `agent_variables`。</div>
                        </div>
                      </div>
                      {agentApiDocs.required_agent_variables.length ? (
                        <div className="space-y-3">
                          {agentApiDocs.required_agent_variables.map(item => (
                            <div key={item.key} className="rounded-2xl border border-slate-200 bg-[#fbfefd] px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-slate-900">{item.label || item.key}</div>
                                <span className={cx('rounded-full px-2.5 py-1 text-[11px]', item.required ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600')}>{item.required ? '必填' : '可选'}</span>
                              </div>
                              <div className="mt-2 text-xs text-slate-500">Key：{item.key}{item.default_value ? ` · 默认值：${item.default_value}` : ''}</div>
                              <div className="mt-1 text-sm text-slate-600">{item.description || '未填写说明'}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">该智能体当前没有固定变量要求，可直接按示例请求调用。</div>
                      )}
                    </Surface>
                  </div>

                  <div className="space-y-5">
                    <Surface className="p-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">创建 API Key</div>
                          <div className="mt-1 text-sm text-slate-500">Key 明文只会显示一次，请创建后立即复制保存。</div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <Field label="Key 名称"><Input value={agentApiKeyName} onChange={e => setAgentApiKeyName(e.target.value)} placeholder="例如 生产环境调用 / 测试联调" /></Field>
                        <button onClick={() => void runAction(createAgentApiKey, '智能体 API Key 已创建')} disabled={!agentApiOwnerId} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-40"><Plus size={14} />创建 Key</button>
                        {agentApiCreatedKey && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                            <div className="text-sm font-medium text-emerald-800">新 Key</div>
                            <div className="mt-2 break-all rounded-2xl border border-emerald-100 bg-white px-3 py-3 text-sm text-slate-700">{agentApiCreatedKey}</div>
                            <div className="mt-3 flex gap-2">
                              <button onClick={() => void copyText(agentApiCreatedKey, 'API Key 已复制')} className="rounded-2xl border border-emerald-200 px-3 py-2 text-xs text-emerald-700 transition hover:bg-emerald-100">复制 Key</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </Surface>

                    <Surface className="p-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">已有 Key</div>
                          <div className="mt-1 text-sm text-slate-500">仅展示前缀和使用情况，明文不会再次返回。</div>
                        </div>
                        <button onClick={() => void runAction(async () => { await loadAgentApiData(agentApiOwnerId) }, '智能体 API 信息已刷新')} disabled={!agentApiOwnerId} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:opacity-40">刷新</button>
                      </div>
                      {agentApiKeys.length ? (
                        <div className="space-y-3">
                          {agentApiKeys.map(item => (
                            <div key={item.key_id} className="rounded-2xl border border-slate-200 bg-[#fbfefd] p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900">{item.name || item.key_prefix}</div>
                                  <div className="mt-1 text-xs text-slate-500">前缀：{item.key_prefix}</div>
                                  <div className="mt-1 text-xs text-slate-500">创建时间：{formatTime(item.created_at)}</div>
                                  <div className="mt-1 text-xs text-slate-500">最近使用：{item.last_used_at ? formatTime(item.last_used_at) : '尚未使用'}</div>
                                </div>
                                <button onClick={() => void runAction(async () => { await removeAgentApiKey(item.key_id) }, '智能体 API Key 已删除')} className="rounded-2xl border border-rose-200 px-3 py-2 text-xs text-rose-600 transition hover:bg-rose-50">删除</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">当前还没有 API Key，请先创建一个用于外部系统鉴权调用。</div>
                      )}
                    </Surface>
                  </div>
                </div>
              ) : (
                <Surface className="p-6 text-sm text-slate-500">请先发布该智能体，然后再查看 API 文档与创建 Key。</Surface>
              )}
            </div>
          </Modal>

          <Modal open={cardCollectionDialogOpen} onClose={() => setCardCollectionDialogOpen(false)} title={cardCollectionEditorId === NEW_KEY ? '新建卡片集' : cardCollectionForm.display_name || cardCollectionForm.collection_id || '卡片集设置'} description="按业务域、场景或产品线管理卡片模板。" widthClass="max-w-3xl">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-500">卡片集用于承载一组模板，便于按业务域统一管理与沉淀。</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void runAction(async () => {
                    const saved = await consoleData.saveCardCollection(cardCollectionFormToPayload(cardCollectionForm))
                    setCardCollectionId(saved.collection_id)
                    setCardCollectionEditorId(saved.collection_id)
                    setCardCollectionDialogOpen(false)
                  }, '卡片集已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存</button>
                  <button onClick={() => void runAction(async () => {
                    const targetId = cardCollectionForm.collection_id || editingCardCollection?.collection_id || ''
                    await consoleData.deleteCardCollection(targetId)
                    setCardCollectionId(cardCollections.find(item => item.collection_id !== targetId)?.collection_id || 'default')
                    setCardCollectionDialogOpen(false)
                  }, '卡片集已删除')} disabled={!cardCollectionForm.collection_id.trim() || cardCollectionEditorId === NEW_KEY || cardCollectionForm.collection_id === 'default'} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} />删除</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="卡片集 ID"><Input value={cardCollectionForm.collection_id} onChange={e => setCardCollectionForm(prev => ({ ...prev, collection_id: e.target.value }))} /></Field>
                <Field label="启用"><Select value={cardCollectionForm.enabled ? 'true' : 'false'} onChange={e => setCardCollectionForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}><option value="true">启用</option><option value="false">关闭</option></Select></Field>
                <Field label="显示名"><Input value={cardCollectionForm.display_name} onChange={e => setCardCollectionForm(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
                <div className="md:col-span-2"><Field label="摘要"><Area rows={4} value={cardCollectionForm.summary} onChange={e => setCardCollectionForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                <div className="md:col-span-2"><Field label="附加信息"><Area rows={8} value={cardCollectionForm.metadata_text} onChange={e => setCardCollectionForm(prev => ({ ...prev, metadata_text: e.target.value }))} /></Field></div>
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
                  <Field label="启用">
                    <Select value={cardTemplateForm.enabled ? 'true' : 'false'} onChange={e => setCardTemplateForm(prev => ({ ...prev, enabled: e.target.value === 'true' }))}>
                      <option value="true">启用</option>
                      <option value="false">关闭</option>
                    </Select>
                  </Field>
                  <Field label="所属卡片集">
                    <Select value={cardTemplateForm.collection_id} onChange={e => setCardTemplateForm(prev => ({ ...prev, collection_id: e.target.value }))}>
                      {cardCollections.map(item => <option key={item.collection_id} value={item.collection_id}>{item.display_name || item.collection_id}</option>)}
                    </Select>
                  </Field>
                  <Field label="显示名"><Input value={cardTemplateForm.display_name} onChange={e => setCardTemplateForm(prev => ({ ...prev, display_name: e.target.value }))} /></Field>
                  <Field label="模板类型"><Input value={cardTemplateForm.template_type} onChange={e => setCardTemplateForm(prev => ({ ...prev, template_type: e.target.value }))} /></Field>
                  <div className="md:col-span-2"><Field label="摘要"><Area rows={3} value={cardTemplateForm.summary} onChange={e => setCardTemplateForm(prev => ({ ...prev, summary: e.target.value }))} /></Field></div>
                  <div className="md:col-span-2"><Field label="渲染器 Key"><Input value={cardTemplateForm.renderer_key} onChange={e => setCardTemplateForm(prev => ({ ...prev, renderer_key: e.target.value }))} /></Field></div>
                  <Field label="数据 Schema"><Area rows={10} value={cardTemplateForm.data_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, data_schema_text: e.target.value }))} /></Field>
                  <Field label="UI 模板"><Area rows={10} value={cardTemplateForm.ui_schema_text} onChange={e => setCardTemplateForm(prev => ({ ...prev, ui_schema_text: e.target.value }))} /></Field>
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
                    <button onClick={() => { setCardBindingDialogOpen(false); openToolEditor(selectedCard.source_name); setView('tools') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">前往工具配置</button>
                  ) : (
                    <button onClick={() => { setCardBindingDialogOpen(false); openSkillEditor(selectedCard.source_name); setView('skills') }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-emerald-200 hover:text-emerald-600">前往技能配置</button>
                  )}
                </div>
                {cardTemplates.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-[#f8fcfb] px-4 py-3 text-sm text-slate-500">
                    可用模板：{cardTemplates.map(item => item.display_name || item.template_id).join(', ')}
                  </div>
                )}
                {selectedCard.source_kind === 'tool' ? (
                  <div className="grid gap-4">
                    <Field label="摘要"><Area rows={3} value={cardToolDraft.summary} onChange={e => setCardToolDraft(prev => ({ ...prev, summary: e.target.value }))} /></Field>
                    <Field label="卡片类型"><Input value={cardToolDraft.card_type} onChange={e => setCardToolDraft(prev => ({ ...prev, card_type: e.target.value }))} /></Field>
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
                      }, '卡片绑定已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存绑定</button>
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
                      }, '卡片绑定已保存')} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"><Save size={14} />保存绑定</button>
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
