/**
 * 对话管理 Hook：封装对话的增删查改。
 *
 * 所有操作走真实后端 API，数据持久化在服务器。
 * enabled 参数控制是否启用（通常在用户登录后才启用）。
 *
 * 异步响应提交规则：
 * 1. 请求发出时的界面状态，不一定等于响应返回时的界面状态；
 * 2. 每个异步请求记录当时的 sessionToken 和 listToken；
 * 3. 响应返回后，只有 token 仍匹配当前 guard，才允许写入 UI；
 * 4. 校验只阻止过期响应修改前端状态；它不会取消请求，也不会撤销
 *    后端已经完成的创建或删除。
 *
 * 两个 token 分别回答两个问题：
 * - sessionToken：响应返回后，用户是否仍在发起请求时的登录状态？
 * - listToken：这个 list 响应是否仍对应界面当前接受的列表版本？
 *
 * 不同接口的校验范围：
 * - list 响应：两个 token 都必须匹配；
 * - create/delete 响应：只要求登录状态匹配；修改本地列表前替换 listToken。
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { conversationApi } from "../lib/api";
import type { Conversation } from "../types";

/** 登录状态标识；只比较是否相等，不承载其他业务含义 */
type SessionToken = string;

/** 列表版本标识；只比较是否相等，不承载其他业务含义 */
type ListToken = string;

/** 一次列表请求发起时的登录状态标识和列表版本标识 */
interface ListRequestSnapshot {
  sessionToken: SessionToken;
  listToken: ListToken;
}

/** 响应修改 UI 前用于比较的当前登录状态标识和列表版本标识 */
interface ConversationRequestGuard {
  /** 当前登录状态；登出后整个对象会被置为 null */
  sessionToken: SessionToken;
  /** 当前接受的列表版本；列表数据变化前会先替换它 */
  listToken: ListToken;
}

/**
 * 创建随机 token。它只用于异步响应身份比较，不用于安全场景。
 *
 * randomUUID 依赖安全上下文；如果应用部署在普通 HTTP 环境，
 * 使用时间戳加随机数作为降级方案即可满足前端请求身份比较。
 */
const createToken = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** create/delete 响应修改 UI 前，确认它仍属于当前登录状态 */
function isSameSession(
  guard: ConversationRequestGuard | null,
  sessionToken: SessionToken,
) {
  return guard?.sessionToken === sessionToken;
}

/** list 响应必须同时匹配当前登录状态和列表版本，才能写入 UI */
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

  /*
   * ref 能让异步响应返回时读到最新校验值；state 只能反映某次渲染。
   * guard 不是业务数据，不参与渲染。
   * null 表示已登出，所有旧账号响应都不能修改 UI。
   */
  const guardRef = useRef<ConversationRequestGuard | null>(null);

  /** 登录后按需创建新的登录状态标识和列表版本标识 */
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
    // 新 listToken 表示只接受本次请求；更早的慢请求返回时会被丢弃
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
    // 清空列表，避免旧账号数据泄漏到下一次登录。当前选中的会话 ID
    // 由 chatStore 负责重置，本 Hook 不保存另一份 activeId。
    if (!enabled) {
      // guard 置空后，旧账号所有未完成响应都无法通过提交校验
      guardRef.current = null;
      setConversations([]);
      return;
    }

    // 登录后加载列表；refresh 内部会按需创建新的 token
    refresh().catch(() => {});
  }, [enabled, refresh]);

  const create = useCallback(async () => {
    // 草稿对话首次发送时才调用：这里只创建会话并插入列表。当前选中
    // ID 由 chatStore 动作更新，避免列表变化间接触发历史请求。
    // 记录请求前的登录状态，用于识别“创建成功但用户已登出”的响应
    const sessionToken = ensureGuard().sessionToken;
    const conv = await conversationApi.create();

    // 后端可能创建成功，但用户登出前的响应不能进入新账号 UI
    if (!isSameSession(guardRef.current, sessionToken)) {
      throw new Error("登录状态已变化，请重新登录");
    }

    // 新会话会改变列表，因此先让未完成的 list 响应失效
    replaceListToken();
    setConversations((prev) => [conv, ...prev]);
    return conv;
  }, [ensureGuard, replaceListToken]);

  const remove = useCallback(
    async (id: number) => {
      // 从后端删除对话。当前选中的会话 ID 由 removeConversationChat 处理。
      // 删除请求也可能跨越登出动作，返回后先校验登录状态
      const sessionToken = ensureGuard().sessionToken;
      await conversationApi.delete(id);

      // 登录状态已变化时，不修改新账号列表
      if (!isSameSession(guardRef.current, sessionToken)) {
        return;
      }

      // 删除会改变列表，必须防止旧 list 响应重新加回该会话
      replaceListToken();
      setConversations((prev) => prev.filter((c) => c.id !== id));
    },
    [ensureGuard, replaceListToken],
  );

  /** 本地更新标题；同样要防止未完成的 list 响应带回旧标题 */
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
    refresh,
    create,
    remove,
    updateTitle,
  };
}
