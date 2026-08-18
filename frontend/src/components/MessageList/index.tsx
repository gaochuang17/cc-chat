import { useEffect, useRef } from "react";
import { RobotOutlined } from "@ant-design/icons";
import type { Message } from "../../types";
import MessageItem from "./MessageItem";
import styles from "./MessageList.module.css";

export default function MessageList({
  messages,
  isLoading,
}: {
  messages: Message[];
  isLoading: boolean;
}) {
  // listRef 用于计算滚动位置；bottomRef 是实际滚动目标
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /*
   * 记录上一次渲染时最后一条消息的临时 ID。
   *
   * ID 变化说明是“新消息”或“切换会话”；ID 不变而 messages 引用变化，
   * 通常就是最后一条 assistant 消息的流式追加。
   */
  const lastMessageIdRef = useRef<string | null>(null);
  const lastMessage = messages[messages.length - 1];

  /*
   * 滚动策略区分两类变化：
   * - 新消息或切换会话：强制滚到底部，保证用戟能看到最新消息；
   * - 同一条消息流式追加：只有用户本来就在底部附近时才继续跟随，
   *   避免用户回看上文时被每个 chunk 强行拉回底部。
   */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const isNewMessage = lastMessageIdRef.current !== (lastMessage?.id ?? null);
    lastMessageIdRef.current = lastMessage?.id ?? null;

    if (!isNewMessage) {
      // 80px 容差覆盖滚动边界误差，也允许用户略微上移查看最后一屏
      const distanceToBottom =
        list.scrollHeight - list.scrollTop - list.clientHeight;
      if (distanceToBottom > 80) return;
    }

    bottomRef.current?.scrollIntoView({
      // 流式追加使用 auto，避免高频率 smooth 动画互相抢占
      behavior: isNewMessage ? "smooth" : "auto",
    });
  }, [messages, lastMessage?.id]);

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
    );
  }

  return (
    <div ref={listRef} className={styles.messages}>
      <div className={styles.messagesInner}>
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} isLoading={isLoading} />
        ))}
      </div>
      {/* 滚动锚点：挂载在列表底部，触发 scrollIntoView */}
      <div ref={bottomRef} />
    </div>
  );
}
