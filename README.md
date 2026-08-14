# AI 智能助手

ChatGPT 式 AI 聊天助手，前后端分离架构。

## 技术栈

- **前端**: React 18 + Vite + Ant Design 5 + TypeScript
- **后端**: Python + FastAPI + OpenAI SDK

## 项目结构

```
wo/
├── frontend/          # 前端项目
│   ├── src/
│   │   ├── components/    # 聊天组件
│   │   ├── hooks/         # useChat 流式封装
│   │   ├── types/         # 类型定义
│   │   ├── App.tsx        # 主应用
│   │   └── main.tsx       # 入口
│   ├── package.json
│   └── vite.config.ts     # 含 /api 代理到后端
│
└── backend/           # 后端项目
    ├── app/
    │   ├── main.py         # FastAPI 入口
    │   ├── api/chat.py     # 流式聊天接口
    │   ├── core/
    │   │   ├── config.py   # 配置管理
    │   │   └── llm.py      # LLM 客户端封装
    │   └── models/
    │       └── schemas.py  # 请求模型
    ├── requirements.txt
    └── .env.example        # API Key 配置模板
```

## 快速开始

### 1. 启动后端

```bash
cd backend

# 安装依赖
pip3 install -r requirements.txt

# 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 启动服务（运行在 localhost:8000）
python3 -m uvicorn app.main:app --reload --port 8000
```

支持的 LLM（修改 .env 即可切换）：
- OpenAI: `OPENAI_BASE_URL=https://api.openai.com/v1`
- DeepSeek: `OPENAI_BASE_URL=https://api.deepseek.com`
- 通义千问: `OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`

### 2. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（运行在 localhost:5173）
npm run dev
```

浏览器打开 http://localhost:5173 即可使用。

## 核心特性

- 流式输出（打字机效果）
- Markdown 渲染 + 代码高亮
- 多会话管理（侧边栏切换）
- 消息中断（停止生成）
- 支持 OpenAI / DeepSeek / 通义千问等兼容 API
