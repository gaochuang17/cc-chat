/**
 * 全局共享的类型定义
 * 前后端的 Message 字段对齐（后端 Pydantic 模型也是 role + content）
 */

/** 消息角色：user 用户 / assistant AI / system 系统提示词（后端用，前端不显示） */
export type Role = 'user' | 'assistant' | 'system'

/** 单条消息：id 用于 React 列表 key 和精确更新，role 区分发送者 */
export interface Message {
  id: string
  role: Role
  content: string
}

/** 发给后端的请求体 */
export interface ChatRequest {
  messages: Message[]
}

/** 一个完整的会话（含标题和历史消息） */
export interface Session {
  id: string
  title: string
  messages: Message[]
}
