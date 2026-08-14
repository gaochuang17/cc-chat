"""FastAPI 应用入口：创建 app 实例，注册中间件和所有路由。"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.conversations import router as conversation_router

app = FastAPI(title="AI Assistant API", version="0.1.0")

from app.users.router import fastapi_users, auth_backend
from app.users.schemas import UserRead, UserCreate, UserUpdate
from app.users.router import current_active_user

# CORS 配置：允许前端开发服务器（localhost:5173）跨域访问
# 生产环境应改为具体的前端域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册聊天路由，统一加 /api 前缀
app.include_router(chat_router, prefix="/api")
app.include_router(conversation_router, prefix="/api/conversations", tags=["conversations"])
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)


@app.get("/")
async def root():
    """健康检查接口"""
    return {"status": "ok", "message": "AI Assistant API is running"}
