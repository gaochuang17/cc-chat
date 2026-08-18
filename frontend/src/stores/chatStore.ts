/**
 * 聊天状态 Store。
 *
 * 为什么使用 Zustand：
 * 聊天缓存必须放在组件渲染生命周期之外。用户从会话 A 切到 B 时，
 * 只是切换 UI 投影；A 中仍在接收的 SSE 请求不会被卸载或中断，切回 A
 * 时可以继续看到已经追加的回复内容。
 *
 * 状态归属：
 * - chats[id]：每个已落库会话独立保存消息、请求状态和输入草稿
 * - draftInput：顶层草稿，只服务“新对话”落库前的输入
 * - activeConversationId：UI 当前展示的会话，只影响默认操作目标
 * - abortControllers：命令型请求句柄，不属于可渲染状态
 * - storeGeneration：账号缓存周期，用来拒绝旧账号的迟到响应
 *
 * 异步写回原则：
 * 每次异步返回后都不能假设“发起请求时的状态仍然有效”。写回前必须
 * 根据场景确认账号未重置、会话未删除、请求未被停止或替换。数据库仍是
 * 唯一长期数据源；刷新页面后这里的缓存会重建。
 */
import { create } from "zustand";
import { conversationApi, getToken } from "../lib/api";
import type { Message } from "../types";

/**
 * 生成前端临时消息 ID。
 *
 * 历史消息使用后端数字 ID 转成的字符串；乐观插入的用户消息和
 * assistant 占位消息此时还没有后端 ID，所以先用临时 ID 保证 React key
 * 稳定，并在流式过程中用它定位要追加内容的气泡。
 */
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** 单个会话独立的聊天缓存和请求状态 */
export interface ConversationChatState {
  /**
   * 当前会话在 UI 中展示的消息。
   *
   * 来源有两种：
   * - loadHistory 成功后由服务端历史替换
   * - sendMessage 后插入乐观消息，并按 SSE chunk 逐步追加
   *
   * 因此它是“当前本地视图”，不一定和数据库中某一时刻的快照完全一致。
   */
  messages: Message[];

  /**
   * 该会话是否正在接收 AI 回复。
   *
   * 状态按会话隔离：A 生成中不影响 B 继续输入或发送；切换会话也不会
   * 把不同请求的 loading 状态混在一起。
   */
  isLoading: boolean;

  /**
   * 本地视图是否已经可用。
   *
   * 该值不只表示“历史加载成功”：
   * - loadHistory 成功后置为 true，避免重复拉取；
   * - sendMessage 乐观更新后也置为 true，表示本地已有更新的待完成视图。
   *
   * 第二种情况会阻止迟到的历史快照覆盖刚插入的用户消息和 assistant
   * 占位消息，是首次发送与空历史请求并发时的关键防线。
   */
  historyLoaded: boolean;

  /** 历史请求是否进行中；只用于去重，不代表缓存已可用 */
  historyLoading: boolean;

  /**
   * 历史加载失败原因。
   *
   * 失败时保持 historyLoaded=false，让 UI 显示重试入口；不能把失败伪装
   * 成空会话，否则用户看到的上下文和后端实际传给模型的上下文会不一致。
   */
  historyError: string | null;

  /**
   * 该会话的输入草稿。
   *
   * 用户在 A 输入一半后切到 B，草稿必须留在 chats[A].draftInput；
   * 不能放到顶层共享，否则 B 的发送动作可能误用 A 的内容。
   */
  draftInput: string;
}

const createChatState = (): ConversationChatState => ({
  messages: [],
  isLoading: false,
  historyLoaded: false,
  historyLoading: false,
  historyError: null,
  draftInput: "",
});

interface ChatStoreState {
  /** key 为 conversationId；每个已落库会话有独立状态对象 */
  chats: Record<number, ConversationChatState>;

  /**
   * 新对话草稿。
   *
   * 只有会话尚未落库时使用；创建成功并发送后，输入状态会迁移到
   * chats[newId].draftInput。
   */
  draftInput: string;

  /**
   * UI 当前展示的会话。
   *
   * 只影响投影和未显式传 target 的命令默认值，不承载后台请求生命周期；
   * 切换该值不应触发停止请求或重新发送。
   */
  activeConversationId: number | null;
}

