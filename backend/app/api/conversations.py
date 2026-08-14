"""对话管理 API：创建、列表、删除对话，以及查看历史消息。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_session
from app.models import Conversation, Message, User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationRead,
    MessageRead,
)
from app.users.router import current_active_user

router = APIRouter()


@router.post("", response_model=ConversationRead, status_code=201)
async def create_conversation(
    body: ConversationCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """创建新对话。"""
    conv = Conversation(user_id=user.id, title=body.title)
    db.add(conv)
    await db.commit()
    # refresh 从数据库重新加载，获取自增 ID 和默认时间戳
    await db.refresh(conv)
    return conv


@router.get("", response_model=list[ConversationRead])
async def list_conversations(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """列出当前用户的所有对话，按更新时间倒序。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{conversation_id}/messages", response_model=list[MessageRead])
async def get_messages(
    conversation_id: int,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """获取某对话的全部消息，按时间正序。"""
    # 先验证对话属于当前用户，防止越权访问
    conv = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    return result.scalars().all()


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """删除对话（级联删除其所有消息）。"""
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
