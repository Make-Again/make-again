# Make Again · 再一次

> 我们不帮你忘记谁，而是陪你慢慢学会，在失去之后继续生活。

Make Again 是一个陪伴式的哀伤疗愈应用：通过语音/文字对话、来信、初次报告与时间看板等方式，陪你走过失去（分手、宠物离世、亲人离世）之后的时光，慢慢和遗憾和解。

## 项目结构

```
make-again/
├── frontend/   # 前端 HTML 原型（原生 HTML/CSS/JS，无构建步骤）
├── backend/    # FastAPI 后端（SQLite + DeepSeek / 腾讯云 LLM·TTS·ASR）
└── docs/       # 需求、架构、接口、风格等设计文档
```

## 前端（frontend/）

- 纯静态 HTML/CSS/JS，入口 `frontend/001-login.html`（`index.html` 会自动跳转过去）。
- 页面按编号流程推进：001 登录/注册 → 002 来信 → 003 Voice 对话 → 004 初次报告/时间看板 → 005 主界面 → … → 结尾仪式。
- 语音录音依赖浏览器 `getUserMedia`，**必须在 HTTPS（或 localhost）安全上下文下运行**，HTTP 下麦克风不可用。

## 后端（backend/）

- Python FastAPI + SQLAlchemy + SQLite；`MOCK_LLM=false` 时接入 DeepSeek 与腾讯云（TTS/ASR/COS）。
- 依赖见 `backend/requirements.txt`。
- 配置：复制 `backend/.env.example` 为 `backend/.env`，填入各密钥。
- 启动：`cd backend && uvicorn main:app --host 127.0.0.1 --port 8000`

## 文档（docs/）

需求分析、后端架构设计、前端功能与接口文档、项目背景与产品分析、风格建议等设计资料。

## 许可证

（待定）
