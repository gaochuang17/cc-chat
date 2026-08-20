/**
 * 应用根组件：根据登录状态渲染不同页面。
 *
 * - 未登录或加载中：显示登录页 / 加载动画
 * - 已登录：显示聊天主界面（侧边栏 + 消息列表 + 输入区）
 */
import { useCallback, useState } from "react";
import {
  Alert,
  Input,
  Button,
  Spin,
  ConfigProvider,
  message as antdMessage,
} from "antd";
import { ReloadOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { useAuth } from "./hooks/useAuth";
import { useConversations } from "./hooks/useConversations";
import { useChat } from "./hooks/useChat";
import LoginPage from "./components/LoginPage";
import MessageList from "./components/MessageList";
import Sidebar from "./components/Sidebar";
import styles from "./App.module.css";

const { TextArea } = Input;

export default function App() {
  // 首次发送且无活跃对话时会先创建对话；期间禁用输入，避免重复创建
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  // ---- 认证状态 ----
  const { user, loading, login, register, logout } = useAuth();
  // ---- 对话管理（仅在登录后启用）----
  const {
    conversations,
    create: createConversation,
    remove: deleteConversation,
    refresh: refreshConversations,
  } = useConversations(!!user);

  /*
   * ---- 聊天状态（按会话缓存）----
   *
   * 每个已创建会话在 chatStore.chats 中有自己的缓存。
   * chatStore.activeConversationId 保存当前选中的会话；点击已有会话时，
   * selectExistingConversation 会更新它并按需请求历史。
   */
  const {
    activeConversationId: activeId,
    messages,
    input,
    isLoading,
    isHistoryLoading,
    historyError,
    retryHistory,
    handleInputChange,
    sendMessage,
    stop,
    startDraftConversation,
    selectExistingConversation,
    adoptCreatedConversation,
    removeConversationChat,
  } = useChat(user?.id);

  /**
   * 进入新的草稿对话。
   *
   * 这里只切换到草稿态，不创建数据库记录，也不中断其他会话的流式生成。
   * 用户发送第一条消息时再调用创建接口，避免侧边栏积累空对话。
   */
  const handleNewSession = useCallback(() => {
    if (isCreatingConversation) return;
    startDraftConversation();
  }, [isCreatingConversation, startDraftConversation]);

  /** 选择已有对话 */
  const handleSelectSession = useCallback(
    (id: number) => {
      selectExistingConversation(id);
    },
    [selectExistingConversation],
  );

  /** 删除对话 */
  const handleDeleteSession = useCallback(
    async (id: number) => {
      // 先请求后端；只有确认删除成功，才放弃本地流式内容和缓存
      await deleteConversation(id);
      removeConversationChat(id);
    },
    [deleteConversation, removeConversationChat],
  );

  /**
   * 发送消息。
   *
   * 如果当前没有活跃对话，先创建一条对话记录，再显式使用新对话 ID
   * 调用聊天接口。三步按顺序执行：createConversation 创建记录，
   * adoptCreatedConversation 建立本地空缓存并选中它，sendMessage(newId)
   * 读取草稿并发送。
   * 发送完成后刷新侧边栏，因为后端会在首条消息时自动更新对话标题。
   */
  const handleSend = useCallback(async () => {
    /*
     * 五个前置检查分别处理：
     * 1. 创建请求在路上：避免重复创建空会话；
     * 2. 当前会话生成中：等待本轮回复结束；
     * 3. 历史加载中：避免历史响应和本次发送的本地更新交错到达；
     * 4. 历史加载失败：先重试恢复缓存，再允许继续发送；
     * 5. 输入为空：后端不需要处理空消息。
     */
    if (
      isCreatingConversation ||
      isLoading ||
      isHistoryLoading ||
      Boolean(historyError) ||
      !input.trim()
    )
      return;

    const isNewConversation = activeId === null;
    let newConversationId: number | null = null;

    if (isNewConversation) {
      setIsCreatingConversation(true);
      try {
        const conversation = await createConversation();
        newConversationId = conversation.id;
        // 建立空缓存并选中新 ID；这个动作不会请求历史。
        adoptCreatedConversation(newConversationId);
      } catch (e) {
        antdMessage.error((e as Error).message || "创建对话失败");
        return;
      } finally {
        setIsCreatingConversation(false);
      }
    }

    /*
     * 只有“新对话首次发送”才显式传入 ID：此时输入草稿仍在顶层
     * draftInput，而不是 chats[newId].draftInput。
     *
     * 已选中会话必须调用 sendMessage()，让 store 从当前
     * activeConversationId 对应的 chats[id].draftInput 读取草稿。
     */
    if (isNewConversation) {
      if (newConversationId === null) return;
      await sendMessage(newConversationId);
    } else {
      await sendMessage();
    }

    // 首条消息可能触发后端自动生成标题，结束后统一刷新侧边栏
    await refreshConversations();
  }, [
    activeId,
    createConversation,
    input,
    isCreatingConversation,
    isLoading,
    isHistoryLoading,
    historyError,
    adoptCreatedConversation,
    refreshConversations,
    sendMessage,
  ]);

  // 加载中：显示全屏 Spin
  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // 未登录：显示登录页
  if (!user) {
    return <LoginPage onLogin={login} onRegister={register} />;
  }

  // 已登录：显示聊天主界面
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#3b82f6",
          borderRadius: 8,
          fontFamily:
            "'Sohne', 'PingFang SC', -apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
        },
      }}
    >
      <div className={styles.layout}>
        <Sidebar
          sessions={conversations}
          activeSessionId={activeId}
          email={user.email}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
          onLogout={logout}
        />

        <div className={styles.main}>
          {/*
           * 历史错误必须阻塞发送：如果把它当成空会话继续发，
           * 后端仍会按数据库里的完整上下文生成，用户看到的上下文
           * 和模型实际输入会不一致。
           */}
          {historyError ? (
            <Alert
              className={styles.historyAlert}
              type="error"
              showIcon
              message="历史消息加载失败"
              description={historyError}
              action={
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    if (activeId !== null) retryHistory();
                  }}
                >
                  重试
                </Button>
              }
            />
          ) : null}

          <MessageList messages={messages} isLoading={isLoading} />

          {/* 输入区：圆角胶囊容器，内嵌 TextArea + 圆形发送按钮 */}
          <div className={styles.inputArea}>
            <div className={styles.inputContainer}>
              <div className={styles.inputWrapper}>
                <TextArea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onPressEnter={(e) => {
                    // Enter 发送，Shift+Enter 换行
                    if (!e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="发送消息"
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  disabled={
                    isLoading ||
                    isHistoryLoading ||
                    Boolean(historyError) ||
                    isCreatingConversation
                  }
                  variant="borderless"
                />
                {/* 生成中显示停止按钮，空闲时显示发送按钮 */}
                {isLoading ? (
                  <Button
                    type="primary"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => stop()}
                  />
                ) : (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    disabled={
                      !input.trim() ||
                      isLoading ||
                      isHistoryLoading ||
                      Boolean(historyError) ||
                      isCreatingConversation
                    }
                    loading={isCreatingConversation}
                  />
                )}
              </div>
              <p className={styles.inputHint}>AI 可能会犯错，请核实重要信息</p>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
