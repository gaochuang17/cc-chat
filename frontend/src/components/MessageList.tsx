import { useEffect, useRef } from 'react'
import { Avatar } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import type { Message } from '../types'
import MarkdownRenderer from './MarkdownRenderer'

export default function MessageList({
  messages,
  isLoading,
}: {
  messages: Message[]
  isLoading: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <RobotOutlined style={{ fontSize: 48, marginBottom: 16 }} />
        <p style={{ fontSize: 16, marginBottom: 4 }}>AI 智能助手</p>
        <p style={{ fontSize: 13 }}>输入消息开始对话</p>
      </div>
    )
  }

  return (
    <div className="chat-messages">
      <div className="chat-messages-inner">
        {messages.map((msg) => (
          <div className="message-item" key={msg.id}>
            <Avatar
              className={'message-avatar ' + msg.role}
              icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
              size={32}
            />
            <div className={'message-content ' + msg.role}>
              {msg.role === 'assistant' ? (
                <MarkdownRenderer content={msg.content} />
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message-item">
            <Avatar
              className="message-avatar assistant"
              icon={<RobotOutlined />}
              size={32}
            />
            <div className="message-content assistant">
              <span style={{ color: '#999' }}>正在生成...</span>
            </div>
          </div>
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
