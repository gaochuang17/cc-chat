import { useEffect, useRef } from 'react'
import { Avatar } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import type { Message } from '../../types'
import MarkdownRenderer from '../MarkdownRenderer'
import styles from './MessageList.module.css'

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
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <RobotOutlined />
        </div>
        <h2 className={styles.emptyTitle}>有什么可以帮你</h2>
        <p className={styles.emptySub}>输入消息，开始对话</p>
      </div>
    )
  }

  return (
    <div className={styles.messages}>
      <div className={styles.messagesInner}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          return (
            <div className={styles.messageItem} key={msg.id}>
              <div
                className={`${styles.messageRow} ${isUser ? styles.messageRowUser : ''}`}
              >
                <div
                  className={`${styles.avatar} ${isUser ? styles.avatarUser : ''}`}
                >
                  <Avatar
                    size={32}
                    icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                  />
                </div>
                <div
                  className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
                >
                  {msg.role === 'assistant' ? (
                    msg.content ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : isLoading ? (
                      <div className={styles.typingIndicator}>
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                      </div>
                    ) : null
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
