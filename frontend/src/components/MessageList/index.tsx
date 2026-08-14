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

  // 消息变化时（新消息或流式追加），自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 空状态：没有消息时显示欢迎界面
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
              {/* 消息行：用户右对齐（row-reverse），AI 左对齐 */}
              <div
                className={`${styles.messageRow} ${isUser ? styles.messageRowUser : ''}`}
              >
                {/* 头像：用户深色，AI 绿色 */}
                <div
                  className={`${styles.avatar} ${isUser ? styles.avatarUser : ''}`}
                >
                  <Avatar
                    size={32}
                    icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                  />
                </div>
                {/* 消息气泡：用户浅灰背景，AI 白色边框背景 */}
                <div
                  className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
                >
                  {msg.role === 'assistant' ? (
                    // AI 消息：有内容时渲染 Markdown，无内容且加载中时显示打字指示器
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
                    // 用户消息：纯文本，保留换行
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* 滚动锚点：挂载在列表底部，触发 scrollIntoView */}
      <div ref={bottomRef} />
    </div>
  )
}
