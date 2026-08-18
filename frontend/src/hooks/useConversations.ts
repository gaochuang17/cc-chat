/**
 * 对话管理 Hook：封装对话的增删查改。
 *
 * 所有操作走真实后端 API，数据持久化在服务器。
 * enabled 参数控制是否启用（通常在用户登录后才启用）。
 *
 * 异步写回规则：
 * 1. 请求发出时的界面状态，不一定等于响应返回时的界面状态；
 * 2. 每个异步请求记录当时的 sessionToken 和 listToken；
 * 3. 响应返回后，只有 token 仍匹配当前 guard，才允许写入 UI；
 * 4. 守卫只拦截前端写回，不取消请求，也不撤销后端已完成的操作。
 *
 * 两个 token 分别回答两个问题：
 * - sessionToken：这个响应还属于当前登录周期吗？
 * - listToken：这份列表数据仍是当前界面接受的快照吗？
 *
 * 不同接口的校验范围：
 * - list 响应：两个 token 都必须匹配；
 * - create/delete 响应：只要求登录周期匹配；本地写回前替换 listToken。
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { conversationApi } from "../lib/api";
import type { Conversation } from "../types";

/** 登录周期令牌：只比较是否相等，不承载业务含义 */
type SessionToken = string;

/** 列表快照令牌：只比较是否相等，不承载业务含义 */
type ListToken = string;

/** 一次列表请求发起时的身份和列表快照 */
interface ListRequestSnapshot {
  sessionToken: SessionToken;
  listToken: ListToken;
}

/** 当前允许写入 UI 的登录身份和列表快照 */
interface ConversationRequestGuard {
  /** 当前登录周期；登出时整个 guard 会被置空 */
  sessionToken: SessionToken;
  /** 当前接受的列表快照；列表语义变化时替换 */
  listToken: ListToken;
}

/**
 * 创建随机 token。它只用于异步响应身份比较，不用于安全场景。
 *
 * randomUUID 依赖安全上下文；如果应用部署在普通 HTTP 环境，
 * 使用时间戳加随机数作为兜底即可满足前端请求身份比较。
 */
const createToken = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** create/delete 响应写回前，确认它仍属于当前登录周期 */
function isSameSession(
  guard: ConversationRequestGuard | null,
  sessionToken: SessionToken,
) {
  return guard?.sessionToken === sessionToken;
}

/** list 响应必须同时匹配登录周期和列表快照，才能提交 */
function canCommitList(
  guard: ConversationRequestGuard | null,
  snapshot: ListRequestSnapshot,
): boolean {
  return (
    guard !== null &&
    isSameSession(guard, snapshot.sessionToken) &&
    guard.listToken === snapshot.listToken
  );
}

export function useConversations(enabled: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  /*
   * ref 能让异步响应返回时读到“最新守卫”；state 只能反映某次渲染。
   * guard 不是业务数据，不参与渲染。
   * null 表示已登出，所有旧账号响应都不能写回。
   */
  const guardRef = useRef<ConversationRequestGuard | null>(null);

  /** 登录后按需创建新的登录周期和列表 token */
  const ensureGuard = useCallback((): ConversationRequestGuard => {
    if (!guardRef.current) {
      guardRef.current = {
        sessionToken: createToken(),
        listToken: createToken(),
      };
    }
    return guardRef.current;
  }, []);

  /** 替换列表 token；必须在 setConversations 前调用，让旧 list 响应失效 */
  const replaceListToken = useCallback(() => {
    const guard = ensureGuard();
    guardRef.current = { ...guard, listToken: createToken() };
  }, [ensureGuard]);

  const refresh = useCallback(async () => {
    // 新 listToken 表示“只接受本次请求的快照”，更早的慢请求自动失效
    const guard = ensureGuard();
    const snapshot: ListRequestSnapshot = {
      sessionToken: guard.sessionToken,
      listToken: createToken(),
    };
    guardRef.current = { ...guard, listToken: snapshot.listToken };

    // 即使结果过期，也保留原始返回值，方便调用方自行处理或记录日志
    const list = await conversationApi.list();

    // 登出、更新的 list 请求、本地创建 / 删除 / 改标题都会让这里失败
    if (!canCommitList(guardRef.current, snapshot)) {
      return list;
    }

    setConversations(list);
    return list;
  }, [ensureGuard]);

  useEffect(() => {
    // 清空列表和高亮，避免旧账号数据或 activeId 泄漏到下一次登录
    if (!enabled) {
      // guard 置空后，旧账号所有在途响应都无法通过写回校验
      guardRef.current = null;
      setConversations([]);
      setActiveId(null);
      return;
    }

    // 登录后加载列表；refresh 内部会按需创建新的 token
    refresh().catch(() => {});
  }, [enabled, refresh]);

  const create = useCallback(async () => {
    // 草稿对话首次发送时才调用：在后端创建记录，插入列表顶部并设为活跃
    // 记录请求前的登录周期，用于识别“创建成功但用户已登出”的响应
    const sessionToken = ensureGuard().sessionToken;
    const conv = await conversationApi.create();

    // 后端可能创建成功，但旧登录周期的新会话不能进入当前账号 UI
    if (!isSameSession(guardRef.current, sessionToken)) {
      throw new Error("登录状态已变化，请重新登录");
    }

    // 新会话会改变列表，因此先让在途 list 响应失效
    replaceListToken();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, [ensureGuard, replaceListToken]);

  const remove = useCallback(
    async (id: number) => {
      // 从后端删除对话，如果删的是当前对话则清空活跃 ID
      // 删除同样可能跨越登出动作，返回后先校验登录周期
      const sessionToken = ensureGuard().sessionToken;
      await conversationApi.delete(id);

      // 登录周期已变化时，不修改新账号列表
      if (!isSameSession(guardRef.current, sessionToken)) {
        return;
      }

      // 删除会改变列表，必须防止旧 list 响应把它“复活”
      replaceListToken();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId((prev) => (prev === id ? null : prev));
    },
    [ensureGuard, replaceListToken],
  );

  /** 本地更新标题；同步写回，但同样要防止在途 list 响应带回旧标题 */
  const updateTitle = useCallback(
    (id: number, title: string) => {
      if (!enabled) return;

      replaceListToken();
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
    },
    [enabled, replaceListToken],
  );

  return {
    conversations,
    activeId,
    setActiveId,
    refresh,
    create,
    remove,
    updateTitle,
  };
}
