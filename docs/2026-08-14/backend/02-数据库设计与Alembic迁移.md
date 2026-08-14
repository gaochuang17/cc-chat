# 数据库设计与 Alembic 迁移

> 本文档介绍数据库的表设计、ORM 模型、以及 Alembic 迁移工具的配置和使用。

---

## 一、为什么用 ORM（SQLAlchemy）

**用户决策：** "ORM 选 SQLAlchemy，以后功能可能会增加。"

ORM（Object-Relational Mapping）的好处：

* **不用手写 SQL**：用 Python 类和对象操作数据库，自动生成 SQL
* **类型安全**：字段类型在代码中定义，编译时就能发现错误
* **防 SQL 注入**：ORM 自动参数化查询
* **迁移管理**：配合 Alembic 可以版本化管理表结构变更

不使用 ORM 的场景（本项目不涉及）：
* 极致性能要求的场景
* 需要写复杂 SQL（存储过程、窗口函数等）

---

## 二、异步数据库引擎

`db/database.py` 是数据库的核心配置：

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,          # 异步 Session 类
    async_sessionmaker,    # Session 工厂
    create_async_engine,   # 异步引擎
)

# SQLite 需要关闭 check_same_thread
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# 创建异步引擎（连接池管理由 SQLAlchemy 负责）
engine = create_async_engine(settings.DATABASE_URL, connect_args=connect_args)

# Session 工厂：每次调用生成一个新的 Session
# expire_on_commit=False: commit 后对象属性不过期，避免异步查询问题
async_session_maker = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)

# 所有 ORM 模型的基类
class Base(DeclarativeBase):
    pass

# FastAPI 依赖：每个请求获取一个 Session
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

### 为什么 `check_same_thread = False`

SQLite 默认只允许创建连接的线程访问数据库。FastAPI 用异步 IO（不同请求在不同线程/协程中），需要关闭这个限制，否则报错 `SQLite objects created in a thread can only be used in that same thread`。

### 为什么用异步

fastapi-users 14 要求异步 SQLAlchemy。为了保持一致性，整个项目的数据库操作都用异步。异步的好处是不阻塞事件循环：数据库查询慢时，服务器还能处理其他请求。

---

## 三、数据表设计

### 3.1 用户表 `users`

```python
class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
```

`SQLAlchemyBaseUserTableUUID` 自动提供以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID (GUID) | 主键，自动生成 |
| `email` | String(320) | 邮箱，唯一索引 |
| `hashed_password` | String(1024) | 密码哈希（bcrypt） |
| `is_active` | Boolean | 账户是否激活 |
| `is_superuser` | Boolean | 是否超级管理员 |
| `is_verified` | Boolean | 邮箱是否已验证 |

我们额外加了 `created_at`（注册时间）。

**注意：** 用户 ID 是 UUID 类型，在 SQLite 中存储为 `CHAR(36)`（如 `"a1b2c3d4-..."`）。

### 3.2 对话表 `conversations`

```python
class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="新对话")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    user: Mapped["User"] = relationship(back_populates="conversations")
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 自增主键 |
| `user_id` | UUID (FK) | 外键关联 users.id，加了索引 |
| `title` | String(200) | 对话标题，默认"新对话" |
| `created_at` | DateTime | 创建时间，数据库自动填充 |
| `updated_at` | DateTime | 更新时间，每次修改自动更新 |

**设计细节：**
* `user_id` 加了 `index=True`，因为频繁按用户查询对话
* `title` 默认 "新对话"，首条消息发送时自动更新为消息前 50 字
* `cascade="all, delete-orphan"`：删除对话时自动删除其所有消息

### 3.3 消息表 `messages`

```python
class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "user" 或 "assistant"
    content: Mapped[str] = mapped_column(Text)      # 长文本
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 自增主键 |
| `conversation_id` | Integer (FK) | 外键关联 conversations.id |
| `role` | String(20) | "user" 或 "assistant" |
| `content` | Text | 消息正文（支持长文本） |
| `created_at` | DateTime | 创建时间 |

**设计细节：**
* `content` 用 `Text` 而非 `String`，因为 AI 回复可能很长
* `role` 只有 `user` 和 `assistant`，`system` 角色由后端在调用 LLM 时动态注入，不存数据库
* `conversation_id` 加索引，因为频繁按对话查询消息
* 消息按 `created_at` 排序恢复对话历史

---