interface ChatStoreActions {
  /**
   * 更新当前 UI 会话的输入草稿。
   *
   * 草稿态写入顶层 draftInput；已落库会话写入 chats[id].draftInput。
   */
  setInput: (value: string) => void;

  /**
   * 同步 UI 选中会话。
   *
   * 由 useChat 在 activeId 变化后调用；这里只更新投影指针，不加载历史、
   * 不中断请求。历史加载由 useChat 的 effect 显式触发。
   */
  setActiveConversationId: (conversationId: number | null) => void;

  /**
   * 加载指定会话的服务端历史。
   *
   * 内部会跳过已有更新视图、正在流式输出或历史请求已在途的情况；
   * 失败时保留可重试的 historyError。
   */
  loadHistory: (conversationId: number) => Promise<void>;

  /**
   * 发送消息并接收 SSE 流。
   *
   * 不传 target：发送到当前 UI 会话，并读取 chats[id].draftInput。
   * 显式传入 target：只用于新对话首次发送；此时创建接口已经返回新 ID，
   * 但 React/store 可能尚未同步 activeConversationId，因此草稿仍在顶层
   * draftInput，而不是 chats[target].draftInput。
   *
   * 这个调用约定必须和 App 保持一致，否则会把新会话草稿和已有会话草稿
   * 混在一起。
   */
  sendMessage: (targetConversationId?: number) => Promise<void>;

  /**
   * 停止指定会话的流式请求；缺省时只停止当前 UI 会话。
   *
   * 用户切到其他会话后，后台生成中的会话不会被误停。
   */
  stop: (targetConversationId?: number) => void;

  /**
   * 删除本地会话缓存。
   *
   * 只应在后端删除成功后调用；会话不再展示时，相关流式请求也要中断，
   * 防止旧响应稍后把本地缓存复活。
   */
  removeConversationChat: (conversationId: number) => void;

  /**
   * 清空整个聊天缓存并中断所有请求。
   *
   * 用于登出、切换账号或页面级组件卸载。storeGeneration 会递增，使所有
   * 旧账号请求在后续异步返回时全部失效。
   */
  resetChatStore: () => void;
}

export type ChatStore = ChatStoreState & ChatStoreActions;

/**
 * 未选中会话时的稳定空数组。
 *
 * selector 会被频繁执行；如果这里每次返回新的 []，Zustand/React 会因
 * 引用变化触发额外渲染。复用同一个数组可以保持投影稳定。
 */
const EMPTY_MESSAGES: Message[] = [];

/**
 * 每个会话当前流式请求的中断句柄。
 *
 * AbortController 是命令型可变对象，不是 UI 状态；放进 store 会引入不
 * 必要的渲染和序列化负担。key 使用 conversationId，因此停止 A 不会影响
 * B 的请求。
 *
 * 同一会话同一时间只允许一个流式请求。停止后立刻重发时，新请求会替换
 * Map 中的旧 controller；旧请求的写回和清理都必须先确认 controller
 * 仍属于自己。
 */
const abortControllers = new Map<number, AbortController>();

/**
 * 缓存代数。
 *
 * resetChatStore 时递增。每个请求发起时保存当前代数，异步返回后如果
 * 代数已变化，说明缓存已切换到新的登录周期，旧账号的历史响应、SSE
 * chunk 或错误状态都不能写入新账号。
 */
let storeGeneration = 0;

/**
 * 解析一条完整的 SSE 事件。
 *
 * 后端约定：
 * - data: {"content": "..."}\n\n 表示文本片段
 * - data: {"error": "..."}\n\n 表示流式过程中的错误
 * - data: [DONE]\n\n 表示回复结束
 *
 * 这里的输入必须已经是完整事件。网络 chunk 和 SSE 事件边界没有对应
 * 关系，切分逻辑在 sendMessage 中处理。
 */
function parseSSEChunk(chunk: string): {
  content: string | null;
  error: string | null;
  done: boolean;
} {
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
    return { content: null, error: null, done: false };
  }
}

