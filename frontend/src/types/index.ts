/**
 * 全局共享的类型定义。
 * 前后端的字段保持对齐（后端 Pydantic 模型 <-> 前端 TS 接口）。
 */

/** 消息角色：user 用户 / assistant AI / system 系统提示词（后端用） */
export type Role = "user" | "assistant" | "system";

/** 前端消息类型，id 用 string 以兼容临时消息和后端数字 ID */
export interface Message {
  id: string;
  role: Role;
  content: string;
}

/** 后端返回的消息（带数字 id 和时间戳） */
export interface ServerMessage {
  id: number;
  role: Role;
  content: string;
  created_at: string;
}

/** 一个对话（会话），包含标题和时间戳 */
export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

/** 用户信息（登录后从 /api/users/me 获取） */
export interface User {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  created_at: string;
}