## 四、ORM 关系（relationship）

三个表通过 `relationship` 建立双向关联：

```python
# User -> Conversations (一对多)
User.conversations = relationship(back_populates="user", cascade="all, delete-orphan")

# Conversation -> User (多对一)
Conversation.user = relationship(back_populates="conversations")

# Conversation -> Messages (一对多)
Conversation.messages = relationship(back_populates="conversation", cascade="all, delete-orphan")

# Message -> Conversation (多对一)
Message.conversation = relationship(back_populates="messages")
```

`back_populates` 让双向关系自动同步：设置了 `conv.user = user`，`user.conversations` 也会自动包含 `conv`。

`cascade="all, delete-orphan"` 的含义：
* `all`：所有操作级联（包括 delete）
* `delete-orphan`：删除子记录时自动从父记录的集合中移除

效果：删除一个 Conversation 时，关联的 Messages 自动删除（级联删除）。

### TYPE_CHECKING 延迟导入

```python
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.conversation import Conversation
```

ORM 模型之间互相引用（User 引用 Conversation，Conversation 引用 User）。直接 import 会循环导入。`TYPE_CHECKING` 只在类型检查时导入，运行时不导入，避免循环依赖。

---

## 五、Alembic 迁移管理

**为什么需要迁移工具：**

直接用 `Base.metadata.create_all(engine)` 创建表虽然简单，但后续修改表结构（加字段、改类型）就很麻烦。Alembic 可以版本化管理表结构变更，类似 Git 但针对数据库。

### 5.1 配置 `alembic.ini`

关键配置项：
```ini
[alembic]
script_location = %(here)s/alembic    # 迁移脚本目录
prepend_sys_path = .                   # 将当前目录加入 Python 路径
```
`%(here)s` 指向 `alembic.ini` 所在目录（即 `backend/`）。

### 5.2 自定义 `env.py`

`env.py` 是 Alembic 的核心配置文件，做了两件关键的事：

```python
# 1. 导入所有模型，确保 Base.metadata 包含全部表
import app.models  # noqa: F401
from app.db.database import Base

# 2. 用项目的 DATABASE_URL 覆盖 alembic.ini 的默认值
# Alembic 用同步引擎，需要去掉异步驱动前缀
_url = settings.DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")
config.set_main_option("sqlalchemy.url", _url)
```

**核心问题：** 项目用异步数据库 URL（`sqlite+aiosqlite:///...`），但 Alembic 只支持同步引擎。解决办法是去掉 `+aiosqlite` 前缀，变成 `sqlite:///...`。

### 5.3 迁移命令

```bash
# 1. 生成迁移脚本（对比模型和数据库差异，自动生成）
alembic revision --autogenerate -m "initial"

# 2. 执行迁移（创建表）
alembic upgrade head

# 3. 回滚迁移
alembic downgrade -1

# 4. 查看迁移历史
alembic history

# 5. 查看当前版本
alembic current
```

### 5.4 初始迁移文件

生成的 `f113487897b2_initial.py` 包含 `upgrade()` 和 `downgrade()`：

```python
def upgrade():
    op.create_table('users', ...)          # 创建 users 表
    op.create_index('ix_users_email', ...) # 创建 email 唯一索引
    op.create_table('conversations', ...)  # 创建 conversations 表
    op.create_index('ix_conversations_user_id', ...)
    op.create_table('messages', ...)       # 创建 messages 表
    op.create_index('ix_messages_conversation_id', ...)

def downgrade():
    op.drop_table('messages')
    op.drop_table('conversations')
    op.drop_table('users')
```

`GUID` 类型在 SQLite 中自动映射为 `CHAR(36)`。

---

## 六、SQLite 使用注意事项

### 6.1 查看 SQLite 数据

```bash
sqlite3 chat.db
sqlite> .tables
sqlite> SELECT * FROM users;
sqlite> .quit
```

### 6.2 重置数据库

```bash
rm chat.db
alembic upgrade head
```

### 6.3 迁移到 PostgreSQL

由于使用了 SQLAlchemy ORM，迁移到 PostgreSQL 只需：

1. 安装异步驱动：`pip install asyncpg`
2. 修改 `.env`：`DATABASE_URL=postgresql+asyncpg://user:pass@localhost/chat`
3. 修改 `alembic/env.py` 中的替换逻辑（去掉 `+asyncpg`）
4. 重新运行迁移
