from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """聊天请求体：前端只发对话 ID 和最新一条用户消息，历史由后端从数据库加载。"""
    conversation_id: int
    message: str = Field(min_length=1)
