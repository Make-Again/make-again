"""物品工具:聊天里的「纪念 / 寄存」(第一个 tool calling 能力)。

职责:
- 定义工具 schema(供 LLM function calling)。
- 执行工具:判断 keep 是否已讲过(去重),产出给模型写文案的方向。
- 组装返回给前端的结构化 tool 字段。
- 上传核心:识别 + 抠图 + 简化描述 + 落库(ItemMemory + 记忆流)。
"""
from __future__ import annotations

import json
import struct
from datetime import timedelta
from uuid import uuid4

from config import get_settings
from gateway.client import LLMClient
from gateway.storage import ObjectStore, StorageError
from gateway.vision import VisionClient
from memory import store

# 工具 schema:OpenAI function calling 格式
ITEM_RITUAL_TOOL = {
    "type": "function",
    "function": {
        "name": "suggest_item_ritual",
        "description": (
            "当用户提到某件有情感意义的物品时调用:判断 TA 是想「留作纪念(keep)」还是"
            "「看到会难过、想放下(let_go)」。据此返回对应文案方向——"
            "keep→邀请上传照片并提问物品故事;let_go→建议把物品寄存到这里并上传照片。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "item_name": {"type": "string", "description": "物品名称,如「那条手链」「他送的围巾」"},
                "intent": {"type": "string", "enum": ["keep", "let_go"],
                           "description": "keep=留作纪念;let_go=想忘记/看到会难过,想放下"},
                "item_description": {"type": "string",
                                     "description": "用户提到的物品描述或故事片段,可为空"},
            },
            "required": ["item_name", "intent"],
        },
    },
}

_KEEP_DIRECTION = "邀请用户上传这件物品的照片,并温柔地提问它背后的故事,帮助用户保留这份回忆。"
_LET_GO_DIRECTION = "建议用户把这件物品「寄存」到这里(上传一张照片),帮用户对这份痛苦释怀、慢慢松开手。"


def execute_tool(db, user_id: str, tool_call: dict) -> dict:
    """执行工具(纯本地、零 LLM):去重判断 + 文案方向。"""
    args = tool_call.get("function", {}).get("arguments") or tool_call.get("arguments") or {}
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            args = {}
    item_name = (args.get("item_name") or "").strip()
    intent = args.get("intent") or "keep"
    item_desc = (args.get("item_description") or "").strip()

    # keep 且已讲过 → 不再询问
    if intent == "keep" and store.has_item_story(db, user_id, item_name):
        return {
            "surface": False,
            "reason": f"用户之前已经讲过「{item_name}」的故事,不要再重复询问上传/故事,"
                      f"可温柔回应「我记得你跟我说过这件东西…」",
        }

    direction = _KEEP_DIRECTION if intent == "keep" else _LET_GO_DIRECTION
    return {
        "surface": True,
        "intent": intent,
        "item_name": item_name,
        "item_description": item_desc,
        "direction": direction,
        "note": "这是用户第一次提到这件物品;不要写「我记得你之前说过」或「你之前说它…」,"
                "当作新信息回应,更不要把它和记忆里的其它物品混为一谈。",
    }


def tool_payload(results: list[dict], reply: str) -> dict | None:
    """由工具执行结果组装返回给前端的结构化字段;无要展示的动作时返回 None。"""
    for r in results:
        if r.get("surface"):
            return {
                "type": "item_keep" if r.get("intent") == "keep" else "item_let_go",
                "item_name": r.get("item_name") or "",
                "intent": r.get("intent"),
                "item_description": r.get("item_description") or "",
                "upload": True,
                "copy": reply,
            }
    return None


def simplify_description(client: LLMClient, text: str, max_len: int = 80) -> str:
    """描述过长时用 fast 模型压缩到一句话;失败/ mock 时硬截断。"""
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    if client.mock:
        return text[: max_len - 1] + "…"
    try:
        result = client.chat(
            [
                {"role": "system", "content":
                 "你是文案压缩助手。把用户对一件物品的描述压缩成一句话(≤80字),"
                 "保留物品是什么、与谁有关、承载的情感,不要编造细节。只输出压缩后的句子。"},
                {"role": "user", "content": text},
            ],
            temperature=0.2,
            model=client.settings.llm_fast_model,
        )
        out = (result.get("content") or "").strip()
        return out[:max_len] if out else text[: max_len - 1] + "…"
    except Exception:  # noqa: BLE001 压缩失败不阻塞主链路
        return text[: max_len - 1] + "…"


def _image_size(data: bytes) -> tuple[int, int] | None:
    """纯 Python 解析 PNG/JPEG 宽高(避免依赖 Pillow),用于把归一化 bbox 转成像素框。"""
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        w, h = struct.unpack(">II", data[16:24])
        return w, h
    if data[:2] == b"\xff\xd8":  # JPEG
        i = 2
        while i + 4 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):  # SOF 段
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seg_len
    return None


