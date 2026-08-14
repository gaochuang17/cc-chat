/**
 * 核心 Hook：封装聊天逻辑。
 *
 * 职责：
 *   - 切换对话时自动从后端加载历史消息
 *   - 发送消息并以 SSE 流式接收 AI 回复（打字机效果）
 *   - 支持中断生成（AbortController）
 *   - 错误处理（区分主动中断和真实错误）
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { conversationApi, getToken } from "../lib/api";
import type { Message } from "../types";

/** 生成前端临时 ID：时间戳(36进制) + 随机串，用作 React 列表 key */
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * 解析单条 SSE 消息，提取 content 文本片段或 error 错误信息。
 *
 * SSE 数据格式：
 *   data: {"content": "你好"}\n\n   — 每个文本片段
 *   data: {"error": "..."}\n\n      — LLM 调用出错
 *   data: [DONE]\n\n              — 回复结束标记
 */
function parseSSEChunk(chunk: string): {
  content: string | null;
  error: string | null;
  done: boolean;
} {
  // 去掉 "data: " 前缀和首尾空白
  const data = chunk.replace(/^data:\s*/, "").trim();
  if (data === "[DONE]") {
    return { content: null, error: null, done: true };
  }
  try {
    const parsed = JSON.parse(data);
    if (parsed.error) {
      return { content: null, error: parsed.error, done: false };
    }
    return { content: parsed.content ?? "", error: null, done: false };
  } catch {
    // JSON 解析失败（数据不完整），跳过这一条
    return { content: null, error: null, done: false };
  }
}

export function useChat(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // 用 ref 而非 state 存储 AbortController，因为不需要触发重渲染
  const abortRef = useRef<AbortController | null>(null);
  // 标记当前正在发送/接收消息的对话，避免历史加载覆盖流式输出
  const activeSendConversationIdRef = useRef<number | null>(null);

  // 切换对话时从后端加载历史消息
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    // 草稿对话落库后可能立即发送消息：此时无需再拉取空历史，
    // 跳过可避免异步返回后清掉本地刚插入的用户消息和 AI 占位消息
    /** 
     * 通俗理解：如果这个对话已经在发送消息了，就不要再加载它的历史消息。
        1. 用户在草稿态发送第一条消息
        2. 前端创建新对话，拿到 conversation.id
        3. createConversation() 里 setActiveId(conv.id)
        4. useChat 的 conversationId 变化，触发历史加载 effect
        5. sendMessage 同时开始发送消息，并立即在界面上显示用户消息 + AI 占位消息
        6. 历史加载接口返回 []
        7. setMessages([]) 把刚显示的消息清空
     */
    if (activeSendConversationIdRef.current === conversationId) {
      return;
    }

    // cancelled 标志防止组件卸载后 setState 导致内存泄漏
    let cancelled = false;
    conversationApi
      .getMessages(conversationId)
      .then((serverMsgs) => {
        // 请求返回时如果已经开始发送消息，不能用历史结果覆盖当前流式内容
        if (
          !cancelled &&
          activeSendConversationIdRef.current !== conversationId
        ) {
          setMessages(
            serverMsgs.map((m) => ({
              id: String(m.id),
              role: m.role,
              content: m.content,
            })),
          );
        }
      })
      .catch(() => {
        if (
          !cancelled &&
          activeSendConversationIdRef.current !== conversationId
        ) {
          setMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const handleInputChange = useCallback((val: string) => {
    setInput(val);
  }, []);

  /** 中断正在进行的请求，用户点击"停止生成"时调用 */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  /**
   * 发送消息：核心流程是发送 → 流式接收 → 逐块追加到 UI。
   *
   * targetConversationId 用于“无活跃对话时先创建再发送”的场景：
   * App 创建完对话后可以立即传入新 ID，不需要等待 conversationId
   * prop 触发下一轮渲染。
   */
  const sendMessage = useCallback(
    async (targetConversationId?: number) => {
      const chatConversationId = targetConversationId ?? conversationId;
      if (!chatConversationId) return;
      const text = input.trim();
      if (!text || isLoading) return;

      // 1. 准备消息：用户消息 + 空的 AI 占位消息
      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text,
      };
      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "", // 空内容占位，流式数据回来后逐步填充
      };

      activeSendConversationIdRef.current = chatConversationId;

      // 2. 立即更新 UI：显示用户消息 + AI 空气泡
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsLoading(true);

      // 3. 创建中断控制器，绑定到即将发出的 fetch 请求
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // 4. 发送请求（只传对话 ID 和最新消息，历史由后端从数据库加载）
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            conversation_id: chatConversationId,
            message: text,
          }),
          signal: controller.signal, // 绑定中断信号，stop() 可随时取消
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        // 5. 获取流式读取器，逐块读取 SSE 数据
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = ""; // 缓冲区：网络不保证按 SSE 消息边界分块

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // { stream: true } 防止多字节字符（中文）被截断成乱码
          buffer += decoder.decode(value, { stream: true });

          // SSE 以空行（\n\n）分隔消息，切割出完整的消息块
          const parts = buffer.split("\n\n");
          // 最后一段可能不完整，存回 buffer 等下次拼接
          buffer = parts.pop() || "";

          // 逐条解析完整的 SSE 消息
          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            const { content, error, done: isDone } = parseSSEChunk(trimmed);
            if (isDone) break;
            if (error) throw new Error(error);
            if (content) {
              // 追加到本次请求的 AI 消息上（按 ID 定位，避免用户切换对话后误写）
              setMessages((prev) => {
                return prev.map((item) =>
                  item.id === assistantMsg.id
                    ? { ...item, content: item.content + content }
                    : item,
                );
              });
            }
          }
        }
      } catch (e) {
        const err = e as Error;
        // 区分两种情况：用户主动中断 vs 真实错误
        if (err.name !== "AbortError") {
          // 真实错误：在空 AI 气泡里显示错误信息
          setMessages((prev) => {
            return prev.map((item) =>
              item.id === assistantMsg.id && !item.content
                ? { ...item, content: "[请求失败] " + err.message }
                : item,
            );
          });
        }
        // AbortError（用户主动中断）：静默处理，已收到的部分内容保留
      } finally {
        // 无论成功/失败/中断，都重置状态
        setIsLoading(false);
        abortRef.current = null;
        activeSendConversationIdRef.current = null;
      }
    },
    [conversationId, input, isLoading],
  );

  return {
    messages,
    input,
    isLoading,
    handleInputChange,
    sendMessage,
    stop,
  };
}
