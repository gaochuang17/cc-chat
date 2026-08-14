/**
 * 认证 Hook：管理登录状态。
 *
 * 职责：
 *   - 应用启动时检查 localStorage 中的 token，自动恢复登录态
 *   - 提供 login / register / logout 方法
 *   - 暴露 user（当前用户信息）和 loading（初始化中）状态
 */
import { useState, useCallback, useEffect } from "react";
import { authApi, getToken, clearToken } from "../lib/api";
import type { User } from "../types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  // loading 为 true 时表示正在检查 token 有效性，此时显示加载页
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      // 没有 token，直接结束加载
      setLoading(false);
      return;
    }
    // 有 token，调 /users/me 验证是否仍然有效
    // 如果 token 过期或无效，清除并跳回登录页
    authApi
      .getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // 登录成功后立即获取用户信息，保证 user 状态同步
    await authApi.login(email, password);
    const me = await authApi.getMe();
    setUser(me);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    // 注册成功后自动登录，省去用户再手动登录一步
    await authApi.register(email, password);
    await authApi.login(email, password);
    const me = await authApi.getMe();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    // 清除 token 和用户状态，App 会自动跳回登录页
    clearToken();
    setUser(null);
  }, []);

  return { user, loading, login, register, logout };
}
