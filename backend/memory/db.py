"""数据库引擎与会话。默认 SQLite 零依赖;生产切 Postgres+pgvector。

并发要点(2 核 4G 小服务器,多用户并发):
- 开 WAL + busy_timeout + synchronous=NORMAL:并发读写时避免 "database is locked"。
- 文件型 SQLite 用显式小连接池(读多写少,WAL 下 5 个连接够用),避免每请求开新连接。
- 单进程多线程(uvicorn 单 worker);进程内内存态(session_context)不跨进程,勿开多 worker。
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import QueuePool

from config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
_url = _settings.database_url
_connect_args: dict = {}

_is_file_sqlite = False
if _url.startswith("sqlite"):
    db_path = _url.replace("sqlite:///", "", 1)
    if db_path not in (":memory:", ""):
        _is_file_sqlite = True
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    # check_same_thread=False:SQLAlchemy 连接池跨线程复用同一连接;
    # timeout=等待写锁的秒数(配合 WAL,把瞬时锁竞争消化掉而不是直接报 locked)。
    _connect_args = {"check_same_thread": False, "timeout": 5.0}

_engine_kwargs: dict = {"connect_args": _connect_args}
if _is_file_sqlite:
    # 文件型 SQLite 默认即可用 QueuePool,这里显式收敛连接数,避免并发请求各开一堆连接。
    _engine_kwargs.update(poolclass=QueuePool, pool_size=5, max_overflow=10, pool_timeout=30)

engine = create_engine(_url, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

if _url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):
        # WAL:读写互不阻塞(一写多读),多用户同时读写时大幅降低锁竞争;
        # synchronous=NORMAL 在 WAL 下仍是持久性安全的,且少一次 fsync。
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


def init_db() -> None:
    from memory import models  # noqa: F401  确保模型已注册
    Base.metadata.create_all(engine)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
