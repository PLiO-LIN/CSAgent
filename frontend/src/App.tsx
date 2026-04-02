import ChatPanel from './components/ChatPanel'
import PhoneEntry from './components/PhoneEntry'
import { useChat } from './hooks/useChat'

export default function App() {
  const chat = useChat()

  return (
    <div className="relative h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute left-[-8%] top-[-10%] h-[24rem] w-[24rem] rounded-full bg-[rgba(63,146,255,0.18)] blur-3xl" />
      <div className="pointer-events-none absolute right-[-6%] top-[8%] h-[20rem] w-[20rem] rounded-full bg-[rgba(11,96,224,0.16)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-[rgba(118,180,255,0.14)] blur-3xl" />

      <div className="relative mx-auto flex h-full max-w-[1280px] items-center justify-center">
        <div className="telecom-panel h-full max-h-[920px] w-full max-w-[1180px]">
        {chat.phone ? <ChatPanel {...chat} /> : <PhoneEntry onConfirm={chat.setPhone} />}
        </div>
      </div>
    </div>
  )
}
