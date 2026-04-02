export interface ToolCall {
  id: string
  name: string
  status: 'calling' | 'executing' | 'done' | 'error'
  input?: string
  output?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'summary'
  content: string
  thinking: string
  tools: ToolCall[]
  cards: Record<string, any>
  streaming: boolean
}

export interface ChatActionInput {
  content?: string
  displayContent?: string
  contentTemplate?: string
  displayTemplate?: string
  variables?: Record<string, string | number | boolean | null | undefined>
}
