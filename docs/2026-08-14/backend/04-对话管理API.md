# 对话管理 API

> 本文档详细介绍对话的增删查改接口，以及权限控制、级联删除等设计。

---

## 一、接口总览

| 方法 | 路径 | 功能 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/conversations` | 创建对话 | `{title?}` | `ConversationRead` |
| GET | `/api/conversations` | 列出对话 | - | `ConversationRead[]` |
| GET | `/api/conversations/{id}/messages` | 获取消息 | - | `MessageRead[]` |
| DELETE | `/api/conversations/{id}` | 删除对话 | - | 204 |

所有接口都需要登录（`Depends(current_active_user)`）。

---

## 二、Pydantic Schema

`schemas/conversation.py` 定义了请求和响应模型：

```python
class ConversationCreate(BaseModel):
    title: str = Field(default="新对话", max_length=200)

class ConversationRead(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class MessageRead(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}
```

### `from_attributes = True` 的作用

ORM 模型返回的对象（如 `Conversation` 实例）不是 dict，Pydantic 默认无法直接转换。`from_attributes=True` 让 Pydantic 从对象的属性读取值：

```python
conv = Conversation(id=1, title="测试", ...)  # SQLAlchemy 对象
# from_attributes=True 时，Pydantic 自动读取 conv.id, conv.title, ...
```

这样路由直接 `return conv`，FastAPI 自动用 `response_model` 转换为 JSON。

---

## 三、创建对话

```python
@router.post("", response_model=ConversationRead, status_code=201)
async def create_conversation(
    body: ConversationCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    conv = Conversation(user_id=user.id, title=body.title)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)  # 获取自增 ID 和默认时间戳
    return conv
```

流程：
1. 用当前登录用户的 ID 创建对话
2. `db.add()` 加入 Session
3. `await db.commit()` 提交到数据库
4. `await db.refresh(conv)` 从数据库重新加载，获取自增 ID 和数据库生成的时间戳

**为什么要 `refresh`？** `id`、`created_at`、`updated_at` 是数据库生成的（`server_default`），commit 后 ORM 对象上还没有这些值，需要 refresh 才能拿到。

---

## 四、列出对话

```python
@router.get("", response_model=list[ConversationRead])
async def list_conversations(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    )
    return result.scalars().all()
```

关键点：
* `where(Conversation.user_id == user.id)`：只查当前用户的对话
* `order_by(...desc())`：按更新时间倒序，最近修改的排最前
* `result.scalars().all()`：`scalars()` 从 Row 对象提取 ORM 实体，`all()` 转为列表

### SQLAlchemy 2.0 查询风格

SQLAlchemy 2.0 使用 `select()` + `db.execute()` 替代旧的 `db.query()`：
```python
# 旧写法 (1.x legacy)
db.query(Conversation).filter(...).all()

# 新写法 (2.0 style，本项目使用)
result = await db.execute(select(Conversation).where(...))
result.scalars().all()
```

---

## 五、获取对话消息

```python
@router.get("/{conversation_id}/messages", response_model=list[MessageRead])
async def get_messages(
    conversation_id: int,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    # 先验证对话属于当前用户
    conv = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")

    # 查询该对话的所有消息
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return result.scalars().all()
```

### 权限控制

**核心设计：** 每个接口都先验证对话属于当前用户（`Conversation.user_id == user.id`），防止用户 A 访问用户 B 的对话。

这叫**越权防护**：即使用户知道另一个用户的 `conversation_id`，也无法访问。

### `db.scalar` vs `db.execute`

* `db.scalar(select(...))`：返回单个值（ORM 实例或 None）
* `db.execute(select(...))`：返回 Result 对象，需要 `.scalars().all()` 提取

查询单条记录用 `scalar`，查询列表用 `execute`。

---

## 六、删除对话

```python
@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    conv = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")

    await db.delete(conv)
    await db.commit()
    return None
```

### 级联删除

`db.delete(conv)` 只删除对话记录本身。但由于在模型定义中设置了 `cascade="all, delete-orphan"`，SQLAlchemy 会自动删除该对话下的所有消息。

效果等同于 SQL：
```sql
DELETE FROM messages WHERE conversation_id = ?;
DELETE FROM conversations WHERE id = ?;
```

但这是自动的，不需要手动处理。

### 204 状态码

`status_code=204` 表示成功但无内容返回。DELETE 操作通常用 204，前端不需要响应体。

---

## 七、聊天请求模型

`models/schemas.py` 中定义了聊天接口的请求体：

```python
class ChatRequest(BaseModel):
    conversation_id: int
    message: str = Field(min_length=1)
```

**设计决策：** 前端只发 `conversation_id` 和最新的 `message`，不发送完整历史。历史由后端从数据库加载。这样：
* 减少网络传输量
* 保证数据一致性（前端历史可能不完整）
* 后端有完整上下文做 token 计数等

详细的聊天接口实现见 [05-流式聊天接口.md](./05-流式聊天接口.md)。
