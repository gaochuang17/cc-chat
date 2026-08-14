from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router

app = FastAPI(title="AI Assistant API", version="0.1.0")

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


@app.get("/")
async def root():
    """健康检查接口"""
    return {"status": "ok", "message": "AI Assistant API is running"}
