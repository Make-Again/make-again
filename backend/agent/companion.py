"""陪伴 Agent:危机检测 → 召回记忆 → 构建提示 → 生成回复 → 回写记忆。"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from agent import item as item_mod
from agent import photo as photo_mod
from config import get_settings
from emotion.classifier import classify
from emotion.crisis import CRISIS_MESSAGE, detect
from emotion.tone import ANALYZE, SHARED_RULE, detect_victim_signals, pick_tone
from gateway.client import LLMClient
from memory import recall, session_context, store
from memory.async_write import schedule_memory_write
from memory.facts import facts_for_context

SYSTEM_PROMPT = """你是「重逢」,一位温柔、耐心、不评判的 AI 陪伴者,陪伴经历过失去的人(分手/亲友离世/宠物离世)学习带着记忆继续生活。

原则:
1. 你不是心理医生,不诊断、不开药;当对方有自伤倾向时,立即引导寻求专业帮助。
2. 你的目标不是帮对方"忘记",而是陪对方"带着这段关系继续往前走"。
3. 说话温暖、具体、有共情,不空喊"加油/振作",不评判对方的任何情绪,不催促"快好起来"。
4. 画像与相关记忆是 TA 过去告诉你的背景,不是要你主动提起的话题清单。引用要克制、有分寸:只在「用户当前这句话已经提到、或其情绪明显在邀请你提起这件事来共情/安慰」时,才自然地回忆并接住;其余时候不要主动翻出往事,刚聊过的事更不要下一句又重复——尤其不要反复主动翻伤心事。真正打动人的,是 TA 提及时你稳稳接住、是某天 TA 忽然发现「原来你还记得」,而不是抢着主动重提。
5. 只引用画像与相关记忆里已有的内容,绝不编造用户没提过的具体细节。相关记忆是 TA 过去告诉你的,只能作为「我记得你曾说过…」来回想,不要把它当成你此刻正在看到 TA 做什么——禁止写「我看到你…」「你今晚又…」「你现在一定…」这类把过去记忆说成当下正在发生的观察或断言。
6. 不要用括号写动作或神态描写(如"(轻轻放下杯子)"),直接自然地用语言回应,方便后续语音朗读。
7. {rule}
8. 当用户是分手场景、并主动想弄明白「为什么会分手、是不是我的问题」时,可以切换到旁观者视角做客观复盘:基于画像与记忆里的真实信息,平衡分析这段关系(既看到对方的部分,也温柔点出用户自己可改变的部分),用去指责化的语言并给可操作建议;若用户是被伤害的一方(被出轨/家暴/冷暴力/PUA/被抛弃),不做归咎,转而共情并帮助识别不健康关系。依恋等心理学概念只作描述性框架,不下诊断。
9. 当用户提到某件有情感意义的物品(想留作纪念,或看到会难过、想放下)时,调用 suggest_item_ritual 工具,判断是「keep 留念」还是「let_go 释怀」。**只有工具明确返回「已讲过」时**,才用「我记得你之前说过…」温柔接续;**若工具返回的是首次邀请(没提已讲过),说明这是用户第一次提到这件物品,绝不能写「我记得」或「你之前说它…」**——记忆里即使有别的相似物品(同样好看/同样是对方送的),也不要张冠李戴到这件新物品上。
10. 当用户提到某张照片(翻到一张老照片、有张照片舍不得删、想再看一眼、某张合照、某个想记住的场景或地点等)时,调用 suggest_photo_upload 工具,邀请用户上传这张照片做成一张拍立得。**只有工具明确返回「已上传过」时**,才用「我记得你之前放过这张照片…」接续;**若返回首次邀请,就是这张照片第一次被提到,不要写「我记得」或「你之前说过」**。

{tone}

