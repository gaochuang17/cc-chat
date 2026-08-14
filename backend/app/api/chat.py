import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.llm import stream_chat_raw
from app.db.database import async_session_maker, get_async_session
from app.models import Conversation, Message, User
from app.models.schemas import ChatRequest
from app.users.router import current_active_user

router = APIRouter()


async def _verify_conversation(
    conversation_id: int, user: User, db: AsyncSession
) -> Conversation:
    """验证对话归属当前用户，返回对话对象。"""
    conv = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    return conv


async def stream_and_save(
    llm_messages: list[dict],
    conversation_id: int,
):
    """
    流式发送 LLM 回复，同时累积完整内容，结束后写入数据库。

    使用独立的 session（而非 Depends 注入的），因为 StreamingResponse
    的生命周期和 Depends session 的清理时机在不同框架版本中有差异，
    自建 session 更可靠。
    """
    accumulated = ""

    try:
        async for chunk in stream_chat_raw(llm_messages):
            accumulated += chunk
            data = json.dumps({"content": chunk}, ensure_ascii=False)
            yield f"data: {data}\n\n"

        # 流式完成后，把完整 assistant 回复写入数据库
        async with async_session_maker() as session:
            msg = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=accumulated,
            )
            session.add(msg)
            await session.commit()

        yield "data: [DONE]\n\n"

    except Exception as e:
        # LLM 调用失败：把错误信息发给前端
        error_data = json.dumps({"error": str(e)}, ensure_ascii=False)
        yield f"data: {error_data}\n\n"


@router.post("/chat")
async def chat(
    req: ChatRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    流式聊天接口（需要登录）。

    流程：验证对话归属 → 保存用户消息 → 从数据库加载历史 →
    组装 LLM 上下文 → 流式返回 AI 回复 → 回复完成后写入数据库。
    """
    # 1. 验证对话属于当前用户
    conv = await _verify_conversation(req.conversation_id, user, db)

    # 2. 保存用户消息
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=req.message,
    )
    db.add(user_msg)

    # 如果是第一条消息，自动用消息内容设置对话标题
    if conv.title == "新对话":
        conv.title = req.message[:50]

    await db.commit()

    # 3. 从数据库加载该对话的完整历史（刚保存的用户消息已包含在内）
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at)
    )
    history = result.scalars().all()

    # 4. 组装发给 LLM 的消息：系统提示词 + 历史
    llm_messages = [{"role": "system", "content": settings.SYSTEM_PROMPT}]
    for msg in history:
        llm_messages.append({"role": msg.role, "content": msg.content})

    # 5. 流式返回，结束后自动保存 assistant 回复
    return StreamingResponse(
        stream_and_save(llm_messages, conv.id),
        media_type="text/event-stream; charset=utf-8",
    )
