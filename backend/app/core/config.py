import os
from dotenv import load_dotenv

# 从 .env 文件加载环境变量
load_dotenv()


class Settings:
    """
    应用配置，从 .env 文件读取。

    .env 示例（Ollama 本地模式）:
      OPENAI_API_KEY=ollama
      OPENAI_BASE_URL=http://localhost:11434/v1
      OPENAI_MODEL=qwen2.5:7b
    """

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    SYSTEM_PROMPT: str = os.getenv(
        "SYSTEM_PROMPT", "你是一个有用的AI助手，请用中文回答用户的问题。"
    )


# 全局单例，其他模块直接 from app.core.config import settings
settings = Settings()
