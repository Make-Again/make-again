"""访谈 Agent:AI 提问 → 用户回答 → AI 追问,最终生成用户画像 + 对象画像 + 疗愈计划。

对齐需求 F1-2(初始问卷轮询,含轻量心理测评)、F1-3(初始报告 + 写入 memory + 人机协同重生成)。
设计要点:
- 问题清单由若干"维度"构成,AI 在维度内动态追问,而非机械读题。
- 访谈状态持久化在 interview_sessions.state,可中断恢复。
- 每个回答经一次 LLM 调用同时产出:下一步动作 + 追问问题 + 事实 + 情绪,并写回记忆流。
- 结束时生成反馈报告,把两份画像写入 memory,并确认疗愈目标。
"""
from __future__ import annotations

import copy

from agent import async_report as async_report_mod, onboarding
from gateway.client import LLMClient
from memory import store
from memory.extract import extract_tags

MAX_FOLLOWUP_PER_DIM = 2
MAX_TURNS = 20

# 亲友离世 = 亲人 + 挚友(同龄人)离世;"family" 为早期旧值,保留映射以兼容存量数据
LOSS_TYPE_LABELS = {"breakup": "分手", "loved_one": "亲友离世", "family": "亲友离世", "pet": "宠物离世"}

# 访谈维度(问题清单)
DIMENSIONS = [
    {
        "key": "object",
        "title": "聊聊 TA",
        "question": "先跟我聊聊 TA 吧——TA 是你什么人,叫什么(昵称也可以)?",
    },
    {
        "key": "memory",
        "title": "共同的记忆",
        "question": "你们之间,有哪些让你反复想起的时刻或地方?挑一件最清晰的说说。",
    },
    {
        "key": "emotion",
        "title": "现在的情绪",
        "question": "最近哪些时刻、哪些事,最容易让你突然难过或走神?",
    },
    {
        "key": "confusion",
        "title": "放不下的事",
        "question": "现在最让你放不下、或者一直想不通的是什么?",
    },
    {
        "key": "goal",
        "title": "你的期望",
        "question": "如果让你选,你更希望的是「彻底忘记、翻篇」,还是「带着这段记忆,继续往前走」?",
    },
]

# 分手专属维度:归因素材 + 依恋线索,在「你的期望(goal)」之前插入(仅 loss_type=breakup)
BREAKUP_DIMENSIONS = [
    {
        "key": "conflict",
        "title": "走到这一步",
        "question": "你们是怎么一步步走到分手的?中间有过哪些反复的矛盾或转折?",
    },
    {
        "key": "attachment",
        "title": "相处方式",
        "question": "发生矛盾时,你们各自是怎么处理的?你更习惯主动沟通,还是先冷静?",
    },
]


def _dims_for(loss_type: str | None) -> list[dict]:
    """按 loss_type 决定访谈维度:分手在「你的期望」前插入归因/依恋两个维度。"""
    if loss_type == "breakup":
        dims = list(DIMENSIONS)
        goal_idx = next((i for i, d in enumerate(dims) if d["key"] == "goal"), len(dims) - 1)
        return dims[:goal_idx] + BREAKUP_DIMENSIONS + dims[goal_idx:]
    return list(DIMENSIONS)


