"""用户管理器：封装用户的创建、密码哈希、JWT token 生成等核心逻辑。"""
import uuid
from typing import AsyncGenerator, Optional

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_async_session
from app.models import User


async def get_user_db(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[SQLAlchemyUserDatabase, None]:
    """FastAPI 依赖：提供用户数据库适配器实例。"""
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """
    用户管理器：fastapi-users 的核心组件。

    负责用户的创建、密码哈希校验、token 生成等，
    同时提供钩子方法（如 on_after_register）供自定义注册后逻辑。
    """

    reset_password_token_secret = settings.SECRET_KEY
    verification_token_secret = settings.SECRET_KEY

    async def on_after_register(
        self, user: User, request: Optional[Request] = None
    ):
        """注册成功后的回调，可在此发送欢迎邮件等。"""
        print(f"User {user.id} has registered.")


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase = Depends(get_user_db),
) -> AsyncGenerator[UserManager, None]:
    """FastAPI 依赖：提供 UserManager 实例。"""
    yield UserManager(user_db)
