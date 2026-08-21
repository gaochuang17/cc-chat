"""认证后端配置：定义 JWT 的传输方式和签名策略。"""
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)

from app.core.config import settings

# Bearer 传输：前端在 Authorization 头中携带 token
# tokenUrl 指定登录端点路径，用于 OpenAPI 文档展示
bearer_transport = BearerTransport(tokenUrl="api/auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    """JWT 签名策略：token 有效期 24 小时，过期后需重新登录。"""
    return JWTStrategy(secret=settings.SECRET_KEY, lifetime_seconds=86400)


# 认证后端：组合传输方式 + 签名策略
# fastapi-users 据此自动实现登录、登出、token 校验接口
auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)