def handle_upload(db, user_id: str, image_bytes: bytes, item_name: str, intent: str,
                  description: str, client: LLMClient, vision: VisionClient | None = None,
                  obj_store: ObjectStore | None = None) -> dict:
    """物品上传核心:定位(grounding)+ 裁切 + 抠图 + 简化描述 + 落库。返回结构化结果。

    链路(务实版,全链路优雅降级):
    1. 上传原图 → 2. VLM 定位(图 + 描述 → 目标物品 bbox/标签) → 3. 按 bbox 裁切让抠图聚焦
       → 4. 数据万象通用抠图 AIPicMatting → 5. 存库。
    任一步失败回退:定位失败退回整图、裁切失败退回整图、抠图失败存原图。
    """
    store.get_or_create_user(db, user_id)
    vision = vision or VisionClient()
    obj_store = obj_store or ObjectStore()
    if intent not in ("keep", "let_go"):
        intent = "keep"

    desc = simplify_description(client, description)

    prefix = get_settings().cos_item_prefix
    original_key = obj_store.upload(f"{uuid4().hex}.png", image_bytes,
                                    content_type="image/png", prefix=prefix)

    # 定位:优先用「描述」做 VLM grounding(与「根据描述抠出物品」一致),描述为空时退回名称。
    query = (desc or item_name or "").strip() or "主体物品"
    ground = vision.ground(obj_store.presigned_url(original_key), query)
    label = ground.get("label") or vision.recognize(image_bytes)
    if not item_name:
        item_name = label or "这件物品"

    crop_key = original_key
    bbox = ground.get("bbox")
    if bbox:
        size = _image_size(image_bytes)
        if size:
            w, h = size
            box = [bbox[0] * w, bbox[1] * h, bbox[2] * w, bbox[3] * h]
            try:
                cropped = obj_store.ai_crop(original_key, box)
                crop_key = obj_store.upload(f"{uuid4().hex}_crop.png", cropped,
                                            content_type="image/png", prefix=prefix)
            except StorageError:
                pass  # 裁切失败退回整图

    # 抠图:数据万象通用抠图(需桶已开通数据万象);未开通/本地存储 → 回退存原图
    try:
        cutout = obj_store.ai_matte(crop_key)
    except StorageError:
        cutout = image_bytes
    cutout_key = obj_store.upload(f"{uuid4().hex}_cutout.png", cutout,
                                  content_type="image/png", prefix=prefix)

    # 校验:抠出来的到底是不是用户描述的那件物品;不符合则清理并返回提示。
    # 默认关闭(提速):校验需一次多模态调用(约 +5s),且失败本就放行,故默认跳过。
    if get_settings().item_verify_cutout:
        verify_query = (description or "").strip() or item_name
        check = vision.verify(obj_store.presigned_url(cutout_key), verify_query)
        if not check["match"]:
            for k in {original_key, crop_key, cutout_key}:
                try:
                    obj_store.delete(k)
                except StorageError:
                    pass
            return {"ok": False, "match": False,
                    "reason": check.get("reason") or "这张图好像不是你说的那件物品,换一张更清晰、主体更明显的再试一次?"}

    # 不保留原图:抠图校验通过后,删除原图与中间裁切图,只留抠图(尽力而为,失败不阻塞)
    for k in {original_key, crop_key}:
        try:
            obj_store.delete(k)
        except StorageError:
            pass

    row = store.add_item_memory(
        db, user_id, item_name=item_name, intent=intent, description=desc,
        label=label, original_key="", cutout_key=cutout_key,
    )
    # 入记忆流供后续召回(emotion=None 不污染情绪指标)
    store.add_memory(db, user_id, type="item", content=desc,
                     summary=f"物品「{item_name}」", emotion=None, importance=7.0)

    return {
        "ok": True,
        "match": True,
        "item_id": row.id,
        "item_name": item_name,
        "label": label,
        "description": desc,
        "intent": intent,
        "cutout_url": obj_store.presigned_url(cutout_key),
        "backend": obj_store.backend,
    }


def list_items(db, user_id: str, obj_store: ObjectStore | None = None) -> list[dict]:
    """看板:列出用户所有物品(抠图预签名 URL + 描述),按时间倒序。"""
    store.get_or_create_user(db, user_id)
    obj_store = obj_store or ObjectStore()
    return [{
        "item_id": r.id,
        "item_name": r.item_name,
        "intent": r.intent,
        "description": r.description,
        "label": r.label,
        "cutout_url": obj_store.presigned_url(r.cutout_key),
        "created_at": (r.ts + timedelta(hours=get_settings().timezone_offset_hours)).isoformat(),
    } for r in store.list_item_memories(db, user_id)]
