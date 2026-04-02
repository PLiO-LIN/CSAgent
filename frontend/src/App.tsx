import PlatformWorkbench from './components/PlatformWorkbench'
import { useChat } from './hooks/useChat'
import { useFrameworkProfile } from './hooks/useFrameworkProfile'

export default function App() {
  const chat = useChat()
  const framework = useFrameworkProfile()

  return (
    <PlatformWorkbench
      chat={chat}
      profile={framework.profile}
      info={framework.info}
      loading={framework.loading}
      saving={framework.saving}
      error={framework.error}
      saveProfile={framework.saveProfile}
    />
  )
}
