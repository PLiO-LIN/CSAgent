import ChatPanel from './components/ChatPanel'
import FrameworkStudioPanel from './components/FrameworkStudioPanel'
import { useChat } from './hooks/useChat'
import { useFrameworkProfile } from './hooks/useFrameworkProfile'

export default function App() {
  const chat = useChat()
  const framework = useFrameworkProfile()
  const ui = framework.profile.ui

  return (
    <div className="relative h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute left-[-8%] top-[-10%] h-[24rem] w-[24rem] rounded-full bg-[rgba(63,146,255,0.18)] blur-3xl" />
      <div className="pointer-events-none absolute right-[-6%] top-[8%] h-[20rem] w-[20rem] rounded-full bg-[rgba(11,96,224,0.16)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-[rgba(118,180,255,0.14)] blur-3xl" />

      <div className="relative mx-auto grid h-full max-w-[1480px] grid-rows-[minmax(0,1fr)_minmax(320px,38vh)] gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-none">
        <div className="telecom-panel h-full min-h-0">
          <ChatPanel
            {...chat}
            appName={ui.app_name}
            appSubtitle={ui.app_subtitle}
            welcomeTitle={ui.welcome_title}
            welcomeDescription={ui.welcome_description}
            quickActions={ui.quick_actions}
            highlights={ui.highlights}
            selectedIdentityPrefix={ui.selected_identity_prefix}
          />
        </div>
        <div className="telecom-panel h-[38vh] min-h-[320px] overflow-hidden xl:h-full xl:min-h-0">
          <FrameworkStudioPanel
            profile={framework.profile}
            info={framework.info}
            loading={framework.loading}
            saving={framework.saving}
            error={framework.error}
            selectedIdentity={chat.phone}
            onSelectIdentity={chat.setPhone}
            onSave={framework.saveProfile}
          />
        </div>
      </div>
    </div>
  )
}
