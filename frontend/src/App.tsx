import { useState, useCallback } from 'react'
import { Input, Button, ConfigProvider } from 'antd'
import { SendOutlined, StopOutlined } from '@ant-design/icons'
import { useChat } from './hooks/useChat'
import MessageList from './components/MessageList'
import Sidebar, { type SidebarSession } from './components/Sidebar'
import styles from './App.module.css'

const { TextArea } = Input

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export default function App() {
  // ---- 会话管理状态（App 自己管理） ----
  const [sessions, setSessions] = useState<SidebarSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // ---- 聊天内容状态（委托给 useChat Hook） ----
  const {
    messages,
    input,
    isLoading,
    handleInputChange,
    sendMessage,
    stop,
    clearMessages,
  } = useChat('/api/chat')

  /** 新建对话：创建会话、设为活跃、清空聊天区 */
  const handleNewSession = useCallback(() => {
    const id = generateId()
    setSessions((prev) => [{ id, title: '新对话' }, ...prev])
    setActiveSessionId(id)
    clearMessages()
  }, [clearMessages])

  /** 切换对话：设为活跃并清空（当前实现：切换后从空白开始） */
  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSessionId(id)
      clearMessages()
    },
    [clearMessages],
  )

  /** 删除对话：移除会话，删的是当前对话则回到空状态 */
  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(null)
        clearMessages()
      }
    },
    [activeSessionId, clearMessages],
  )

  /** 发送消息：如果当前没有活跃会话，自动创建并用首条消息前 20 字做标题 */
  const handleSend = useCallback(() => {
    if (!activeSessionId && input.trim()) {
      const id = generateId()
      setSessions((prev) => [
        { id, title: input.trim().slice(0, 20) },
        ...prev,
      ])
      setActiveSessionId(id)
    }
    sendMessage()
  }, [activeSessionId, input, sendMessage])

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#10a37f',
          borderRadius: 8,
          fontFamily:
            "'Söhne', 'PingFang SC', -apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
        },
      }}
    >
      <div className={styles.layout}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
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
                      e.preventDefault() // 阻止 TextArea 默认换行
                      handleSend()
                    }
                  }}
                  placeholder="发送消息"
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  disabled={isLoading}
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
                    disabled={!input.trim()}
                  />
                )}
              </div>
              <p className={styles.inputHint}>
                AI 可能会犯错，请核实重要信息
              </p>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  )
}
