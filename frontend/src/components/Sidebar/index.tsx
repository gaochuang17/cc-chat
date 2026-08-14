import { Button, Menu } from "antd";
import {
  EditOutlined,
  MessageOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import styles from "./Sidebar.module.css";

export interface SidebarSession {
  id: string;
  title: string;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: SidebarSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  // 将会话列表转换为 Antd Menu 需要的 items 格式
  const items = sessions.map((s) => ({
    key: s.id,
    icon: <MessageOutlined />,
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
        {/* 删除按钮：阻止冒泡，避免点击删除同时触发菜单选中 */}
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
          <EditOutlined />
          新建对话
        </Button>
      </div>
      {/* 会话列表：超出时自动滚动 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Menu
          mode="inline"
          selectedKeys={activeSessionId ? [activeSessionId] : []}
          items={items}
          onClick={({ key }) => onSelect(key)}
        />
      </div>
    </div>
  );
}