STEP_SYSTEM = """你是「重逢」的访谈引导员,正在和一位经历过失去(分手/亲友离世/宠物离世)的人进行初次深度访谈。

你的目标:在温暖、不评判的对话中,慢慢了解 TA 与那个"放不下的人/宠物",梳理事情的原因、情绪波动和困惑点,最终能构成两份画像(用户画像、思念对象画像)并确认疗愈目标。

请根据用户最新一次的回答,判断下一步,只输出 JSON:
{
  "action": "followup" | "next" | "complete",
  "question": "你要说的下一句话(追问或下一个问题;action=complete 时为空字符串)",
  "next_dimension": "action=next 时要进入的下一个维度 key(必须是还没被覆盖的维度)",
  "covered_dimensions": ["本次回答实质聊到的维度 key 列表,可为空数组"],
  "facts": [{"kind": "user|object|memory|emotion_trigger|goal|confusion", "fact": "从用户的话里提炼出的一条稳定事实"}],
  "emotion": {"emotion": "难过|愤怒|内疚|回避|释怀|平静|焦虑|孤独|不甘|想念|恐惧|其他", "valence": -1到1, "arousal": 0到1, "score": 0到100},
  "goal_signal": true 或 false,
  "note": "一句你的判断依据"
}

判断规则:
1. 用户刚说的内容里,若还有值得深挖的情绪、原因、细节或具体场景,action="followup",追问一句;追问要自然、具体、承接对方刚说的话,不要机械重复问卷。
2. 只有当当前维度确实聊充分了、信息足以写进画像时,才 action="next",进入下一个还没聊过的维度;next_dimension 填那个维度的 key。宁可多追问一句,也不要急着进入下一维度——画像信息完整比速度重要。
3. 只有当关键信息足以构成画像(对象是谁、共同记忆、情绪波动、困惑点、目标)时,才 action="complete"。
4. 一次只问一个问题,语气温柔,不评判,不催促"快好起来"。
5. goal_signal 表示用户是否已明确表达了自己的疗愈目标倾向(例如"不想忘记TA""想带着记忆继续往前走""想彻底翻篇""想重新开始生活")。只有用户清楚说出"想要怎样"的方向时才设为 true;自我归咎、自我怀疑(如"是不是我太黏人""是不是我的错")只是困惑,不是目标倾向,不要设为 true。
6. 当失去类型为"分手"时,追问方向除情绪外,也要引导用户说出"冲突过程、双方各自的行为与责任、相处模式"这类归因素材;若用户是被伤害一方(被出轨/家暴/冷暴力/PUA/被抛弃),不要追问"你哪里做错了",转而共情。
7. 覆盖与跳转:用户可能在一次回答里就顺带聊到了后面几个维度的内容。但只有当用户已把某个维度聊得比较充分、信息足以写进画像时,才把它填进 covered_dimensions(这些维度之后不再重复问);只是蜻蜓点水提了一句、信息还很单薄的维度,不要标记为覆盖,之后仍要正式问一次,否则画像会缺信息。宁可多问一点,不要因为一句话就跳过整个维度。
8. 切换维度时,question 一定要承接用户上一轮说的话,自然地过渡到新话题(例如"你刚说到……我还想再听听……"),不要生硬地照搬问卷原题。
9. 边界处理:用户表示"暂时忘了/记不清/不想说/不方便回答"时,尊重 TA,不要反复追问这一维度,action="next" 进入下一维度,并把该维度放进 covered_dimensions(之后不再回头问);用户答非所问(说了与当前问题无关的内容)时,不要丢掉 TA 的话,温和地把话题拉回当前问题(action="followup"),同时把 TA 话里真实涉及到的维度记进 covered_dimensions 或 facts,不要浪费信息。
注意:直接输出 JSON 对象本身,不要输出思考过程或 JSON 之外的文字。"""

REPORT_SYSTEM = """你是「重逢」的访谈分析师。基于下面的访谈对话,生成一份温柔的反馈报告,并构建两份画像和疗愈计划。只输出 JSON:
{
  "title": "一句有记忆点的标题,凝练这个人和这段失去的核心,温柔有力量,不超过20字,不要复述摘要",
  "keywords": ["3-5个短词,提炼这个人的核心特质,如'细腻''念旧''有韧性'"],
  "summary": "反馈报告正文(150-300字),写给用户,温柔有共情,总结你听到的故事与情绪脉络,并点出一个具体的记忆画面(记忆点)",
  "quote": "一句可直接当作金句的话,温柔、凝练、有记忆点,是整份报告的题眼,不超过30字",
  "user_portrait": {"失去类型":"...","关系与背景":"...","当前情绪状态":"...","情绪波动点":"...","困惑点":"...","未说出口的话":"..."},
  "object_portrait": {"称呼":"...","关系":"...","性格":"...","共同记忆":"...","重要地点与时间":"..."},
  "goal": {"type": "forget|carry_on|uncertain", "label": "忘记 / 带着记忆走下去 / 还没想清楚", "reason": "..."},
  "heal_plan": {"summary":"一句话目标","stages":[{"title":"...","desc":"...","time":"..."}]}
}
要求:忠实于对话内容,不编造;语气温柔;如果某条信息不足,字段写"暂未提及"。
注意:直接输出 JSON 对象本身,不要输出思考过程、解释或 JSON 之外的任何文字。"""


