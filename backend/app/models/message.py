"""消息表模型，存储对话中的每一条 user / assistant 消息。"""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class Message(Base):
    """消息表：存储对话中的单条消息（用户输入或 AI 回复）。"""

    __tablename__ = "messages"

    # 自增主键
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # 外键关联 conversations 表，加索引加速按对话查询消息
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id"), nullable=False, index=True
    )
    # 消息角色：user（用户输入）或 assistant（AI 回复）
    # system 角色由后端在调用 LLM 时自动注入，不存入此表
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # 消息正文，使用 Text 类型支持长文本
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    # 多对一关系：一条消息属于一个对话
    conversation: Mapped["Conversation"] = relationship(
        back_populates="messages"
    )
