import { useState } from 'react'
import { Phone, ArrowRight, ChevronDown, ShieldCheck, Sparkles, RadioTower } from 'lucide-react'

interface Props {
  onConfirm: (phone: string) => void
}

const MOCK_USERS = [
  { phone: '18018609133', name: '张三', plan: '云宽带美好家5G融合129元', desc: '融合套餐 · 含家庭宽带' },
  { phone: '15088889999', name: '孙悦', plan: '云宽带美好家5G融合159元', desc: '融合套餐 · 家庭共享' },
  { phone: '13912345678', name: '李四', plan: '5G畅享129元套餐', desc: '个人套餐 · 单卡用户' },
  { phone: '19916970157', name: '陈晨', plan: '星卡29元套餐', desc: '轻量套餐 · 新锐用户' },
  { phone: '13800138000', name: '赵敏', plan: '云宽带美好家5G融合229元', desc: '高流量家庭 · 多终端' },
  { phone: '15800001111', name: '王五', plan: '臻享美好家5G-A融合299元', desc: '旗舰档位 · 千兆宽带' },
]

export default function PhoneEntry({ onConfirm }: Props) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const selectedUser = MOCK_USERS.find(item => item.phone === phone)
  const highlights = [
    { icon: ShieldCheck, label: '安全可信' },
    { icon: RadioTower, label: '电信业务直连' },
    { icon: Sparkles, label: '智能场景推荐' },
  ]

  const submit = () => {
    if (!phone) {
      setError('请选择一个虚拟用户')
      return
    }
    setError('')
    onConfirm(phone)
  }

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(240,247,255,0.96))]">
      {/* 头部 */}
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0a4da8_0%,#0f6fff_46%,#53b2ff_100%)] px-6 py-5 text-white">
        <div className="pointer-events-none absolute left-[-2rem] top-[-3rem] h-28 w-28 rounded-full bg-white/12 blur-2xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-44 rounded-full bg-[rgba(255,255,255,0.16)] blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/20 bg-white/16 backdrop-blur">
            <span className="text-xl font-bold tracking-[0.08em]">翼</span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-[0.04em] text-white">中国电信智能客服</h1>
            <p className="mt-1 text-xs text-white/78">小翼在线服务台</p>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {highlights.map((item, idx) => {
            const Icon = item.icon
            return (
              <div key={idx} className="telecom-chip inline-flex items-center gap-1.5">
                <Icon size={12} />
                {item.label}
              </div>
            )
          })}
        </div>
      </div>

      {/* 手机号输入区 */}
      <div className="flex flex-1 items-center justify-center px-6 py-8 sm:px-8">
        <div className="w-full max-w-3xl rounded-[30px] border border-white/70 bg-white/72 p-6 shadow-[0_22px_54px_rgba(13,63,145,0.10)] backdrop-blur-xl sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr] lg:items-center">
            <div>
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,rgba(15,111,255,0.18),rgba(106,178,255,0.26))] shadow-inner shadow-[rgba(15,111,255,0.08)]">
                <Phone size={34} className="text-[var(--telecom-blue-600)]" />
              </div>

              <h2 className="mt-6 text-[1.55rem] font-semibold tracking-[0.02em] text-slate-800">欢迎接入中国电信在线服务</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">请选择一个虚拟用户，我们会按对应号码的套餐、余额、账单和订单画像，为您呈现更接近中国电信客服工作台的服务体验。</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {highlights.map((item, idx) => {
                  const Icon = item.icon
                  return (
                    <div key={idx} className="telecom-metric px-4 py-4">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{item.label}</span>
                        <Icon size={15} className="text-[var(--telecom-blue-500)]" />
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-700">客服体验更统一</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4 rounded-[26px] border border-[rgba(15,111,255,0.08)] bg-[linear-gradient(180deg,rgba(247,250,255,0.92),rgba(240,247,255,0.82))] p-5 shadow-[0_14px_32px_rgba(13,63,145,0.08)]">
              <div>
                <div className="text-sm font-semibold text-slate-800">选择虚拟用户</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">进入对话后，将以该号码的真实业务画像进行查询、推荐与办理演示。</div>
              </div>

          <div>
            <div className="relative">
              <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--telecom-blue-400)]" />
              <select
                value={phone}
                onChange={e => {
                  setPhone(e.target.value)
                  setError('')
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') submit()
                }}
                className="telecom-input w-full appearance-none pl-12 pr-10 py-3 text-base"
                autoFocus
              >
                <option value="">请选择虚拟用户</option>
                {MOCK_USERS.map(user => (
                  <option key={user.phone} value={user.phone}>
                    {user.name} · {user.phone}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--telecom-blue-400)]" />
            </div>
            {error && (
              <p className="mt-1.5 pl-1 text-xs text-rose-500">{error}</p>
            )}
          </div>

          {selectedUser && (
            <div className="telecom-card telecom-card-accent-soft px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{selectedUser.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{selectedUser.phone}</div>
                </div>
                <div className="telecom-chip-muted text-[11px]">
                  {selectedUser.desc}
                </div>
              </div>
              <div className="telecom-inner-panel mt-3 px-3 py-3 text-sm text-slate-600">
                当前套餐：<span className="font-medium text-slate-800">{selectedUser.plan}</span>
              </div>
            </div>
          )}

          <button
            onClick={submit}
            className="telecom-primary-btn w-full rounded-[18px] py-3.5"
          >
            开始咨询
            <ArrowRight size={18} />
          </button>

          <p className="text-center text-xs text-slate-400">
            选择用户后，可直接查询套餐、余额、账单、订单等信息
          </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
