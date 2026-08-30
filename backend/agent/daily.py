"""每日主题 + 启发文案(F2-2 日常陪伴的开场):个性化推荐主题,附一句简短的总开场文案。

设计要点:
- 主题选择零 LLM:从疗愈主题库按 loss_type + 语气路由(tone)规则打分,返回 top N,并按日期轻微轮换避免天天一样。
- 启发文案零 LLM、纯模板:取今日推荐主题的前两个,拼成一句简短文案(把两个主题都带进去),给用户两个可选方向,不强制选一个。
- 依据心情体现在「选哪两个主题」:get_themes 已按语气/主导情绪路由打分,文案本身只是短句拼接。
- 文案落 DailyPick(同一 user+date_key 幂等覆盖),供陪伴 Agent 注入当天上下文。
"""
from __future__ import annotations

from datetime import datetime, timedelta

from config import get_settings
from emotion.tone import GUIDE, SOOTHE, pick_tone
from memory import store

# 疗愈主题库(固定池;desc/hint 都往"往前走"收,而不是反复咀嚼失去)
THEMES = [
    {"key": "memory", "title": "最近总想起的那些", "desc": "想起TA的时候,有难过,也有还温热的部分",
     "hint": "引导用户从回忆里提炼温暖与力量,把落点放在'这段经历带给你的好',而不是停留在遗憾与缺失"},
    {"key": "farewell", "title": "没说完的话", "desc": "有些话当时没来得及说,可以在这里轻轻说出来",
     "hint": "帮助用户说出未说的话并温柔收束:说出口 → 慢慢放下,而非反复咀嚼离别场景"},
    {"key": "selfcare", "title": "对自己好一点", "desc": "今天为自己做一件温柔的小事",
     "hint": "把注意力引向照顾自己:睡好、吃好、做一件让自己舒服的小事"},
    {"key": "newlife", "title": "接下来的日子", "desc": "带着这些记忆,慢慢往前走的样子",
     "hint": "引导用户想象并描述'带着记忆继续生活'的具体样子,给希望与方向"},
    {"key": "letter", "title": "想对TA说的话", "desc": "写一段想对TA说的话,然后回到自己",
     "hint": "邀请用户写一段想对TA说的话,并在结尾轻轻带向'写完后,回到自己'"},
    {"key": "gratitude", "title": "记得那些好", "desc": "这段关系曾给过你的好,值得被记住",
     "hint": "引导用户回忆这段关系带来的美好与成长,而不是失去本身"},
    {"key": "anniversary", "title": "特别的日子", "desc": "某个特别的日子,用一个小仪式好好纪念",
     "hint": "引导用户用一个温暖的小仪式去纪念,把悲伤转化为有温度的怀念"},
    # 分手专属:旁观者归因 + 自我觉察(仅 loss_type=breakup 进入推荐池)
    {"key": "insight", "title": "看懂这段关系", "desc": "站在旁观者的角度,看清这段关系",
     "loss": ["breakup"],
     "hint": "引导用户客观复盘关系为什么走到这一步:既看到对方的部分,也温柔点出自己可改变的部分,用去指责化的语言,落点在'看懂与成长'而非反复指责"},
    {"key": "growth", "title": "我在关系里的样子", "desc": "从这段关系里,看见自己的相处模式",
     "loss": ["breakup"],
     "hint": "引导用户觉察自己在关系里的依恋倾向与相处模式(如回避、焦虑、迁就),把落点放在'更好地认识自己、下一段关系更从容'"},
]

# 按语气路由的推荐加权:安抚型 → 关怀与表达;引导型 → 继续生活与感恩
_BOOST = {
    SOOTHE: {"selfcare": 2.0, "letter": 2.0, "gratitude": 2.0, "newlife": 1.0},
    GUIDE: {"newlife": 2.0, "gratitude": 2.0, "farewell": 2.0, "selfcare": 0.5,
            "insight": 1.5, "growth": 1.5},
}

