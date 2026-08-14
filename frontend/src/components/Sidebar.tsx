import { Button, Menu } from 'antd'
import {
  PlusOutlined,
  MessageOutlined,
  DeleteOutlined,
} from '@ant-design/icons'

export interface SidebarSession {
  id: string
  title: string
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: SidebarSession[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const items = sessions.map((s) => ({
    key: s.id,
    icon: <MessageOutlined />,
    label: (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {s.title}
        </span>
        <DeleteOutlined
          onClick={(e) => {
            e.stopPropagation()
            onDelete(s.id)
          }}
          style={{ color: '#999', fontSize: 12 }}
        />
      </div>
    ),
  }))

  return (
    <div className="chat-sidebar">
      <div style={{ padding: 12 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block
          onClick={onNew}
        >
          新建对话
        </Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Menu
          mode="inline"
          selectedKeys={activeSessionId ? [activeSessionId] : []}
          items={items}
          onClick={({ key }) => onSelect(key)}
          style={{ borderRight: 'none', background: 'transparent' }}
        />
      </div>
    </div>
  )
}
