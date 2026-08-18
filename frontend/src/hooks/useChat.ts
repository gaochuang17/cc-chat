/**
 * useChat：Zustand chat store 的 React 适配层。
 *
 * App 仍然通过 useChat(activeId, userId) 获取当前会话状态；区别是真正
 * 的数据和流式请求生命周期在全局 store 中，切换 activeId 不会丢掉其他
 * 会话正在进行的生成内容。
 *
 * 这一层刻意保持“薄”：
 *   - 不保存聊天业务状态
 *   - 不直接调用聊天接口
 *   - 只负责把 React 的 activeId/userId 同步给 store，并把当前会话的
 *     状态和动作暴露给 UI
 */
import { useEffect } from "react";
import {
  selectIsHistoryLoading,
  selectIsLoading,
  selectHistoryError,
  selectInput,
  selectMessages,
  useChatStore,
} from "../stores/chatStore";

export function useChat(
  /** 当前 UI 选中的会话；null 表示草稿态，还没有落库 */
  conversationId: number | null,
  /** 当前登录用户 ID；变化或组件卸载时触发聊天缓存重置 */
  userId: string | null | undefined,
) {
  // 草稿和三个请求状态都只读取 conversationId 对应的那份状态
  const input = useChatStore(selectInput(conversationId));
  const messages = useChatStore(selectMessages(conversationId));
  const isLoading = useChatStore(selectIsLoading(conversationId));
  const isHistoryLoading = useChatStore(selectIsHistoryLoading(conversationId));
  const historyError = useChatStore(selectHistoryError(conversationId));

  // Zustand action 引用稳定；从 store 取出后可以直接作为回调使用
  const setInput = useChatStore((state) => state.setInput);
  const setActiveConversationId = useChatStore(
    (state) => state.setActiveConversationId,
  );
  const loadHistory = useChatStore((state) => state.loadHistory);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const stop = useChatStore((state) => state.stop);
  const resetChatStore = useChatStore((state) => state.resetChatStore);
  const removeConversationChat = useChatStore(
    (state) => state.removeConversationChat,
  );

  /*
   * 全局 store 不随登录状态自动销毁。
   *
   * userId 变化包含退出账号和切换账号；组件卸载覆盖页面级重挂载。
   * 这两种场景都必须清空 chats、草稿和请求句柄，否则旧账号仍在
   * 进行的流式请求可能把内容写回新账号界面。
   */
  useEffect(() => {
    return () => {
      resetChatStore();
    };
  }, [userId, resetChatStore]);

  useEffect(() => {
    /*
     * 先同步 activeConversationId，再触发历史加载。
     *
     * activeConversationId 只影响“当前展示哪份缓存”，不承载请求生命周期；
     * loadHistory 内部会根据 isLoading/historyLoaded/historyLoading 去重。
     */
    setActiveConversationId(conversationId);
    if (conversationId !== null) {
      void loadHistory(conversationId);
    }
  }, [conversationId, loadHistory, setActiveConversationId]);

  return {
    // messages/isLoading/isHistoryLoading 只描述当前选中的会话
    messages,
    input,
    isLoading,
    isHistoryLoading,
    historyError,

    // 历史失败后的显式恢复入口；草稿态没有会话 ID，因此不触发请求
    retryHistory: () => {
      if (conversationId !== null) {
        void loadHistory(conversationId);
      }
    },
    handleInputChange: setInput,
    sendMessage,
    stop,
    removeConversationChat,
  };
}
