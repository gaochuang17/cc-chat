"""对话和消息相关的 Pydantic 模型，定义 API 的请求和响应格式。"""
from datetime import datetime

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    """创建对话请求体，title 可选，不传则默认"新对话"。"""

    title: str = Field(default="新对话", max_length=200)


class ConversationRead(BaseModel):
    """返回给前端的对话信息。"""

    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    # from_attributes=True 允许从 SQLAlchemy 模型实例直接转换
    model_config = {"from_attributes": True}


class MessageRead(BaseModel):
    """返回给前端的消息信息。"""

    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
