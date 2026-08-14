import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class User(SQLAlchemyBaseUserTableUUID, Base):
    """用户表，标准字段(id/email/hashed_password/...)由 SQLAlchemyBaseUserTableUUID 提供。"""

    __tablename__ = "users"

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
