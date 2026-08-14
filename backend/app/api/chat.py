from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest
from app.core.config import settings
from app.core.llm import stream_chat

router = APIRouter()


@router.post("/chat")
async def chat(req: ChatRequest):
    """
    流式聊天接口（SSE）。

    前端发送 POST /api/chat，body 包含完整对话历史，
    后端以 text/event-stream 流式逐块返回 AI 回复。

    数据格式:
      data: {"content": "..."}\n\n   — 每个文本片段
      data: [DONE]\n\n              — 回复结束标记
    """
    # 组装发给 LLM 的消息（在最前面插入系统提示词）
    llm_messages = [
        {"role": "system", "content": settings.SYSTEM_PROMPT}
    ]
    for msg in req.messages:
        llm_messages.append({"role": msg.role, "content": msg.content})

    return StreamingResponse(
        stream_chat(llm_messages),
        media_type="text/event-stream; charset=utf-8",
    )
