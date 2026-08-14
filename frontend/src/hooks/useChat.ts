import { useState, useRef, useCallback } from 'react'
import type { Message } from '../types'

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/**
 * 解析 SSE 数据流，提取出 content 文本片段
 * SSE 格式: data: {"content": "..."}\n\n  或  data: [DONE]\n\n
 * 返回: { content: string | null, done: boolean }
 */
function parseSSEChunk(chunk: string): { content: string | null; done: boolean } {
  // 去掉 "data: " 前缀和首尾空白
  const data = chunk.replace(/^data:\s*/, '').trim()
  if (data === '[DONE]') {
    return { content: null, done: true }
  }
  try {
    const parsed = JSON.parse(data)
    return { content: parsed.content ?? '', done: false }
  } catch {
    return { content: null, done: false }
  }
}

export function useChat(api: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleInputChange = useCallback((val: string) => {
    setInput(val)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Message = { id: generateId(), role: 'user', content: text }
    const assistantMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
    }
    const payload = [...messages, userMsg]

    setMessages([...payload, assistantMsg])
    setInput('')
    setIsLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || 'HTTP ' + res.status)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = '' // 缓冲区，处理不完整的 SSE 行

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE 以空行（\n\n）分隔每条消息
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || '' // 最后一段可能不完整，留到下次

        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed) continue

          const { content, done: isDone } = parseSSEChunk(trimmed)
          if (isDone) break // 收到 [DONE]，回复结束
          if (content) {
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, content: last.content + content }
              return copy
            })
          }
        }
      }
    } catch (e) {
      const err = e as Error
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last.role === 'assistant' && !last.content) {
            copy[copy.length - 1] = {
              ...last,
              content: '[请求失败] ' + err.message,
            }
          }
          return copy
        })
      }
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [input, messages, isLoading, api])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    input,
    isLoading,
    handleInputChange,
    sendMessage,
    stop,
    clearMessages,
  }
}