def _today_key(now: datetime | None = None) -> str:
    s = get_settings()
    base = now or datetime.now().replace(microsecond=0)
    local = base + timedelta(hours=s.timezone_offset_hours)
    return local.strftime("%Y-%m-%d")


def _dominant_emotion(db, user_id: str) -> str | None:
    nodes = store.list_emotion_nodes(db, user_id)
    return nodes[0].emotion if nodes else None


def _score_theme(theme: dict, loss_type: str | None, tone: str) -> float:
    s = 1.0  # 基础分,保证都有机会
    loss = theme.get("loss")
    if not loss or (loss_type and loss_type in loss):
        s += 0.5
    s += _BOOST.get(tone, {}).get(theme["key"], 0.0)
    return s


def get_themes(db, user_id: str, now: datetime | None = None) -> dict:
    """返回今天个性化推荐的若干主题(零 LLM,语气路由 + 每日轻微轮换)。"""
    store.get_or_create_user(db, user_id)
    tone = pick_tone(db, user_id)
    loss_type = store.effective_loss_type(db, user_id)

    pool_themes = [t for t in THEMES if not t.get("loss") or (loss_type and loss_type in t["loss"])]
    ranked = sorted(pool_themes, key=lambda t: _score_theme(t, loss_type, tone["tone"]), reverse=True)
    count = get_settings().daily_theme_count

    # 在推荐带里按日期轻微轮换,避免连续几天完全相同
    pool = ranked[:min(len(ranked), count + 2)]
    seed = int(_today_key(now)[-2:])
    k = seed % len(pool)
    pool = pool[k:] + pool[:k]
    themes = [{"key": t["key"], "title": t["title"], "desc": t["desc"]} for t in pool[:count]]

    reason = (
        "最近你可能需要一点安慰,这几个主题轻轻陪你。"
        if tone["tone"] == SOOTHE
        else "看你最近状态稳一些了,这几个主题帮你再往前走走。"
    )
    return {"themes": themes, "reason": reason, "tone": tone["tone"]}


def _opening_text(themes: list[dict]) -> str:
    """一句简短文案:把两个主题都带进去,给用户两个可选方向(不强制选一个)。"""
    t1 = themes[0]["title"] if len(themes) > 0 else "想聊的事"
    t2 = themes[1]["title"] if len(themes) > 1 else "现在的心情"
    return f"今天想聊聊「{t1}」,还是「{t2}」?"


def _pick_two_themes(db, user_id: str, now: datetime | None = None) -> list[dict]:
    """取今日推荐主题的前两个(与 get_themes 同源、同日一致),供启发文案引用。"""
    return get_themes(db, user_id, now=now)["themes"][:2]


def generate_opening(db, user_id: str, now: datetime | None = None) -> dict:
    """生成今日启发文案:一句简短文案,把今日推荐主题的前两个都带进去(零 LLM、纯模板)。

    依据心情体现在「选哪两个主题」(get_themes 已按语气/主导情绪路由打分),文案本身只是短句拼接。
    返回 {opening, themes, mood, tone};当天已生成过则直接复用(每日一次)。
    """
    store.get_or_create_user(db, user_id)
    tone = pick_tone(db, user_id)
    date_key = _today_key(now)

    existing = store.get_daily_pick(db, user_id, date_key)
    if existing is not None and existing.opening:
        return {"opening": existing.opening, "themes": _pick_two_themes(db, user_id, now),
                "mood": _dominant_emotion(db, user_id), "tone": tone["tone"], "cached": True}

    mood = _dominant_emotion(db, user_id)
    themes = _pick_two_themes(db, user_id, now)
    opening = _opening_text(themes)

    store.upsert_daily_pick(db, user_id, date_key, "", "", opening)

    return {"opening": opening, "themes": themes, "mood": mood, "tone": tone["tone"]}
