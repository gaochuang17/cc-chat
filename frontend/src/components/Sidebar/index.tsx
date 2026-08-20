/**
 * 侧边栏组件：展示对话列表，支持新建、选择、删除对话。
 *
 * 底部显示当前用户邮箱和退出按钮。
 */
import { Button, Menu } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import styles from "./Sidebar.module.css";

export interface SidebarSession {
  id: number;
  title: string;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  email,
  onSelect,
  onNew,
  onDelete,
  onLogout,
}: {
  sessions: SidebarSession[];
  activeSessionId: number | null;
  email?: string;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onLogout: () => void;
}) {
  // 将会话列表转换为 Antd Menu 需要的 items 格式；设计图列表项仅显示标题，不带图标
  const items = sessions.map((s) => ({
    // Menu 组件的 key 必须是 string
    key: String(s.id),
    label: (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* 会话标题：超长文本省略号 */}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {s.title}
        </span>
        {/* 删除按钮：stopPropagation 阻止冒泡，避免点击删除同时触发菜单选中 */}
        <DeleteOutlined
          onClick={(e) => {
            e.stopPropagation();
            onDelete(s.id);
          }}
          style={{ color: "var(--text-tertiary)", fontSize: 13 }}
        />
      </div>
    ),
  }));

  return (
    <div className={styles.sidebar}>
      {/* 顶部：新建对话按钮 */}
      <div className={styles.header}>
        <Button className={styles.newChatBtn} block onClick={onNew}>
          <PlusOutlined />
          新对话
        </Button>
      </div>
      {/* 会话列表：超出时自动滚动 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Menu
          mode="inline"
          selectedKeys={activeSessionId ? [String(activeSessionId)] : []}
          items={items}
          onClick={({ key }) => onSelect(Number(key))}
        />
      </div>
      {/* 底部：用户信息 + 退出按钮 */}
      <div className={styles.footer}>
        <div className={styles.userInfo}>
          <span className={styles.email}>{email || ""}</span>
          <Button
            type="text"
            size="small"
            icon={<LogoutOutlined />}
            onClick={onLogout}
            className={styles.logoutBtn}
          />
        </div>
      </div>
    </div>
  );
}
