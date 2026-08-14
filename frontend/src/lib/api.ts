/**
 * API 工具层：封装所有与后端的 HTTP 通信。
 *
 * 职责：
 *   - JWT token 的存取（localStorage）
 *   - 统一的认证请求封装（apiFetch），自动注入 Authorization 头
 *   - 认证 API（authApi）和对话 API（conversationApi）的接口定义
 */
import type { User, Conversation, Message } from "../types";

/** API 基础路径，Vite 开发服务器会代理 /api 到后端 8000 端口 */
const API_BASE = "/api";
/** localStorage 中存储 JWT token 的 key */
const TOKEN_KEY = "chat_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 统一的认证请求封装。
 *
 * 自动从 localStorage 读取 token 并附加到请求头，
 * 如果响应非 2xx，解析错误信息并抛出异常。
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    // 尝试从响应体解析错误详情，解析失败则用 HTTP 状态码
    let detail = "";
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  // 204 No Content 没有 body，直接返回 undefined
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const authApi = {
  /** 注册新用户 */
  register: (email: string, password: string) =>
    apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  /**
   * 登录并保存 token。
   * fastapi-users 的登录接口用 OAuth2 表单格式（非 JSON），
   * 所以这里单独用 URLSearchParams 而非 apiFetch。
   */
  login: async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);
    const res = await fetch(`${API_BASE}/auth/jwt/login`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("邮箱或密码错误");
    const data = await res.json();
    setToken(data.access_token);
  },

  /** 获取当前登录用户信息 */
  getMe: () => apiFetch<User>("/users/me"),
};

export const conversationApi = {
  /** 列出当前用户的所有对话 */
  list: () => apiFetch<Conversation[]>("/conversations"),

  /** 创建新对话，title 不传则后端默认"新对话" */
  create: (title?: string) =>
    apiFetch<Conversation>("/conversations", {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    }),

  /** 获取某对话的全部历史消息 */
  getMessages: (id: number) =>
    apiFetch<Message[]>(`/conversations/${id}/messages`),

  /** 删除对话（后端级联删除其所有消息） */
  delete: (id: number) =>
    apiFetch<void>(`/conversations/${id}`, { method: "DELETE" }),
};