REPORT_SYSTEM_BREAKUP = """你是「重逢」的访谈分析师。基于下面的访谈对话,为一位经历过"分手"的用户生成一份温柔的反馈报告,并构建两份画像、疗愈计划与一段关系复盘。只输出 JSON:
{
  "title": "一句有记忆点的标题,凝练这个人和这段关系,温柔有力量,不超过20字,不要复述摘要",
  "keywords": ["3-5个短词,提炼这个人的核心特质或这段关系的关键,如'付出型''委屈''慢慢释怀'"],
  "summary": "反馈报告正文(150-300字),写给用户,温柔有共情,总结你听到的故事与情绪脉络,并点出一个具体的记忆画面(记忆点)",
  "quote": "一句可直接当作金句的话,温柔、凝练、有记忆点,是整份报告的题眼,不超过30字",
  "user_portrait": {
    "失去类型":"...", "关系与背景":"...", "当前情绪状态":"...", "情绪波动点":"...", "困惑点":"...", "未说出口的话":"...",
    "依恋类型":"安全型|焦虑型|回避型|恐惧型(矛盾型)|暂未提及",
    "关系中的模式":"用户在关系里反复出现的相处模式",
    "自身盲区":"用户自己可改变、对事不对人的部分",
    "可成长方向":"下一段关系里能做得更好的方向",
    "关系症结":"一句话概括这段关系走到分手的主因"
  },
  "object_portrait": {
    "称呼":"...", "关系":"...", "性格":"...", "共同记忆":"...", "重要地点与时间":"...",
    "TA的行为模式":"TA在关系里反复出现的行为方式",
    "TA的依恋倾向":"安全型|焦虑型|回避型|恐惧型(矛盾型)|暂未提及",
    "TA在关系中的问题":"TA在关系里存在的问题"
  },
  "goal": {"type": "forget|carry_on|uncertain", "label": "忘记 / 带着记忆走下去 / 还没想清楚", "reason": "..."},
  "heal_plan": {"summary":"一句话目标","stages":[{"title":"...","desc":"...","time":"..."}]},
  "relationship_analysis": {
    "attachment": {"user":"用户的依恋类型","basis":"从对话里找出的依据","other":"TA的依恋类型","other_basis":"TA的依据"},
    "causes": [{"factor":"一个具体原因","side":"自己|对方|双方|外部","explain":"一句话解释"}],
    "patterns": "一句话概括两人的互动模式",
    "blind_spots": ["用户可改变、对事不对人的盲区"],
    "suggestions": ["判断这段关系 / 自我成长的可操作建议"],
    "narrative": "一段100-180字、直接写给用户的关系复盘,用分析口吻:聚焦相处模式差异、分手归因、你能成长的方向;不要复述故事、不要再次描写共同记忆、不要以'TA的名字'开场回顾关系背景"
  }
}
要求:
1. 忠实于对话内容,不编造;信息不足的字段写"暂未提及"。
2. 分手复盘必须平衡归因:原因覆盖"自己可改变的部分/对方的部分/双方/外部因素",不单方归咎用户。
3. 若用户在关系中被伤害(被出轨/家暴/冷暴力/PUA/被抛弃),不要归咎用户,转为"这不是你的错 + 识别不健康关系 + 自我重建"。
4. 依恋类型是描述性框架(如"回避型依恋倾向"),不下心理疾病诊断;不评判用户情绪。
5. narrative 是直接写给用户的关系复盘正文(150-300字):语气温暖、连贯、像朋友轻轻帮TA回看这段关系,把依恋倾向、分手原因、互动模式、建议自然揉成一段话;不要分条罗列,不要出现"自己/对方/双方"这类标签式表述;平衡归因、不指责,受害者场景不归咎。
6. summary 与 narrative 职责不同,且都会被展示:summary 是情绪正文,侧重"看见你的情绪 + 点出一个具体的记忆画面";narrative 是关系复盘,侧重"相处模式差异 + 分手归因 + 成长方向"。narrative 必须用分析口吻,绝不能复述 summary 已写过的故事、记忆画面或情绪细节,也不要再用称呼开场回顾关系背景。
注意:直接输出 JSON 对象本身,不要输出思考过程、解释或 JSON 之外的任何文字。"""


