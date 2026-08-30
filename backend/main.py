"""应用入口。"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from memory.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="重逢 · 离别疗愈陪伴后端", lifespan=lifespan)
app.include_router(router)

# 前端为静态原型（file:// 或本地静态服务器），跨源调用需要放开 CORS。
# 生产上线前请收紧为具体域名（配合网关鉴权）。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