export const useChatStore = create<ChatStore>()((set, get) => {
  /**
   * 只更新目标会话这一份状态。
   *
   * 更新时复制外层 chats 和目标会话对象，其余会话保持原引用。这样
   * A 会话追加流式内容时，B 会话的 messages selector 返回同一个引用，
   * 当前展示 B 的组件不会被无关更新牵连渲染。
   *
   * 注意：这个 helper 会在目标 key 不存在时创建默认状态，因此调用方
   * 不能在会话已删除后盲目写回；删除场景必须先确认 chats[id] 仍存在。
   */
  const updateChat = (
    targetConversationId: number,
    updater: (state: ConversationChatState) => ConversationChatState,
  ) => {
    set((state) => ({
      chats: {
        ...state.chats,
        [targetConversationId]: updater(
          state.chats[targetConversationId] ?? createChatState(),
        ),
      },
    }));
  };

  return {
    chats: {},
    draftInput: "",
    activeConversationId: null,

    setInput: (value) => {
      // 输入框永远只代表当前 UI 投影；根据当前选中值决定草稿归属。
      const activeConversationId = get().activeConversationId;

      if (activeConversationId === null) {
        set({ draftInput: value });
        return;
      }

      updateChat(activeConversationId, (state) => ({
        ...state,
        draftInput: value,
      }));
    },

    setActiveConversationId: (conversationId) =>
      set({ activeConversationId: conversationId }),

    loadHistory: async (conversationId) => {
      /*
       * 请求发起前先检查本地状态：
       * - isLoading：本地正在接收流式内容，它比服务端历史快照更新；
       * - historyLoaded：历史已成功或乐观发送已建立更新视图；
       * - historyLoading：同一个历史请求已在路上，避免重复触发。
       */
      const chat = get().chats[conversationId];

      if (chat?.isLoading || chat?.historyLoaded || chat?.historyLoading) {
        return;
      }

      // 先同步标记 loading，再进入 await，让并发调用被上面的条件拦住。
      updateChat(conversationId, (state) => ({
        ...state,
        historyLoading: true,
        historyError: null,
      }));

      const requestGeneration = storeGeneration;

      try {
        // 历史接口返回时，账号周期可能已经变化。
        const serverMessages =
          await conversationApi.getMessages(conversationId);

        if (storeGeneration !== requestGeneration) return;

        /*
         * 需要丢弃响应的两类边界：
         * - chats[id] 不存在：会话已被删除，不能通过 updateChat 重建；
         * - historyLoaded=true：首次发送已插入乐观消息，本地视图比这次
         *   历史快照更新，不能让空历史清空正在流式展示的内容。
         */
        const chat = get().chats[conversationId];
        if (!chat || chat.historyLoaded) return;

        // 后端数字 ID 转字符串，与前端 Message 的 React key 类型保持一致。
        updateChat(conversationId, (state) => ({
          ...state,
          messages: serverMessages.map((message) => ({
            id: String(message.id),
            role: message.role,
            content: message.content,
          })),
          historyLoaded: true,
          historyLoading: false,
          historyError: null,
        }));
      } catch (e) {
        // 失败状态同样不能跨账号周期写回。
        if (storeGeneration !== requestGeneration) return;

        // 删除后的会话不能通过错误状态复活；乐观发送后的视图优先。
        const chat = get().chats[conversationId];
        if (!chat || chat.historyLoaded) return;

        /*
         * 失败必须显式暴露为可重试状态。
         *
         * 如果这里把 historyLoaded 置为 true，UI 会误以为这是一个空会话；
         * 用户看到的上下文和后端实际传给模型的数据库上下文会不一致。
         */
        updateChat(conversationId, (state) => ({
          ...state,
          historyLoading: false,
          historyError: (e as Error).message || "历史消息加载失败",
        }));
      }
    },

    sendMessage: async (targetConversationId) => {
      /*
       * 确定发送目标：
       * - 常规发送：使用当前 UI 会话；
       * - 新对话首次发送：App 创建会话后显式传入新 ID，不等待 setState
       *   或 useChat effect 完成。
       */
      const currentConversationId =
        targetConversationId ?? get().activeConversationId;

      if (!currentConversationId) return;

      /*
       * 显式 target 只表示“目标已是新会话 ID”，不代表草稿已经迁移。
       * 新对话创建后，store 的 activeConversationId 可能仍是 null，
       * 因此草稿来源必须继续读取顶层 draftInput。
       *
       * 常规发送没有显式 target，草稿来源就是当前 UI 会话自己的 draft。
       */
      const draftSourceId =
        targetConversationId === undefined ? get().activeConversationId : null;
      const text =
        draftSourceId === null
          ? get().draftInput.trim()
          : (get().chats[draftSourceId]?.draftInput ?? "").trim();
      const chat = get().chats[currentConversationId];

      /*
       * 空文本和生成中的会话直接跳过。
       *
       * 这里不阻止 historyLoading：新会话首次发送时，activeId 变化可能
       * 刚触发空历史加载；如果此时拦截发送，会出现会话已创建但首条消息
       * 未发出的状态。迟到的历史响应由 historyLoaded 和响应后检查兜底。
       */
      if (!text || chat?.isLoading) return;

      // 记录发送开始时的账号缓存周期。
      const requestGeneration = storeGeneration;

      // 用户消息立即展示；assistant 空气泡用于承接后续流式内容。
      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text,
      };
      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
      };

      /*
       * 乐观更新同时完成三件事：
       * 1. 插入用户消息和 assistant 占位，让 UI 立即反馈；
       * 2. 设置 isLoading，阻止同一会话并发发送；
       * 3. 设置 historyLoaded=true，把本地视图声明为最新，防止稍后返回
       *    的空历史覆盖这些消息。
       */
      updateChat(currentConversationId, (state) => ({
        ...state,
        messages: [...state.messages, userMsg, assistantMsg],
        isLoading: true,
        historyLoaded: true,
        historyLoading: false,
        historyError: null,
        draftInput: "",
      }));

      // 清理草稿来源；新对话首次发送时来源是顶层，常规发送时来源是会话。
      if (draftSourceId === null) {
        set({ draftInput: "" });
      } else {
        updateChat(draftSourceId, (state) => ({
          ...state,
          draftInput: "",
        }));
      }

      const controller = new AbortController();
      abortControllers.set(currentConversationId, controller);

      /*
       * 每个 await 之后，请求都可能已经失效：
       * - storeGeneration 变化：账号已重置或切换；
       * - controller.signal.aborted：用户停止或删除会话；
       * - Map 中 controller 不同：停止后已立即重发；
       * - chats[id] 不存在：会话已删除，updateChat 会重建默认缓存。
       *
       * chunk 写入和错误写入都必须使用同一套归属校验。
       */
      const canWriteCurrentStream = () =>
        storeGeneration === requestGeneration &&
        !controller.signal.aborted &&
        abortControllers.get(currentConversationId) === controller &&
        Boolean(get().chats[currentConversationId]);

      try {
        /*
         * 只发送最新用户输入。模型上下文由后端根据 conversation_id
         * 从数据库读取，避免前端伪造、遗漏或滞后缓存影响模型输入。
         */
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            conversation_id: currentConversationId,
            message: text,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        // 网络读取 chunk 与 SSE 事件边界没有一一对应关系，必须缓冲拼接。
        let buffer = "";
        let receivedDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // stream 模式会把不完整的多字节字符留到下一次 decode。
          buffer += decoder.decode(value, { stream: true });

          // SSE 以空行分隔事件；最后一段可能不完整，继续留在缓冲区。
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            const { content, error, done: isDone } = parseSSEChunk(trimmed);
            if (isDone) {
              receivedDone = true;
              break;
            }
            if (error) throw new Error(error);

            if (content) {
              // 异步读取返回后，请求和会话状态都可能已经改变。
              if (!canWriteCurrentStream()) return;

              // 会话定位气泡归属，assistantMsg.id 定位本轮回复。
              updateChat(currentConversationId, (state) => ({
                ...state,
                messages: state.messages.map((item) =>
                  item.id === assistantMsg.id
                    ? { ...item, content: item.content + content }
                    : item,
                ),
              }));
            }
          }

          // [DONE] 是协议结束信号，必须同时跳出事件循环和读取循环。
          if (receivedDone) break;
        }

        if (receivedDone) {
          // 后端已正常结束，主动释放 reader；关闭失败可忽略。
          await reader.cancel().catch(() => undefined);
        }
      } catch (e) {
        const err = e as Error;

        /*
         * 错误同样可能晚于停止、重发、删除或账号重置到达。
         * 已失效请求不能把错误写进新气泡，也不能重建已删除缓存。
         */
        if (!canWriteCurrentStream()) return;

        // 用户主动停止保留已生成部分；其他错误写入本轮 assistant 气泡。
        if (err.name !== "AbortError") {
          updateChat(currentConversationId, (state) => ({
            ...state,
            messages: state.messages.map((item) =>
              item.id === assistantMsg.id
                ? {
                    ...item,
                    content: item.content
                      ? `${item.content}\n\n[请求失败] ${err.message}`
                      : `[请求失败] ${err.message}`,
                  }
                : item,
            ),
          }));
        }
      } finally {
        /*
         * 停止后用户可能立即重发，新请求已经替换 Map 中的 controller。
         * 旧请求的 finally 不能删除新句柄，也不能关闭新请求的 loading。
         */
        const isCurrentRequest =
          abortControllers.get(currentConversationId) === controller;

        if (isCurrentRequest) {
          abortControllers.delete(currentConversationId);
        }

        if (storeGeneration !== requestGeneration) return;

        if (!isCurrentRequest) return;

        updateChat(currentConversationId, (state) => ({
          ...state,
          isLoading: false,
          historyLoaded: true,
        }));
      }
    },

    stop: (targetConversationId) => {
      // 未显式指定时，只作用于当前 UI 会话，避免误停后台请求。
      const currentConversationId =
        targetConversationId ?? get().activeConversationId;
      if (!currentConversationId) return;

      // 中断当前会话自己的流式请求；请求 catch/finally 稍后完成清理。
      abortControllers.get(currentConversationId)?.abort();

      // abort 生效有延迟，先同步关闭 loading，让停止按钮立即恢复输入态。
      updateChat(currentConversationId, (state) => ({
        ...state,
        isLoading: false,
      }));
    },

    removeConversationChat: (conversationId) => {
      // 本地删除意味着结果不再展示；生成中的请求也必须立即失效。
      abortControllers.get(conversationId)?.abort();
      abortControllers.delete(conversationId);

      set((state) => {
        // 复制 Record 后删除 key，保持 Zustand 的不可变更新。
        const chats = { ...state.chats };
        delete chats[conversationId];

        return {
          chats,
          // 删除当前展示会话时回到草稿态。
          activeConversationId:
            state.activeConversationId === conversationId
              ? null
              : state.activeConversationId,
        };
      });
    },

    resetChatStore: () => {
      // 先递增代数，再中断请求；旧请求之后任何写回都会被拒绝。
      storeGeneration += 1;

      // 登录周期结束时，后台流式请求也不应继续消耗网络和计算资源。
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();

      // 清空所有账号相关状态，避免下一个账号看到上一个账号的缓存。
      set({
        chats: {},
        draftInput: "",
        activeConversationId: null,
      });
    },
  };
});

