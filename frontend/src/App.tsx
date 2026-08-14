import { useState, useCallback } from 'react'
import { Input, Button, ConfigProvider } from 'antd'
import {
  SendOutlined,
  StopOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useChat } from './hooks/useChat'
import MessageList from './components/MessageList'
import Sidebar, { type SidebarSession } from './components/Sidebar'

const { TextArea } = Input

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export default function App() {
  const [sessions, setSessions] = useState<SidebarSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const {
    messages,
    input,
    isLoading,
    handleInputChange,
    sendMessage,
    stop,
    clearMessages,
  } = useChat('/api/chat')

  // 新建对话
  const handleNewSession = useCallback(() => {
    const id = generateId()
    const newSession: SidebarSession = {
      id,
      title: '新对话',
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(id)
    clearMessages()
  }, [clearMessages])

  // 选择对话
  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSessionId(id)
      clearMessages()
    },
    [clearMessages],
  )

  // 删除对话
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

  // 发送消息时更新对话标题
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
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <div className="chat-layout">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
        />

        <div className="chat-main">
          {/* 顶部标题栏 */}
          <div
            style={{
              padding: '12px 24px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <RobotOutlined style={{ fontSize: 18, color: '#52c41a' }} />
            <span style={{ fontSize: 16, fontWeight: 500 }}>AI 智能助手</span>
          </div>

          {/* 消息列表 */}
          <MessageList messages={messages} isLoading={isLoading} />

          {/* 输入区 */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <TextArea
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={isLoading}
              />
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
          </div>
        </div>
      </div>
    </ConfigProvider>
  )
}
