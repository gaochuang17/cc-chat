/**
 * useChat：Zustand chat store 的 React 适配层。
 *
 * App 通过 useChat(userId) 获取聊天状态和动作。消息缓存、当前选中的
 * 会话 ID 和流式请求都在全局 store 中；切换 activeConversationId 只改变
 * 本 Hook 返回哪份缓存，不会中断其他会话正在进行的生成。
 *
 * 这一层刻意保持“薄”：
 *   - 不保存聊天业务状态
 *   - 不直接调用聊天接口
 *   - 只读取当前选中会话的状态，并把 store 动作暴露给 UI
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
  /** 当前登录用户 ID；变化或组件卸载时触发聊天缓存重置 */
  userId: string | null | undefined,
) {
  // 当前选中的会话 ID 保存在 store；null 表示尚未创建的新对话。
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  );

  // 草稿和三个请求状态都从当前选中会话的 chats[id] 中读取
  const input = useChatStore(selectInput(activeConversationId));
  const messages = useChatStore(selectMessages(activeConversationId));
  const isLoading = useChatStore(selectIsLoading(activeConversationId));
  const isHistoryLoading = useChatStore(
    selectIsHistoryLoading(activeConversationId),
  );
  const historyError = useChatStore(selectHistoryError(activeConversationId));

  // Zustand action 引用稳定；从 store 取出后可以直接作为回调使用
  const setInput = useChatStore((state) => state.setInput);
  const startDraftConversation = useChatStore(
    (state) => state.startDraftConversation,
  );
  const selectExistingConversation = useChatStore(
    (state) => state.selectExistingConversation,
  );
  const adoptCreatedConversation = useChatStore(
    (state) => state.adoptCreatedConversation,
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
   * 进行的流式请求可能把内容显示到新账号界面。
   */
  useEffect(() => {
    return () => {
      resetChatStore();
    };
  }, [userId, resetChatStore]);

  return {
    activeConversationId,

    // messages/isLoading/isHistoryLoading 只描述当前选中的会话
    messages,
    input,
    isLoading,
    isHistoryLoading,
    historyError,

    // 历史失败后的显式恢复入口；草稿态没有会话 ID，因此不触发请求
    retryHistory: () => {
      const currentConversationId =
        useChatStore.getState().activeConversationId;
      if (currentConversationId !== null) {
        void loadHistory(currentConversationId);
      }
    },
    handleInputChange: setInput,
    sendMessage,
    stop,
    startDraftConversation,
    selectExistingConversation,
    adoptCreatedConversation,
    removeConversationChat,
  };
}
