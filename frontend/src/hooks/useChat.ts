import { useState, useRef, useCallback } from "react";
import type { Message } from "../types";

/** 生成唯一 ID：时间戳(36进制) + 随机串，用作 React 列表 key */
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * 解析单条 SSE 消息，提取 content 文本片段。
 *
 * SSE 数据格式：
 *   data: {"content": "你好"}\n\n   — 每个文本片段
 *   data: [DONE]\n\n              — 回复结束标记
 *
 * 返回值：
 *   { content: string | null, done: boolean }
 */
function parseSSEChunk(chunk: string): {
  content: string | null;
  done: boolean;
} {
  // 去掉 "data: " 前缀和首尾空白
  const data = chunk.replace(/^data:\s*/, "").trim();
  if (data === "[DONE]") {
    return { content: null, done: true };
  }
  try {
    const parsed = JSON.parse(data);
    return { content: parsed.content ?? "", done: false };
  } catch {
    // JSON 解析失败（数据不完整），跳过这一条
    return { content: null, done: false };
  }
}

/**
 * 核心自定义 Hook：封装所有聊天逻辑。
 *
 * 职责：
 *   - 管理消息列表、输入框值、加载状态
 *   - 发送消息并以 SSE 流式接收 AI 回复（打字机效果）
 *   - 支持中断生成（AbortController）
 *   - 错误处理（区分主动中断和真实错误）
 */
export function useChat(api: string) {
  const [messages, setMessages] = useState<Message[]>([]); // 消息列表
  const [input, setInput] = useState(""); // 输入框内容
  const [isLoading, setIsLoading] = useState(false); // 是否正在等待 AI 回复
  const abortRef = useRef<AbortController | null>(null); // 中断控制器（用 ref 而非 state，因为不需要触发重渲染）

  /** 更新输入框值 */
  const handleInputChange = useCallback((val: string) => {
    setInput(val);
  }, []);

  /** 中断正在进行的请求，用户点击"停止生成"时调用 */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  /** 发送消息：核心流程是发送 → 流式接收 → 逐块追加到 UI */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return; // 空消息或正在生成时忽略

    // 1. 准备消息：用户消息 + 空的 AI 占位消息
    const userMsg: Message = { id: generateId(), role: "user", content: text };
    const assistantMsg: Message = {
      id: generateId(),
      role: "assistant",
      content: "", // 空内容占位，流式数据回来后逐步填充
    };
    // payload 包含完整对话历史（不含占位），发给后端做上下文
    const payload = [...messages, userMsg];

    // 2. 立即更新 UI：显示用户消息 + AI 空气泡
    setMessages([...payload, assistantMsg]);
    setInput("");
    setIsLoading(true);

    // 3. 创建中断控制器，绑定到即将发出的 fetch 请求
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 4. 发送请求（带完整历史，实现多轮对话）
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: controller.signal, // 绑定中断信号，stop() 可随时取消
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "HTTP " + res.status);
      }

      // 5. 获取流式读取器，逐块读取 SSE 数据
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // 缓冲区：网络不保证按 SSE 消息边界分块，半条消息留这里等下次拼

      while (true) {
        const { done, value } = await reader.read(); // value 是 Uint8Array（二进制）
        if (done) break; // 流结束

        // 二进制解码为字符串，{ stream: true } 防止多字节字符（中文）被截断成乱码
        buffer += decoder.decode(value, { stream: true });

        // SSE 以空行（\n\n）分隔消息，切割出完整的消息块
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || ""; // 最后一段可能不完整，存回 buffer 等下次拼接

        // 逐条解析完整的 SSE 消息
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const { content, done: isDone } = parseSSEChunk(trimmed);
          if (isDone) break; // 收到 [DONE]，回复结束
          if (content) {
            // 追加到最后一条 AI 消息的 content 上（打字机效果）
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                content: last.content + content,
              };
              return copy;
            });
          }
        }
      }
    } catch (e) {
      const err = e as Error;
      // 区分两种情况：用户主动中断 vs 真实错误
      if (err.name !== "AbortError") {
        // 真实错误（网络断了、后端 500）：在空 AI 气泡里显示错误信息
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last.role === "assistant" && !last.content) {
            copy[copy.length - 1] = {
              ...last,
              content: "[请求失败] " + err.message,
            };
          }
          return copy;
        });
      }
      // AbortError（用户主动中断）：静默处理，已收到的部分内容保留
    } finally {
      // 无论成功/失败/中断，都重置状态
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, messages, isLoading, api]);

  /** 清空消息（切换会话或新建对话时调用） */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    input,
    isLoading,
    handleInputChange,
    sendMessage,
    stop,
    clearMessages,
  };
}
