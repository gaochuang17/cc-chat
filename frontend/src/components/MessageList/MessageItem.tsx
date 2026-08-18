import { memo } from "react";
import { Avatar } from "antd";
import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import type { Message } from "../../types";
import MarkdownRenderer from "../MarkdownRenderer";
import styles from "./MessageList.module.css";

/**
 * 单条消息渲染组件。
 *
 * 流式输出时只有当前 assistant 消息的内容引用会变化；使用 memo 后，
 * 前面的历史消息可以跳过重新渲染，长对话下的 chunk 更新成本更低。
 */
const MessageItem = memo(function MessageItem({
  message,
  isLoading,
}: {
  message: Message;
  isLoading: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={styles.messageItem}>
      {/* 消息行：用户右对齐（row-reverse），AI 左对齐 */}
      <div
        className={`${styles.messageRow} ${isUser ? styles.messageRowUser : ""}`}
      >
        {/* 头像：用户深色，AI 绿色 */}
        <div className={`${styles.avatar} ${isUser ? styles.avatarUser : ""}`}>
          <Avatar
            size={32}
            icon={isUser ? <UserOutlined /> : <RobotOutlined />}
          />
        </div>

        {/* 消息气泡：用户浅灰背景，AI 白色边框背景 */}
        <div
          className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}
        >
          {message.role === "assistant" ? (
            // AI 消息：有内容时渲染 Markdown，无内容且加载中时显示打字指示器
            message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : isLoading ? (
              <div className={styles.typingIndicator}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </div>
            ) : null
          ) : (
            // 用户消息：纯文本，保留换行
            <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default MessageItem;
