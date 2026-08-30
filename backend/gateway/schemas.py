"""结构化输出:从模型文本里稳健提取 JSON。"""
from __future__ import annotations

import json
import re
from typing import Any


_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def parse_json(text: str) -> tuple[Any | None, str]:
    """返回 (解析出的对象或 None, 原始文本)。

    容错处理 markdown 代码块、JSON 前后的杂散文字。
    """
    if not text:
        return None, text
    candidate = None
    fence = _FENCE.search(text)
    if fence:
        candidate = fence.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            candidate = text[start:end + 1]
    if candidate:
        try:
            return json.loads(candidate), text
        except json.JSONDecodeError:
            pass
    return None, text