/**
 * 读取指定会话的消息。
 *
 * 未选中会话时返回稳定空数组；指定会话不存在（例如刚删除）时同样
 * 返回稳定空数组，让 UI 自然回到空状态。
 */
export const selectMessages =
  (conversationId: number | null) => (state: ChatStore) =>
    conversationId === null
      ? EMPTY_MESSAGES
      : (state.chats[conversationId]?.messages ?? EMPTY_MESSAGES);

/** 读取指定会话的生成状态；未选中会话时永远为 false */
export const selectIsLoading =
  (conversationId: number | null) => (state: ChatStore) =>
    conversationId === null
      ? false
      : (state.chats[conversationId]?.isLoading ?? false);

/** 读取指定会话的历史加载状态；未选中会话时永远为 false */
export const selectIsHistoryLoading =
  (conversationId: number | null) => (state: ChatStore) =>
    conversationId === null
      ? false
      : (state.chats[conversationId]?.historyLoading ?? false);

/** 读取指定会话的历史加载错误；未选中会话时不展示历史错误 */
export const selectHistoryError =
  (conversationId: number | null) => (state: ChatStore) =>
    conversationId === null
      ? null
      : (state.chats[conversationId]?.historyError ?? null);

/**
 * 读取当前 UI 会话的草稿。
 *
 * 草稿态读取顶层 draftInput；已落库会话读取自己的 draftInput。
 * 切换会话时读取不同 key，未发送内容不会跟随到另一个会话。
 */
export const selectInput =
  (conversationId: number | null) => (state: ChatStore) =>
    conversationId === null
      ? state.draftInput
      : (state.chats[conversationId]?.draftInput ?? "");
