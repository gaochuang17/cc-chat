import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """应用配置，从 .env 文件读取"""

    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    SYSTEM_PROMPT: str = os.getenv(
        "SYSTEM_PROMPT", "你是一个有用的AI助手，请用中文回答用户的问题。"
    )


settings = Settings()
