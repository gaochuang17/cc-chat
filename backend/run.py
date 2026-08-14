"""
启动脚本：python run.py

等价于命令行直接运行：
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # 开发模式：代码修改后自动重启
    )