def _report_system(loss_type: str | None) -> str:
    return REPORT_SYSTEM_BREAKUP if loss_type == "breakup" else REPORT_SYSTEM


def _fmt_relationship_analysis(ra: dict) -> str:
    """把关系复盘压成一段可召回/可展示的文本:优先用 LLM 写好的温暖 narrative,兜底用模板串成连贯段落(不做分列罗列)。"""
    narrative = (ra.get("narrative") or "").strip()
    if narrative:
        return narrative

    parts: list[str] = []
    att = ra.get("attachment") or {}
    user_att, other_att = att.get("user"), att.get("other")
    if user_att and user_att != "暂未提及" and other_att and other_att != "暂未提及":
        parts.append(f"你更偏「{user_att}」的相处方式,TA 更偏「{other_att}」")
    elif user_att and user_att != "暂未提及":
        parts.append(f"你的依恋倾向更偏「{user_att}」")

    cause_txt = "、".join(
        f"{c.get('factor')}" + (f"({c.get('explain')})" if c.get("explain") else "")
        for c in (ra.get("causes") or [])
        if isinstance(c, dict) and c.get("factor") and c.get("factor") != "暂未提及"
    )
    if cause_txt:
        parts.append(f"走到分手,更多在于 {cause_txt}")

    if ra.get("patterns") and ra["patterns"] != "暂未提及":
        parts.append(f"你们之间是「{ra['patterns']}」的相处模式")

    sugg = [str(s) for s in (ra.get("suggestions") or []) if s and str(s) != "暂未提及"]
    if sugg:
        parts.append("往后可以试着" + "、".join(sugg))

    if not parts:
        return ""
    return "。".join(parts) + "。"


def questions() -> list[dict]:
    return [{"key": d["key"], "title": d["title"], "question": d["question"]} for d in DIMENSIONS]


def start(db, user_id: str, loss_type: str, question_key: str | None = None) -> dict:
    store.get_or_create_user(db, user_id, loss_type=loss_type)
    # 首次进入才推进到「访谈中」;已进入过(中断恢复/已完成)不再回退阶段。
    if onboarding.get_phase(db, user_id) == "new":
        onboarding.set_phase(db, user_id, "interview")

    dims = _dims_for(loss_type)
    dim_idx = 0
    if question_key:
        for i, d in enumerate(dims):
            if d["key"] == question_key:
                dim_idx = i
                break

    first_q = dims[dim_idx]["question"]
    state = {
        "dimension_idx": dim_idx,
        "followup_count": 0,
        "asked": [first_q],
        "covered": [],
        "facts": [],
        "history": [{"role": "assistant", "content": first_q}],
        "done": False,
        "report": None,
    }
    session = store.create_interview(db, user_id, loss_type, state)
    return {"session_id": session.id, "question": first_q, "loss_type": loss_type}


