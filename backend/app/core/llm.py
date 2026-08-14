import json
from openai import AsyncOpenAI
from app.core.config import settings

_client = None


def get_client() -> AsyncOpenAI:
    """延迟初始化 OpenAI 客户端，避免没有 API key 时服务器无法启动"""
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
    return _client


async def stream_chat(messages: list[dict]):
    """
    调用 LLM 并以 SSE 格式逐 token 流式返回。

    每个数据块格式:  data: {"content": "..."}\n\n
    结束标记:        data: [DONE]\n\n

    Args:
        messages: 完整的对话历史 [{"role": "system", "content": "..."}, ...]

    Yields:
        str: SSE 格式的数据块
    """
    client = get_client()
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        stream=True,
    )

    async for chunk in response:
        delta = chunk.choices[0].delta
        if delta.content:
            data = json.dumps({"content": delta.content}, ensure_ascii=False)
            yield f"data: {data}\n\n"

    yield "data: [DONE]\n\n"
