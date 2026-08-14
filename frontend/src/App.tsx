/**
 * 应用根组件：根据登录状态渲染不同页面。
 *
 * - 未登录或加载中：显示登录页 / 加载动画
 * - 已登录：显示聊天主界面（侧边栏 + 消息列表 + 输入区）
 */
import { useCallback, useState } from "react";
import {
  Input,
  Button,
  Spin,
  ConfigProvider,
  message as antdMessage,
} from "antd";
import { SendOutlined, StopOutlined } from "@ant-design/icons";
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
    activeId,
    setActiveId,
    create: createConversation,
    remove: deleteConversation,
    refresh: refreshConversations,
  } = useConversations(!!user);

  // ---- 聊天状态（绑定到当前活跃对话）----
  const { messages, input, isLoading, handleInputChange, sendMessage, stop } =
    useChat(activeId);

  /**
   * 进入新的草稿对话。
   *
   * 这里只清空当前选中状态和消息区，不立即创建数据库记录；
   * 等用户发送第一条消息时再真正落库，避免侧边栏积累空对话。
   */
  const handleNewSession = useCallback(() => {
    if (isCreatingConversation) return;
    if (isLoading) stop();
    setActiveId(null);
  }, [isCreatingConversation, isLoading, setActiveId, stop]);

  /** 选择已有对话 */
  const handleSelectSession = useCallback(
    (id: number) => {
      setActiveId(id);
    },
    [setActiveId],
  );

  /** 删除对话 */
  const handleDeleteSession = useCallback(
    async (id: number) => {
      await deleteConversation(id);
    },
    [deleteConversation],
  );

  /**
   * 发送消息。
   *
   * 如果当前没有活跃对话，先创建一条对话记录，再显式使用新对话 ID
   * 调用聊天接口。这样不依赖 setState 何时生效，也没有 setTimeout 竞态。
   * 发送完成后刷新侧边栏，因为后端会在首条消息时自动更新对话标题。
   */
  const handleSend = useCallback(async () => {
    if (isCreatingConversation || isLoading || !input.trim()) return;

    let conversationIdToSend = activeId;

    if (!activeId) {
      setIsCreatingConversation(true);
      try {
        const conversation = await createConversation();
        conversationIdToSend = conversation.id;
      } catch (e) {
        antdMessage.error((e as Error).message || "创建对话失败");
        return;
      } finally {
        setIsCreatingConversation(false);
      }
    }

    if (conversationIdToSend === null) return;

    // 显式传入对话 ID，避免依赖 useChat 的 conversationId prop 完成重渲染
    await sendMessage(conversationIdToSend);
    // 对话标题可能在后端被自动更新，发送结束后刷新侧边栏同步
    await refreshConversations();
  }, [
    activeId,
    createConversation,
    input,
    isCreatingConversation,
    isLoading,
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
          colorPrimary: "#10a37f",
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
                  disabled={isLoading || isCreatingConversation}
                  variant="borderless"
                />
                {/* 生成中显示停止按钮，空闲时显示发送按钮 */}
                {isLoading ? (
                  <Button
                    type="primary"
                    danger
                    icon={<StopOutlined />}
                    onClick={stop}
                  />
                ) : (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    disabled={!input.trim() || isCreatingConversation}
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
