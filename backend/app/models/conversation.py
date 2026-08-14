"""对话（会话）表模型，一个用户可以有多个对话。"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.message import Message


class Conversation(Base):
    """对话表：记录用户的一次完整聊天会话。"""

    __tablename__ = "conversations"

    # 自增主键，对话的唯一标识
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # 外键关联 users 表，加了索引加速按用户查询对话
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    # 对话标题，默认"新对话"，首条消息时后端自动更新为消息前 50 字
    title: Mapped[str] = mapped_column(
        String(200), default="新对话", nullable=False
    )
    # 创建时间和更新时间，用于排序
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # 一对多关系：一个对话包含多条消息
    # cascade="all, delete-orphan" 表示删除对话时自动删除其所有消息
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )

    # 多对一关系：一个对话属于一个用户
    user: Mapped["User"] = relationship(back_populates="conversations")