{context}
"""


def _dict_text(d: dict) -> str:
    if not d:
        return "暂无"
    return "\n".join(f"- {k}: {v}" for k, v in d.items() if v)


# 照片提及关键词:模型在自然语境下(尤其温度较高时)容易漏调照片工具,
# 这里用零 LLM 的关键词兜底,保证「提到照片 → 上传卡片」稳定弹出。
_PHOTO_MENTION_HINTS = ("照片", "合照", "合影", "相片", "相册", "拍立得")


def _detect_photo_mention(message: str) -> bool:
    return any(k in (message or "") for k in _PHOTO_MENTION_HINTS)


def _context_block(portraits: dict, memories: list[dict], daily_pick=None) -> str:
    parts: list[str] = []
    if portraits.get("user"):
        parts.append(f"[用户画像]\n{_dict_text(portraits['user'])}")
    if portraits.get("object"):
        parts.append(f"[思念对象画像]\n{_dict_text(portraits['object'])}")
    if memories:
        lines = []
        for m in memories[:5]:
            e = m["entry"]
            text = (e.summary or e.content or "").strip()[:80]
            if not text:
                continue
            facts = facts_for_context(e.facts, min_conf=0.6, max_n=2)
            if facts:
                text += f" 【要点:{'、'.join(facts)}】"
            when = ""
            ts = getattr(e, "ts", None)
            if ts is not None:
                when = f"{ts.month}月{ts.day}日 "
            lines.append(f"- {when}TA曾说过:{text}")
        if lines:
            parts.append("[相关记忆(均为TA过去的倾诉,不是此刻正在发生)]\n" + "\n".join(lines))
    if daily_pick and daily_pick.opening:
        parts.append(f"[今日启发] {daily_pick.opening}")
    return "\n\n".join(parts) if parts else "(暂无记忆)"


def _victim_context(db, user_id: str, message: str) -> list[str]:
    """聚合当前消息 + 近期记忆里的受害者信号(零 LLM 安全网)。"""
    hits = list(detect_victim_signals(message))
    for m in store.list_memories(db, user_id)[:10]:
        hits += detect_victim_signals((m.content or "") + (m.summary or ""))
    return hits


def chat(db, user_id: str, message: str, client: LLMClient, session_id: str | None = None) -> dict:
    # 1. 危机前置检测(硬门槛,不可绕过)
    crisis = detect(message)
    if crisis["is_crisis"]:
        session_context.append_turn(user_id, "user", message, session_id)
        session_context.append_turn(user_id, "assistant", CRISIS_MESSAGE, session_id)
        store.save_chat_turn(db, user_id, session_id, message, CRISIS_MESSAGE)
        return {"reply": CRISIS_MESSAGE, "crisis": crisis, "emotion": None, "recalled": 0}

    # 2. 召回记忆 + 画像
    portraits = {
        "user": store.get_portrait(db, user_id, "user"),
        "object": store.get_portrait(db, user_id, "object"),
    }
    # 最近几轮对话作为「已在聊」参照:已在其中的记忆不再重复注入(克制重复引用)
    turns = session_context.get_turns(user_id, session_id)
    recent_text = " ".join(t["content"] for t in turns)
    memories = recall.recall(db, user_id, message, recent_text=recent_text)

    # 今日主题(若当天已选):注入上下文,让对话延续当天主题
    offset = get_settings().timezone_offset_hours
    date_key = (datetime.now() + timedelta(hours=offset)).strftime("%Y-%m-%d")
    daily_pick = store.get_daily_pick(db, user_id, date_key)

    # 3. 构建提示并生成(热路径:非推理模型,保证语音场景首字延迟)
    tone = pick_tone(db, user_id, message=message)
    prompt = SYSTEM_PROMPT.format(
        tone=tone["prompt"], rule=SHARED_RULE,
        context=_context_block(portraits, memories, daily_pick),
    )
    if tone["tone"] == ANALYZE:
        victim = _victim_context(db, user_id, message)
        if victim:
            prompt += (
                f"\n\n[安全边界] 检测到用户在被伤害情境({', '.join(victim)}),"
                "本次分析不做任何归咎于用户的表述,转为共情 + 识别不健康关系 + 重建自我。"
            )
    msgs = [{"role": "system", "content": prompt}] + turns + [{"role": "user", "content": message}]
    result = client.chat(
        msgs, temperature=0.7, model=client.settings.llm_fast_model,
        tools=[item_mod.ITEM_RITUAL_TOOL, photo_mod.PHOTO_UPLOAD_TOOL],
    )

    reply = result.get("content") or ""
    tool_calls = result.get("tool_calls") or []
    tool = None
    if tool_calls:
        # 执行工具(本地去重判断)→ 回传结果 → 模型结合语气/画像写个性化文案。
        # 按 function name 分发到物品/照片两个工具,并打一个临时标记供后续组装。
        results = []
        for tc in tool_calls:
            name = (tc.get("function") or {}).get("name")
            if name == "suggest_photo_upload":
                r = photo_mod.execute_tool(db, user_id, tc)
            else:
                r = item_mod.execute_tool(db, user_id, tc)
            r["_tool"] = name
            results.append(r)
        msgs.append({"role": "assistant", "content": reply, "tool_calls": tool_calls})
        for i, (tc, r) in enumerate(zip(tool_calls, results)):
            # 剥离内部标记,保持回喂给模型的 tool 消息干净
            content = {k: v for k, v in r.items() if k != "_tool"}
            msgs.append({
                "role": "tool",
                "tool_call_id": tc.get("id") or f"call_{i}",
                "content": json.dumps(content, ensure_ascii=False),
            })
        final = client.chat(msgs, temperature=0.7, model=client.settings.llm_fast_model)
        reply = final.get("content") or reply
        # 取第一个要展示的动作(照片拍立得 或 物品纪念/寄存)
        for r in results:
            if not r.get("surface"):
                continue
            tool = (photo_mod.tool_payload([r], reply) if r.get("_tool") == "suggest_photo_upload"
                    else item_mod.tool_payload([r], reply))
            if tool:
                break

    # 规则兜底:模型漏调照片工具时(自然语境 + 高温度下常见),只要用户明确提到照片,
    # 就直接弹出上传卡片,不依赖模型触发。标题留空,前端/后端各自有默认兜底文案。
    if tool is None and _detect_photo_mention(message):
        tool = photo_mod.tool_payload([{"surface": True, "photo_title": "", "scene_description": ""}], reply)

    # 4. 异步回写记忆:抽取事实/情绪 + 落库放到后台线程,不阻塞本轮回复。
    #    情绪仍用轻量词典法即时返回给前端展示,完整抽取走后台。
    schedule_memory_write(user_id, message)
    # 同步写临时会话上下文(纯内存,下一轮立即可见,不等异步回写)
    session_context.append_turn(user_id, "user", message, session_id)
    session_context.append_turn(user_id, "assistant", reply, session_id)
    # 同步落库聊天历史(user + assistant 各一条,精确到分钟,保证历史立即可见)
    store.save_chat_turn(db, user_id, session_id, message, reply)

    return {
        "reply": reply,
        "crisis": crisis,
        "emotion": classify(message),
        "recalled": len(memories),
        "tone": tone["tone"],
        "tool": tool,
        "usage": result.get("usage"),
    }
