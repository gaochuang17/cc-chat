import json
from openai import AsyncOpenAI
from app.core.config import settings

_client = None


def get_client() -> AsyncOpenAI:
    """
    延迟初始化 OpenAI 客户端。

    用延迟初始化而非模块级实例化，是因为 AsyncOpenAI 构造时
    会校验 API Key，如果 key 为空会直接报错导致服务器无法启动。
    这样可以让服务器先启动，实际调用接口时才初始化客户端。
    """
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

    这是一个 async generator，每次 yield 一条完整的 SSE 消息，
    StreamingResponse 会立即将其推送给前端（不等待全部生成完成）。

    Args:
        messages: 完整的对话历史 [{"role": "system", "content": "..."}, ...]

    Yields:
        str: SSE 格式数据块，如 'data: {"content": "你好"}\\n\\n'
    """
    client = get_client()

    # 调用 OpenAI Chat Completions API（兼容 Ollama、DeepSeek 等）
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        stream=True,  # 流式模式：逐 token 返回
    )

    # 遍历每个 chunk，提取文本内容，包装成 SSE 格式
    async for chunk in response:
        delta = chunk.choices[0].delta
        if delta.content:
            data = json.dumps({"content": delta.content}, ensure_ascii=False)
            yield f"data: {data}\n\n"

    # 发送结束标记，通知前端回复已完成
    yield "data: [DONE]\n\n"
