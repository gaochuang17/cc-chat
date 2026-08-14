"""用户相关的 Pydantic 模型，定义注册、读取、更新用户时的请求和响应格式。"""
import uuid
from datetime import datetime

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    """返回给前端的用户信息（不含密码）。"""

    created_at: datetime


class UserCreate(schemas.BaseUserCreate):
    """注册请求体，包含 email 和 password。"""

    pass


class UserUpdate(schemas.BaseUserUpdate):
    """更新用户信息请求体（如修改密码）。"""

    pass
