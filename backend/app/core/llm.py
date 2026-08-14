from openai import AsyncOpenAI

from app.core.config import settings

_client = None


def get_client() -> AsyncOpenAI:
    """延迟初始化 OpenAI 客户端，避免没有 API key 时服务器无法启动。"""
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
    return _client


async def stream_chat_raw(messages: list[dict]):
    """
    调用 LLM 并逐 token 流式返回原始文本。

    SSE 格式化和数据库写入由调用方（chat 路由）负责，
    保持本函数只关注 LLM 调用。

    Yields:
        str: 原始文本片段
    """
    client = get_client()
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        stream=True,
    )
    async for chunk in response:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
