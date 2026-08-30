"""临时会话上下文(进程内内存字典兜底):保存最近几轮对话,供陪伴 Agent 注入连续上下文。

设计要点:
- 进程内 dict,按 (user_id, session_id) 复合键控,支持同一用户多端 / 多会话并存。
- session_id 由客户端传入(每次对话一个);缺省(None / 空串)时回落默认会话,兼容旧调用。
- 每轮 append 做长度截断(单条 max_chars)与轮数截断(最多 max_turns 对,超出丢最旧)。
- 惰性过期:超过 ttl 分钟未活动的 key 在读取时清空(视为"退出对话")。
- 显式 clear 供前端在用户退出 / 关闭某段对话时调用(只清指定会话)。
"""
from __future__ import annotations

import threading
import time

from config import get_settings


class SessionContextStore:
    def __init__(self) -> None:
        self._data: dict[tuple[str, str], dict] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _key(user_id: str, session_id: str | None) -> tuple[str, str]:
        return (user_id, session_id or "")

    def append_turn(self, user_id: str, role: str, content: str, session_id: str | None = None) -> None:
        s = get_settings()
        content = (content or "").strip()[: s.session_context_max_chars]
        if not content:
            return
        key = self._key(user_id, session_id)
        with self._lock:
            bucket = self._data.setdefault(key, {"turns": [], "last_seen": 0.0})
            bucket["turns"].append({"role": role, "content": content})
            # 保留最近 max_turns 对(user + assistant 各一条算一对)
            max_msgs = s.session_context_max_turns * 2
            if len(bucket["turns"]) > max_msgs:
                bucket["turns"] = bucket["turns"][-max_msgs:]
            bucket["last_seen"] = time.time()

    def get_turns(self, user_id: str, session_id: str | None = None) -> list[dict]:
        s = get_settings()
        key = self._key(user_id, session_id)
        with self._lock:
            bucket = self._data.get(key)
            if bucket is None:
                return []
            if time.time() - bucket["last_seen"] > s.session_context_ttl_minutes * 60:
                del self._data[key]
                return []
            return list(bucket["turns"])

    def clear(self, user_id: str, session_id: str | None = None) -> None:
        key = self._key(user_id, session_id)
        with self._lock:
            self._data.pop(key, None)


_store = SessionContextStore()


def append_turn(user_id: str, role: str, content: str, session_id: str | None = None) -> None:
    _store.append_turn(user_id, role, content, session_id)


def get_turns(user_id: str, session_id: str | None = None) -> list[dict]:
    return _store.get_turns(user_id, session_id)


def clear_turns(user_id: str, session_id: str | None = None) -> None:
    _store.clear(user_id, session_id)