def answer(db, session_id: str, user_answer: str, client: LLMClient, async_report: bool = False) -> dict:
    session = store.get_interview(db, session_id)
    if session is None:
        raise ValueError("session not found")
    state = copy.deepcopy(session.state or {})
    if state.get("done"):
        return {"action": "done", "report": state.get("report")}

    state.setdefault("history", []).append({"role": "user", "content": user_answer})

    dims = _dims_for(session.loss_type)
    step = _decide_step(client, session.loss_type, dims, state, user_answer)

    action = step.get("action")
    if action not in ("followup", "next", "complete"):
        action = "followup"

    question = step.get("question") or ""
    facts = step.get("facts") if isinstance(step.get("facts"), list) else []
    emotion = _normalize_emotion(step.get("emotion"))

    # 写回记忆流(访谈本身也是一种倾诉)
    place_tag, time_tag = extract_tags(user_answer)
    store.add_memory(
        db, session.user_id, type="interview", content=user_answer,
        summary=user_answer[:120], facts=facts, emotion=emotion, importance=6.0,
        place_tag=place_tag, time_tag=time_tag,
    )
    for f in facts:
        if isinstance(f, dict):
            state.setdefault("facts", []).append(f)

    # 覆盖追踪:当前维度问过即算覆盖,再合并 LLM 判定本次回答顺带聊到的维度,
    # 避免后面再重复问用户已经说过的事。
    covered = list(dict.fromkeys(state.get("covered", [])))
    cur_key = dims[state["dimension_idx"]]["key"]
    if cur_key not in covered:
        covered.append(cur_key)
    for k in (step.get("covered_dimensions") or []):
        if isinstance(k, str) and k not in covered:
            covered.append(k)
    state["covered"] = covered

    goal_idx = len(dims) - 1
    goal_key = dims[goal_idx]["key"]

    # 目标早期识别:用户已明确表达疗愈目标倾向(goal_signal=true)且目标维度还没聊过时,
    # 直接跳到目标维度做一次确认,不再把剩余维度走完。
    jumped_to_goal = False
    if bool(step.get("goal_signal")) and state["dimension_idx"] < goal_idx and goal_key not in covered:
        state["dimension_idx"] = goal_idx
        state["followup_count"] = 0
        action = "next"
        question = dims[goal_idx]["question"]
        jumped_to_goal = True

    # 追问次数保护
    if action == "followup" and state["followup_count"] >= MAX_FOLLOWUP_PER_DIM:
        action = "next"

    # 最后一个维度(目标)不再追问:用户确认疗愈目标后立即收尾生成报告,
    # 避免在"要不要写点纪念"这类延伸话题上继续拖延,影响用户获得反馈的节奏。
    if action == "followup" and state["dimension_idx"] == goal_idx:
        action = "complete"

    turns = len([h for h in state["history"] if h["role"] == "user"])
    if turns >= MAX_TURNS:
        action = "complete"

    if action == "followup":
        state["followup_count"] += 1
    elif jumped_to_goal:
        # 刚跳到目标维度:本轮先问出目标确认问题,下一轮用户回答后再收尾。
        pass
    elif action == "next":
        # 进入下一个还没被覆盖的维度,用 LLM 承接上下文写好的过渡问题(缺省才退回问卷原题)
        next_idx, next_q = _resolve_next(dims, covered, step, state["dimension_idx"])
        if next_idx is not None:
            state["dimension_idx"] = next_idx
            state["followup_count"] = 0
            question = next_q
        else:
            action = "complete"

    if action == "complete":
        if async_report:
            # 报告生成放到后台:立即标记完成、推进阶段并返回,前端轮询 report_ready。
            state["done"] = True
            state["generating"] = True
            state["report"] = None
            state["report_ready"] = False
            store.update_interview(db, session, state=state, status="completed")
            onboarding.set_phase(db, session.user_id, "report")
            async_report_mod.schedule_report(
                session.user_id, session.id, session.loss_type, copy.deepcopy(state["history"])
            )
            return {"action": "complete", "done": True, "generating": True}

        report = _generate_report(db, client, session, state)
        state["done"] = True
        state["report"] = report
        state["report_ready"] = True
        store.update_interview(db, session, state=state, status="completed")
        onboarding.set_phase(db, session.user_id, "report")
        return {"action": "complete", "report": report}

    state["asked"].append(question)
    state["history"].append({"role": "assistant", "content": question})
    store.update_interview(db, session, state=state)
    return {
        "action": action,
        "question": question,
        "dimension": dims[state["dimension_idx"]]["title"],
        "emotion": emotion,
    }


def revise(db, session_id: str, supplement: str, client: LLMClient) -> dict:
    """人机协同:用户补充叙述后重新生成报告。"""
    session = store.get_interview(db, session_id)
    if session is None:
        raise ValueError("session not found")
    state = copy.deepcopy(session.state or {})
    state.setdefault("history", []).append({"role": "user", "content": f"[补充] {supplement}"})
    report = _generate_report(db, client, session, state)
    state["report"] = report
    store.update_interview(db, session, state=state)
    return report


