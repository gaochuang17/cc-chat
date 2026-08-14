from pydantic import BaseModel


class Message(BaseModel):
    """单条消息，字段和前端 TypeScript 的 Message 接口对齐"""
    role: str      # user / assistant / system
    content: str   # 消息内容


class ChatRequest(BaseModel):
    """聊天请求体：前端发送的完整对话历史"""
    messages: list[Message]
