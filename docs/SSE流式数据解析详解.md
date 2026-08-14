# SSE 流式数据解析详解

> 结合浏览器 DevTools 中观察到的真实 SSE 数据，详解前端 `useChat.ts` 中流式读取与解析的完整过程。

## 一、浏览器中看到的原始数据

在浏览器 DevTools 的 Network 面板中，`/api/chat` 接口的响应数据如下：

```
data: {"content": "你好"}

data: {"content": "！"}

data: {"content": "有什么"}

data: {"content": "问题"}

data: {"content": "或"}

data: {"content": "需求"}

data: {"content": "可以帮助"}

data: {"content": "你"}

data: {"content": "吗"}

data: {"content": "？"}

data: {"content": "无论是"}

data: {"content": "技术"}

data: {"content": "咨询"}

data: {"content": "、"}

data: {"content": "学习"}

data: {"content": "资料"}

data: {"content": "还是"}

data: {"content": "其他"}

data: {"content": "方面的"}

data: {"content": "帮助"}

data: {"content": "，"}

data: {"content": "都可以"}

data: {"content": "随时"}

data: {"content": "告诉我"}

data: {"content": "哦"}

data: {"content": "！"}

data: [DONE]
```

**关键认知：DevTools 里看到的是最终完整的响应内容，但代码处理时数据是一块一块随机到达的，不是一次性到的。**

---

## 二、核心代码

```ts
const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

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
```

---

## 三、三个核心 API 的作用

### 3.1 `res.body!.getReader()`

`fetch()` 返回的 `Response` 对象中，`res.body` 是一个 `ReadableStream` —— 代表一个尚未读完的数据流。对于流式响应（SSE / chunked transfer），数据不是一次性全到的，而是分块陆续到达。

`getReader()` 给这个流获取一个读取器，之后可以用 `reader.read()` 一次读一块：

```
普通响应:  后端把完整数据打包 → 一次性返回 → res.json() 直接拿全量
流式响应:  后端逐块推送 → res.body 是一个 ReadableStream → 边到边读
```

`res.body` 后面的 `!` 是 TypeScript 非空断言，告诉编译器"这个响应一定有 body"。

### 3.2 `new TextDecoder()`

`reader.read()` 返回的 `value` 是 `Uint8Array` —— 原始二进制字节，不是字符串。`TextDecoder` 把二进制字节解码成字符串：

```ts
const decoder = new TextDecoder()       // 默认 UTF-8 解码器
const bytes = new Uint8Array([228, 189, 160, 229, 165, 189])
const text = decoder.decode(bytes)       // "你好"
```

### 3.3 `{ stream: true }` 参数

解决多字节字符（如中文）被网络分块切断的问题。"你好"的 UTF-8 字节是 6 个字节，假设网络恰好这样分两次到达：

```
第一个 chunk: [228, 189]              ← 只是"你"的前两个字节，不完整
第二个 chunk: [160, 229, 165, 189]    ← "你"的第三个字节 + "好"的全部
```

不加 `{ stream: true }`，每次独立 decode 会产生乱码。加了之后，decoder 内部会缓存不完整的字节，等下个 chunk 来了再拼：

```ts
// 第一次调用
decode([228, 189], { stream: true })   // → ""（缓存这 2 个字节）

// 第二次调用
decode([160, 229, 165, 189], { stream: true })  // → "你好"（拼上缓存的 2 字节，完整了）
```

---

## 四、网络实际分块情况

代码处理时，上面的数据不会一次性到达，而是随机分块：

```
─── 第 1 次 reader.read() ───
"data: {\"content\": \"你好\"}\n\n"
（刚好 1 条完整消息）

─── 第 2 次 reader.read() ───
"data: {\"content\": \"！\"}\n\ndata: {\"content\": \"有什么\"}\n\n"
（一下子来了 2 条完整消息）

─── 第 3 次 reader.read() ───
"data: {\"content\": \"问题"
（半条！JSON 被截断了，连 \n\n 都没有）

─── 第 4 次 reader.read() ───
"\"}\n\ndata: {\"content\": \"或\"}\n\ndata: {\"content\": \"需求\"}\n\n"
（第 3 次的后半段 + 2 条完整消息）

─── 第 5 次 reader.read() ───
"data: [DONE]\n\n"
（结束标记）

... 中间省略 ...
```

这就是为什么需要 buffer —— 网络不保证按消息边界分块。

---

## 五、逐次 read 的处理过程

### 第 1 次 read

```ts
value = <Uint8Array: 100, 97, 116, 97, ...>  // "data: ..." 的二进制

buffer += decoder.decode(value, { stream: true })
// buffer = 'data: {"content": "你好"}\n\n'

const parts = buffer.split('\n\n')
// parts = ['data: {"content": "你好"}', '']

buffer = parts.pop() || ''
// parts 变成 ['data: {"content": "你好"}']
// buffer = ''  （pop 出来的是空字符串，buffer 清空）

for (const part of parts) {  // 只有一个元素
  const { content, done } = parseSSEChunk('data: {"content": "你好"}')
  // 去掉 "data: " 前缀 → '{"content": "你好"}'
  // JSON.parse → { content: "你好" }
  // 返回 { content: "你好", done: false }

  setMessages(prev => {
    // 最后一条 AI 消息的 content: "" → "你好"
  })
}
```

