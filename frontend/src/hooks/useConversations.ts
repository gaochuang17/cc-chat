/**
 * 对话管理 Hook：封装对话的增删查改。
 *
 * 所有操作走真实后端 API，数据持久化在服务器。
 * enabled 参数控制是否启用（通常在用户登录后才启用）。
 */
import { useState, useCallback, useEffect } from "react";
import { conversationApi } from "../lib/api";
import type { Conversation } from "../types";

export function useConversations(enabled: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    // 从后端重新拉取对话列表，返回最新数据
    const list = await conversationApi.list();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    // 用户登录后自动加载对话列表
    if (enabled) refresh().catch(() => {});
  }, [enabled, refresh]);

  const create = useCallback(async () => {
    // 草稿对话首次发送时才调用：在后端创建记录，插入列表顶部并设为活跃
    const conv = await conversationApi.create();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, []);

  const remove = useCallback(async (id: number) => {
    // 从后端删除对话，如果删的是当前对话则清空活跃 ID
    await conversationApi.delete(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  /** 局部更新某对话的标题（不重新请求整个列表） */
  const updateTitle = useCallback((id: number, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  return {
    conversations,
    activeId,
    setActiveId,
    refresh,
    create,
    remove,
    updateTitle,
  };
}