def _decide_step(client: LLMClient, loss_type: str | None, dims: list[dict], state: dict, user_answer: str) -> dict:
    dim = dims[state["dimension_idx"]]
    recent = "\n".join(f"{h['role']}: {h['content'][:100]}" for h in state.get("history", [])[-6:])
    dim_lines = "\n".join(f"- {d['key']}({d['title']}): {d['question']}" for d in dims)
    messages = [
        {"role": "system", "content": STEP_SYSTEM},
        {"role": "user", "content": (
            f"失去类型:{loss_type or '未知'}\n"
            f"访谈维度清单(按顺序):\n{dim_lines}\n"
            f"当前维度:{dim['title']}(key={dim['key']})\n"
            f"本维度已追问次数:{state.get('followup_count', 0)}(最多 {MAX_FOLLOWUP_PER_DIM} 次)\n"
            f"已覆盖维度:{state.get('covered', []) or '无'}\n"
            f"已问过的问题:{state.get('asked', [])}\n\n"
            f"最近对话:\n{recent}\n\n"
            f"用户最新回答:\n{user_answer}"
        )},
    ]
    parsed, _ = client.chat_json(messages, temperature=0.6, model=client.settings.llm_fast_model)
    if not parsed:
        return {"action": "followup", "question": "", "facts": [], "emotion": {}, "note": "解析失败兜底"}
    return parsed


def _resolve_next(dims: list[dict], covered: list[str], step: dict, current_idx: int) -> tuple[int | None, str]:
    """决定下一个要进入的维度并给出问题文案。

    优先采用 LLM 建议的、未覆盖的维度(用 LLM 承接上下文写好的过渡问题);
    否则顺序找 current_idx 之后第一个未覆盖维度(退回问卷原题,因 LLM 的问题未必对应这个维度)。
    """
    suggested = step.get("next_dimension")
    llm_q = (step.get("question") or "").strip()
    if isinstance(suggested, str) and suggested:
        for i, d in enumerate(dims):
            if d["key"] == suggested and d["key"] not in covered:
                return i, (llm_q or d["question"])
    for i in range(current_idx + 1, len(dims)):
        if dims[i]["key"] not in covered:
            return i, dims[i]["question"]
    return None, ""


def _build_report_parsed(client: LLMClient, loss_type: str | None, history: list[dict]) -> dict:
    """生成报告 JSON(纯 LLM 调用,无 DB 副作用),供同步 / 后台两路复用。"""
    conv = "\n".join(f"{h['role']}: {h['content']}" for h in (history or []))
    messages = [
        {"role": "system", "content": _report_system(loss_type)},
        {"role": "user", "content": f"失去类型:{LOSS_TYPE_LABELS.get(loss_type, loss_type or '未知')}\n\n访谈对话:\n{conv}"},
    ]
    # 报告走热路径快模型(默认),时延优先;要更高分析质量时,在 .env 把 llm_report_model 设为 llm_model。
    model = client.settings.llm_report_model or client.settings.llm_fast_model
    parsed, meta = client.chat_json(messages, temperature=0.5, max_tokens=4000, model=model)
    if not parsed:
        # 输出可能被截断或格式错误,再试一次
        messages.append({"role": "user", "content": "请只输出一个完整、合法的 JSON 对象,不要任何其他文字。"})
        parsed, _ = client.chat_json(messages, temperature=0.3, max_tokens=4000, model=model)
    if not parsed:
        parsed = _fallback_report({}, loss_type)
    return parsed


def _persist_report(db, user_id: str, loss_type: str | None, parsed: dict) -> None:
    """报告落库:画像 + 记忆流 + 看板(reports 表)。"""
    user_portrait = parsed.get("user_portrait") or {}
    object_portrait = parsed.get("object_portrait") or {}

    # 分手:把关系复盘压成温暖连贯的一段,同时进画像(供跟踪报告/后续展示)与记忆流(供聊天召回)
    ra_text = ""
    if loss_type == "breakup" and parsed.get("relationship_analysis"):
        ra_text = _fmt_relationship_analysis(parsed["relationship_analysis"])
        if ra_text:
            user_portrait["关系复盘"] = ra_text

    store.upsert_portrait(db, user_id, "user", user_portrait, status="draft")
    store.upsert_portrait(db, user_id, "object", object_portrait, status="draft")
    store.add_memory(
        db, user_id, type="report", content=parsed.get("summary", ""),
        summary=(parsed.get("summary") or "")[:120], facts=[], emotion=None, importance=9.0,
    )
    if ra_text:
        store.add_memory(
            db, user_id, type="report", content=ra_text, summary=ra_text[:120],
            facts=[], emotion=None, importance=8.0,
        )
    store.save_report(db, user_id, "initial", parsed)


