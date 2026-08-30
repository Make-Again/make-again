# 重逢 · 离别疗愈陪伴后端(核心模块)

这是架构设计文档里 **Phase 1 核心模块** 的可运行实现:记忆系统 + 模型网关 + 情绪引擎 + 陪伴 Agent。

## 目录

```
backend/
├── config.py            # 配置(env 驱动)
├── main.py              # FastAPI 入口
├── gateway/             # 模型网关(deepseek-v4-pro, OpenAI 兼容 + mock)
├── emotion/             # 情绪分类 + 危机检测
├── memory/              # 数据模型 / 存储 / 写入 / 召回 / 反思
├── agent/               # 陪伴 Agent(危机→召回→生成→回写)
├── api/                 # REST 路由
└── scripts/smoke_test.py
```

## 快速开始

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # 默认 MOCK_LLM=true,无需 key 即可跑
python scripts/smoke_test.py   # 冒烟测试:跑通全链路
uvicorn main:app --reload      # 启动服务 http://127.0.0.1:8000
```

## 接入真实模型 deepseek-v4-pro

编辑 `.env`:

```
MOCK_LLM=false
LLM_BASE_URL=https://你的deepseek网关/v1     # OpenAI 兼容接口
LLM_API_KEY=你的key
LLM_MODEL=deepseek-v4-pro
```

接口约定为 OpenAI 兼容的 `POST {base}/chat/completions`。

## 前端开发文档

完整的接口与功能说明(49 个接口、请求/响应 JSON 结构、聊天记录「每日总结 + 两级分页」契约、物品上传卡片契约、树洞/周报弹窗去重语义、访谈报告轮询等)见:

👉 **[docs/前端开发文档.md](docs/前端开发文档.md)**

## 核心 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat` | 陪伴对话,`{"user_id","message"}` |
| GET | `/api/portraits/{user_id}` | 查看用户/对象画像 |
| POST | `/api/portraits/{user_id}?kind=user` | 写入画像 |
| POST | `/api/reflect/{user_id}` | 触发反思,生成情绪趋势/节点 |
| GET | `/api/health` | 健康检查 |

## 记忆系统的三条流程

- **写入**(`memory/extract.py`):每轮倾诉抽取 `facts / emotion / summary / importance / place_tag / time_tag`。
- **召回**(`memory/recall.py`):`score = α·recency + β·importance + γ·relevance`(关键词重叠,向量为后续可替换项)。
- **反思**(`memory/reflect.py`):聚合出情绪趋势、"最难过的时间段"、重复提到的地点/时刻等洞察。

## 后续接入点(已在架构文档中规划)

- 向量召回:把 `recall.py` 里的关键词相似度替换为 embedding 余弦(列 `embedding` 已预留)。
- 生产存储:`DATABASE_URL` 切 Postgres + pgvector。
- 任务调度:Celery/Temporal 承接多天访谈、定期报告、多模态流水线。
