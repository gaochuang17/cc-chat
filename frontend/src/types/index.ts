export type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  role: Role
  content: string
}

export interface ChatRequest {
  messages: Message[]
}

export interface Session {
  id: string
  title: string
  messages: Message[]
}