**用户看到：聊天气泡里出现"你好"**

---

### 第 2 次 read

```ts
buffer += decoder.decode(value, { stream: true })
// buffer = 'data: {"content": "！"}\n\ndata: {"content": "有什么"}\n\n'

const parts = buffer.split('\n\n')
// parts = ['data: {"content": "！"}', 'data: {"content": "有什么"}', '']

buffer = parts.pop() || ''
// parts = ['data: {"content": "！"}', 'data: {"content": "有什么"}']
// buffer = ''

for (const part of parts) {
  // 第一轮：content = "！"，追加 → 气泡变成 "你好！"
  // 第二轮：content = "有什么"，追加 → 气泡变成 "你好！有什么"
}
```

**用户看到：气泡在快速逐字增长**

---

### 第 3 次 read（关键！半条消息到达）

```ts
buffer += decoder.decode(value, { stream: true })
// buffer = 'data: {"content": "问题'

const parts = buffer.split('\n\n')
// parts = ['data: {"content": "问题']  ← 只有一段，没有 \n\n

buffer = parts.pop() || ''
// parts = []（空数组！pop 把唯一一段拿走了）
// buffer = 'data: {"content": "问题'  ← 不完整的消息，存起来等下次
```

这次 buffer 里没有 `\n\n`，说明这条消息还没结束。split 产生一个元素的数组，pop 把它拿走存回 buffer，parts 变成空数组，循环什么都不执行。

**用户看到：气泡停在"你好！有什么"，没有变化**（等待第 4 次 read）

---

### 第 4 次 read（半条消息补全 + 新消息）

```ts
buffer += decoder.decode(value, { stream: true })
// buffer = 'data: {"content": "问题' + '"}\n\ndata: {"content": "或"}\n\ndata: {"content": "需求"}\n\n'
//         ↑ 上次的半条拼上了！

const parts = buffer.split('\n\n')
// parts = ['data: {"content": "问题"}', 'data: {"content": "或"}', 'data: {"content": "需求"}', '']

buffer = parts.pop() || ''
// parts = ['data: {"content": "问题"}', 'data: {"content": "或"}', 'data: {"content": "需求"}']
// buffer = ''

for (const part of parts) {
  // 第一轮：content = "问题" → 气泡变成 "你好！有什么问题"
  // 第二轮：content = "或" → 气泡变成 "你好！有什么问题或"
  // 第三轮：content = "需求" → 气泡变成 "你好！有什么问题或需求"
}
```

**用户看到：气泡突然补了三个字**（因为等待期间积攒了内容，这次一次性渲染出来）

---

### 最后一次 read（收到 [DONE]）

```ts
buffer += decoder.decode(value, { stream: true })
// buffer = 'data: [DONE]\n\n'

const parts = buffer.split('\n\n')
// parts = ['data: [DONE]', '']

buffer = parts.pop() || ''
// parts = ['data: [DONE]']
// buffer = ''

for (const part of parts) {
  const { content, done: isDone } = parseSSEChunk('data: [DONE]')
  // 去掉前缀 → '[DONE]'
  // 匹配到结束标记 → 返回 { content: null, done: true }

  if (isDone) break  // 退出内层循环
}
```

下次 `reader.read()` 返回 `done: true`，退出外层 `while(true)` 循环，进入 `finally` 块，`setIsLoading(false)`。

**用户看到：停止按钮变回发送按钮，回复结束**

---

## 六、最终效果

整个过程在几百毫秒内完成几十次循环，用户看到的效果是：

```
你好 → 你好！ → 你好！有什么 → (停顿) → 你好！有什么问题或需求 → ...
```

气泡里的文字不断增长，直到收到 `[DONE]` 后停止。这就是打字机效果的本质 —— 不是后端延迟发送每个字，而是数据自然分块到达，前端逐块追加渲染。

---

## 七、为什么 buffer 是整套逻辑的灵魂

假设没有 buffer，直接解析每次 read 的数据：

```
第 3 次 read: "data: {\"content\": \"问题"
→ JSON.parse('{"content": "问题')  → 💥 报错，这条消息丢了
```

buffer 保证了：只有拼成完整的 `data: {...}\n\n` 消息才会被解析，半条消息永远留着等下一次拼上。这是处理 SSE 流不可变的标准做法。

---

## 八、整体数据流可视化

```
后端 yield "data: {"content":"你好"}\n\n"
        ↓  HTTP chunked transfer（网络层可能重新分块）
        ↓
reader.read() → value: Uint8Array [100, 97, 116, 97, ...]  （二进制字节）
        ↓  decoder.decode(value, { stream: true })
        ↓  （二进制 → 字符串，处理多字节字符截断）
buffer += 'data: {"content":"你好"}\n\n'
        ↓  buffer.split('\n\n')
        ↓  （按 SSE 消息边界切割，不完整的留在 buffer）
parts = ['data: {"content":"你好"}']   ← 完整消息
        ↓  parseSSEChunk()
        ↓  （去掉 data: 前缀，JSON.parse 提取 content）
content = "你好"
        ↓  setMessages(prev => ... + content)
        ↓  （追加到最后一条 AI 消息，React 重新渲染）
用户看到: "你好" 出现在聊天界面
```

整个过程在一个 `while(true)` 循环里反复执行，每收到一块数据就走一遍这个流程，直到 `done: true` 或收到 `[DONE]` 标记。