def _generate_report(db, client: LLMClient, session, state: dict) -> dict:
    parsed = _build_report_parsed(client, session.loss_type, state.get("history", []))
    _persist_report(db, session.user_id, session.loss_type, parsed)
    return parsed


def progress(session) -> dict:
    """访谈对外状态视图:进度 / 当前维度 / 报告是否就绪,供前端轮询展示。"""
    state = session.state or {}
    dims = _dims_for(session.loss_type)
    idx = state.get("dimension_idx", 0)
    cur = dims[idx] if 0 <= idx < len(dims) else {}
    history = state.get("history", [])
    question = next(
        (h.get("content", "") for h in reversed(history) if h.get("role") == "assistant"), ""
    )
    report_ready = bool(state.get("report_ready"))
    done = bool(state.get("done")) or session.status == "completed"
    return {
        "session_id": session.id,
        "user_id": session.user_id,
        "status": session.status,
        "done": done,
        "generating": bool(state.get("generating")) and not report_ready,
        "report_ready": report_ready,
        "question": question,
        "dimension": cur.get("title"),
        "dimension_key": cur.get("key"),
        "progress": {"covered": len(state.get("covered", [])), "total": len(dims)},
    }


def _normalize_emotion(e: dict | None) -> dict:
    e = e or {}
    emo = e.get("emotion") or "其他"
    try:
        valence = max(-1.0, min(1.0, float(e.get("valence", 0.0))))
        arousal = max(0.0, min(1.0, float(e.get("arousal", 0.5))))
        score = max(0, min(100, int(e.get("score", 50))))
    except (TypeError, ValueError):
        valence, arousal, score = 0.0, 0.5, 50
    return {"emotion": emo, "valence": valence, "arousal": arousal, "score": score}


def _fallback_report(state: dict, loss_type: str | None = None) -> dict:
    report = {
        "title": "谢谢你愿意说出来",
        "keywords": ["温柔", "诚实"],
        "summary": "谢谢你愿意把这些告诉我。我们已经一起梳理了这段关系的脉络,接下来会陪你慢慢往前走。",
        "quote": "慢慢来,也算在往前走",
        "user_portrait": {"失去类型": "暂未提及", "关系与背景": "暂未提及", "当前情绪状态": "暂未提及",
                          "情绪波动点": "暂未提及", "困惑点": "暂未提及", "未说出口的话": "暂未提及"},
        "object_portrait": {"称呼": "暂未提及", "关系": "暂未提及", "性格": "暂未提及",
                            "共同记忆": "暂未提及", "重要地点与时间": "暂未提及"},
        "goal": {"type": "uncertain", "label": "还没想清楚", "reason": "需要进一步对话"},
        "heal_plan": {"summary": "先稳定情绪,再逐步明确方向",
                      "stages": [{"title": "照顾好当下", "desc": "先保证睡眠和饮食", "time": "本周"}]},
    }
    if loss_type == "breakup":
        report["user_portrait"].update({
            "依恋类型": "暂未提及", "关系中的模式": "暂未提及",
            "自身盲区": "暂未提及", "可成长方向": "暂未提及", "关系症结": "暂未提及",
        })
        report["object_portrait"].update({
            "TA的行为模式": "暂未提及", "TA的依恋倾向": "暂未提及", "TA在关系中的问题": "暂未提及",
        })
        report["relationship_analysis"] = {
            "attachment": {"user": "暂未提及", "basis": "", "other": "暂未提及", "other_basis": ""},
            "causes": [], "patterns": "暂未提及", "blind_spots": [], "suggestions": [],
        }
    return report
