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

  const handleNewSession = useCallback(() => {
    const id = generateId()
    setSessions((prev) => [{ id, title: '新对话' }, ...prev])
    setActiveSessionId(id)
    clearMessages()
  }, [clearMessages])

  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSessionId(id)
      clearMessages()
    },
    [clearMessages],
  )

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

          <div className={styles.inputArea}>
            <div className={styles.inputContainer}>
              <div className={styles.inputWrapper}>
                <TextArea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="发送消息"
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  disabled={isLoading}
                  variant="borderless"
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
