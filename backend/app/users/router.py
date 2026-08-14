"""认证路由配置：创建 fastapi-users 实例并提供用户依赖。"""
import uuid

from fastapi_users import FastAPIUsers

from app.models import User
from app.users.backend import auth_backend
from app.users.user_manager import get_user_manager

# fastapi-users 核心实例，绑定用户模型、用户管理器和认证后端
# 通过它生成注册、登录、用户管理等路由
fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

# FastAPI 依赖：从请求中解析 JWT，查出对应用户
# 参数 active=True 表示未激活用户（is_active=False）会被拒绝
# 在需要登录的路由中用 user: User = Depends(current_active_user) 即可保护
current_active_user = fastapi_users.current_user(active=True)
