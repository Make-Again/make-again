"""HTTP 路由。"""
from __future__ import annotations

import os
from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from agent import companion, daily as daily_mod, ending as ending_mod, history as history_mod, history_summary, home as home_mod, interview as interview_mod, item as item_mod, nudge as nudge_mod, onboarding as onboarding_mod, photo as photo_mod, relationship as relationship_mod, report as report_mod, treehole as treehole_mod, weekly as weekly_mod
from config import get_settings
from emotion.classifier import classify
from gateway.client import LLMClient
from gateway.speech import SpeechClient, SpeechError
from gateway.storage import ObjectStore, StorageError
from gateway.vision import VisionClient
from memory import calendar as calendar_mod
from memory import reflect as reflect_mod
from memory import session_context
from memory import store
from memory.db import get_session
from memory.models import UserState, utcnow
from auth import get_current_user, hash_password, new_expiry, new_token, verify_password

router = APIRouter(prefix="/api")


class ChatReq(BaseModel):
    user_id: str
    message: str
    session_id: str | None = None  # 会话标识;缺省回落默认会话,多端/多会话时由客户端生成并传入


class ChatResp(BaseModel):
    reply: str
    crisis: dict
    emotion: dict | None
    recalled: int
    tone: str | None = None  # soothe | guide | analyze(仅分手场景)
    tool: dict | None = None  # 物品纪念/寄存动作(无则 None),前端据此展示上传卡片


@router.post("/chat", response_model=ChatResp)
def chat(req: ChatReq, db: Session = Depends(get_session)):
    store.get_or_create_user(db, req.user_id)
    return companion.chat(db, req.user_id, req.message, LLMClient(), session_id=req.session_id)


class ChatClearReq(BaseModel):
    user_id: str
    session_id: str | None = None  # 缺省回落默认会话


@router.post("/chat/session/clear")
def chat_session_clear(req: ChatClearReq, db: Session = Depends(get_session)):
    """用户退出 / 关闭某段对话时调用:清空临时上下文 + 后台写今天的总结草稿(无感)。"""
    session_context.clear_turns(req.user_id, req.session_id)
    history_summary.schedule(req.user_id, history_summary.today_key(), "draft")
    return {"ok": True}


# ---- 聊天历史(精确到分钟,游标分页) ----

@router.get("/chat/history/{user_id}")
def chat_history(user_id: str, before_id: int | None = None, after_id: int | None = None,
                 date: str | None = None, limit: int | None = None,
                 db: Session = Depends(get_session)):
    """聊天历史分页:上滑加载更早(before_id)、下滑加载更新(after_id)、跳转到某天第一条(date)。"""
    store.get_or_create_user(db, user_id)
    try:
        return history_mod.page(db, user_id, before_id=before_id, after_id=after_id,
                                date=date, limit=limit)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/chat/history/{user_id}/days")
def chat_history_days(user_id: str, db: Session = Depends(get_session)):
    """聊天记录一级页:每天的总结列表(打开时惰性固定「昨日及之前」的草稿)。"""
    store.get_or_create_user(db, user_id)
    return history_mod.day_list(db, user_id)


@router.get("/chat/history/{user_id}/day/{date}")
def chat_history_day(user_id: str, date: str, before_id: int | None = None,
                     after_id: int | None = None, limit: int | None = None,
                     db: Session = Depends(get_session)):
    """聊天记录二级页:某天的内容分页(当天内上滑加载更早)。"""
    store.get_or_create_user(db, user_id)
    try:
        return history_mod.day_page(db, user_id, date,
                                    before_id=before_id, after_id=after_id, limit=limit)
    except ValueError as e:
        raise HTTPException(400, str(e))


class ChatHistoryDeleteReq(BaseModel):
    message_ids: list[int]


@router.post("/chat/history/{user_id}/delete")
def chat_history_delete(user_id: str, req: ChatHistoryDeleteReq, db: Session = Depends(get_session)):
    """批量删除本人聊天消息,返回实际删除条数。"""
    return history_mod.delete_many(db, user_id, req.message_ids)


@router.get("/portraits/{user_id}")
def get_portraits(user_id: str, db: Session = Depends(get_session)):
    return {
        "user": store.get_portrait(db, user_id, "user"),
        "object": store.get_portrait(db, user_id, "object"),
    }


@router.post("/portraits/{user_id}")
def set_portrait(user_id: str, kind: str, content: dict, db: Session = Depends(get_session)):
    store.get_or_create_user(db, user_id)
    store.upsert_portrait(db, user_id, kind, content)
    return {"ok": True}


@router.post("/reflect/{user_id}")
def reflect(user_id: str, db: Session = Depends(get_session)):
    return reflect_mod.reflect(db, user_id)


@router.get("/nudges/{user_id}")
def get_nudges(user_id: str, db: Session = Depends(get_session)):
    return nudge_mod.get_nudges(db, user_id, LLMClient())


# ---- 每日主题 + 启发文案 ----

@router.get("/daily/themes/{user_id}")
def daily_themes(user_id: str, db: Session = Depends(get_session)):
    return daily_mod.get_themes(db, user_id)


class DailyOpeningReq(BaseModel):
    user_id: str


@router.post("/daily/opening")
def daily_opening(req: DailyOpeningReq, db: Session = Depends(get_session)):
    """生成今日启发文案(依据心情,不绑定具体主题、不调用记忆细节)。"""
    return daily_mod.generate_opening(db, req.user_id)


# ---- 情绪日历 ----

@router.get("/calendar/{user_id}")
def calendar(user_id: str, month: str | None = None, db: Session = Depends(get_session)):
    return calendar_mod.get_calendar(db, user_id, month)


# ---- 语音(TTS / ASR / 上传) ----


def _external(call):
    """调用外部服务,把 StorageError / SpeechError 归一为 502。"""
    try:
        return call()
    except (SpeechError, StorageError) as e:
        raise HTTPException(502, str(e))


class TTSReq(BaseModel):
    text: str
    voice_id: str | None = None
    speed: float = 1.0
    vol: float = 1.0
    pitch: float = 0.0


class ASRReq(BaseModel):
    input_url: str


@router.post("/speech/tts")
def speech_tts(req: TTSReq):
    return _external(lambda: SpeechClient().tts(
        req.text, voice_id=req.voice_id, speed=req.speed, vol=req.vol, pitch=req.pitch))


@router.post("/speech/transcribe")
def speech_transcribe(req: ASRReq):
    return _external(lambda: SpeechClient().transcribe(req.input_url))


@router.post("/speech/upload")
def speech_upload(file: UploadFile = File(...)):
    data = file.file.read()
    if not data:
        raise HTTPException(400, "空文件")
    s = get_settings()
    if len(data) > s.speech_max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"音频超过 {s.speech_max_upload_mb}MB 上限")
    key = f"{uuid4().hex}{os.path.splitext(file.filename or '')[1] or '.m4a'}"
    store = ObjectStore()
    full_key = _external(lambda: store.upload(key, data, content_type=file.content_type or "application/octet-stream"))
    url = _external(lambda: store.presigned_url(full_key))
    return {"key": full_key, "url": url, "backend": store.backend}


@router.post("/speech/recognize")
def speech_recognize(file: UploadFile = File(...)):
    data = file.file.read()
    if not data:
        raise HTTPException(400, "空文件")
    s = get_settings()
    if len(data) > s.speech_max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"音频超过 {s.speech_max_upload_mb}MB 上限")
    key = f"{uuid4().hex}{os.path.splitext(file.filename or '')[1] or '.m4a'}"
    store = ObjectStore()
    full_key = _external(lambda: store.upload(key, data, content_type=file.content_type or "application/octet-stream"))
    url = _external(lambda: store.presigned_url(full_key))
    return _external(lambda: SpeechClient().transcribe(url))


# ---- 物品纪念/寄存(聊天工具的上传落库) ----

@router.post("/item/upload")
def item_upload(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    intent: str = Form(...),
    item_name: str = Form(""),
    description: str = Form(""),
    db: Session = Depends(get_session),
):
    data = file.file.read()
    if not data:
        raise HTTPException(400, "空文件")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(400, "仅支持图片")
    s = get_settings()
    if len(data) > s.item_max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"图片超过 {s.item_max_upload_mb}MB 上限")
    store.get_or_create_user(db, user_id)
    return _external(lambda: item_mod.handle_upload(
        db, user_id, data, item_name.strip(), intent.strip(),
        description.strip(), LLMClient(), VisionClient(), ObjectStore(),
    ))


@router.get("/item/{user_id}")
def item_list(user_id: str, db: Session = Depends(get_session)):
    """看板:用户所有物品(抠图预签名 URL + 描述)。"""
    store.get_or_create_user(db, user_id)
    return {"items": item_mod.list_items(db, user_id)}


# ---- 场景照片(拍立得,聊天工具的上传落库) ----

@router.post("/photo/upload")
def photo_upload(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    title: str = Form(""),
    description: str = Form(""),
    db: Session = Depends(get_session),
):
    data = file.file.read()
    if not data:
        raise HTTPException(400, "空文件")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(400, "仅支持图片")
    s = get_settings()
    if len(data) > s.item_max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"图片超过 {s.item_max_upload_mb}MB 上限")
    store.get_or_create_user(db, user_id)
    return _external(lambda: photo_mod.handle_upload(
        db, user_id, data, title.strip(), description.strip(),
        content_type=file.content_type, obj_store=ObjectStore(),
    ))


@router.get("/photo/{user_id}")
def photo_list(user_id: str, db: Session = Depends(get_session)):
    """看板:用户所有场景照片(整图预签名 URL + 描述)。"""
    store.get_or_create_user(db, user_id)
    return {"photos": photo_mod.list_photos(db, user_id)}


# ---- 定期跟踪报告 ----

@router.get("/report/eligibility/{user_id}")
def report_eligibility(user_id: str, db: Session = Depends(get_session)):
    return report_mod.report_eligibility(db, user_id)


@router.get("/report/{user_id}")
def report(user_id: str, db: Session = Depends(get_session)):
    return report_mod.build_report(db, user_id, LLMClient())


# ---- 树洞信箱 ----

@router.get("/treehole/write-eligibility/{user_id}")
def treehole_write_eligibility(user_id: str, db: Session = Depends(get_session)):
    return treehole_mod.write_eligibility(db, user_id)


@router.get("/treehole/reply-eligibility/{user_id}")
def treehole_reply_eligibility(user_id: str, db: Session = Depends(get_session)):
    return treehole_mod.reply_eligibility(db, user_id)


class TreeholeLetterReq(BaseModel):
    user_id: str
    content: str


@router.post("/treehole/letter")
def treehole_write_letter(req: TreeholeLetterReq, db: Session = Depends(get_session)):
    return treehole_mod.write_letter(db, req.user_id, req.content, LLMClient())


@router.get("/treehole/matches/{user_id}")
def treehole_matches(user_id: str, db: Session = Depends(get_session)):
    return treehole_mod.get_matches(db, user_id, LLMClient())


class TreeholeReplyReq(BaseModel):
    user_id: str
    letter_id: str
    content: str


@router.post("/treehole/reply")
def treehole_submit_reply(req: TreeholeReplyReq, db: Session = Depends(get_session)):
    try:
        return treehole_mod.submit_reply(db, req.user_id, req.letter_id, req.content, LLMClient())
    except ValueError as e:
        raise HTTPException(404, str(e))


# ---- 树洞审核(后台,暂无鉴权) ----

@router.get("/treehole/review/pending")
def treehole_review_pending(db: Session = Depends(get_session)):
    return {"replies": treehole_mod.review_pending(db)}


@router.post("/treehole/review/{reply_id}/approve")
def treehole_review_approve(reply_id: str, db: Session = Depends(get_session)):
    try:
        return treehole_mod.approve_reply(db, reply_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/treehole/review/{reply_id}/reject")
def treehole_review_reject(reply_id: str, db: Session = Depends(get_session)):
    try:
        return treehole_mod.reject_reply(db, reply_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


# ---- 树洞:打开 App 的一次性弹窗 + 看板 ----

@router.get("/treehole/popup/{user_id}")
def treehole_popup(user_id: str, db: Session = Depends(get_session)):
    """打开 App 时调用:返回当前该弹的树洞弹窗(写信/回信邀请/收到回信,各一次)。"""
    store.get_or_create_user(db, user_id)
    return treehole_mod.popups(db, user_id, LLMClient())


class TreeholeSeenReq(BaseModel):
    kind: str
    ref_id: str | None = None


@router.post("/treehole/popup/{user_id}/seen")
def treehole_popup_seen(user_id: str, req: TreeholeSeenReq, db: Session = Depends(get_session)):
    return treehole_mod.mark_popup_seen(db, user_id, req.kind, req.ref_id)


@router.get("/treehole/letters/{user_id}")
def treehole_letters(user_id: str, db: Session = Depends(get_session)):
    """看板:我写的树洞信 + 各自收到的回信。"""
    store.get_or_create_user(db, user_id)
    return {"letters": treehole_mod.my_letters(db, user_id)}


@router.get("/treehole/replies/{user_id}")
def treehole_replies(user_id: str, db: Session = Depends(get_session)):
    """看板:我写给相似经历者的回信。"""
    store.get_or_create_user(db, user_id)
    return {"replies": treehole_mod.my_replies(db, user_id)}


# ---- 树洞运营后台(暂无鉴权,同 review 系列) ----

@router.get("/treehole/admin/letters")
def treehole_admin_letters(db: Session = Depends(get_session)):
    """运营后台:查看所有来信。"""
    return {"letters": treehole_mod.admin_letters(db)}


class TreeholeAdminReplyReq(BaseModel):
    letter_id: str
    content: str


@router.post("/treehole/admin/reply")
def treehole_admin_reply(req: TreeholeAdminReplyReq, db: Session = Depends(get_session)):
    """运营后台:给来信回信(直达,免审核)。"""
    try:
        return treehole_mod.admin_reply(db, req.letter_id, req.content, LLMClient())
    except ValueError as e:
        raise HTTPException(404, str(e))


class InterviewStartReq(BaseModel):
    user_id: str
    loss_type: str = "breakup"
    question_key: str | None = None


class InterviewAnswerReq(BaseModel):
    session_id: str
    answer: str


class InterviewReviseReq(BaseModel):
    session_id: str
    supplement: str


@router.get("/interview/questions")
def interview_questions():
    return interview_mod.questions()


@router.post("/interview/start")
def interview_start(req: InterviewStartReq, db: Session = Depends(get_session)):
    return interview_mod.start(db, req.user_id, req.loss_type, req.question_key)


@router.post("/interview/answer")
def interview_answer(req: InterviewAnswerReq, db: Session = Depends(get_session)):
    try:
        # 报告生成放后台(时延几十秒),先即时返回,前端轮询 /interview/{session_id} 拿 report_ready
        return interview_mod.answer(db, req.session_id, req.answer, LLMClient(), async_report=True)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/interview/revise")
def interview_revise(req: InterviewReviseReq, db: Session = Depends(get_session)):
    try:
        return interview_mod.revise(db, req.session_id, req.supplement, LLMClient())
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/interview/{session_id}")
def interview_state(session_id: str, db: Session = Depends(get_session)):
    s = store.get_interview(db, session_id)
    if s is None:
        raise HTTPException(404, "session not found")
    return interview_mod.progress(s)


# ---- 用户引导阶段 + 初始报告看板 ----

@router.get("/onboarding/{user_id}")
def onboarding(user_id: str, db: Session = Depends(get_session)):
    """返回用户当前所处阶段(new/interview/report/main),供前端路由与展示。"""
    store.get_or_create_user(db, user_id)
    phase = onboarding_mod.get_phase(db, user_id)
    resp = {"user_id": user_id, "phase": phase}
    if phase == "interview":
        active = store.get_active_interview(db, user_id)
        if active is not None:
            resp["interview"] = interview_mod.progress(active)
    return resp


@router.post("/onboarding/{user_id}/enter-main")
def onboarding_enter_main(user_id: str, db: Session = Depends(get_session)):
    """用户在报告页确认后进入主界面:report → main。同步映射 user_states.first_report_status=pinned。"""
    store.get_or_create_user(db, user_id)
    try:
        onboarding_mod.transition(db, user_id, "main")
    except ValueError as e:
        raise HTTPException(400, str(e))
    store.update_user_state(db, user_id, first_report_status="pinned")
    return {"user_id": user_id, "phase": "main"}


@router.get("/initial-report/{user_id}")
def initial_report(user_id: str, db: Session = Depends(get_session)):
    """看板:返回初始报告的用户视图(仅报告正文 + 分手关系分析)。"""
    store.get_or_create_user(db, user_id)
    content = store.get_latest_report(db, user_id, "initial")
    if content is None:
        raise HTTPException(404, "初始报告尚未生成")
    return onboarding_mod.initial_report_view(content)


# ---- 主界面聚合 ----

@router.get("/home/{user_id}")
def home(user_id: str, db: Session = Depends(get_session)):
    """主界面一次返回:情绪日历 + 软引导(无触发回落通用语录) + 今日主题。"""
    return home_mod.get_home(db, user_id, LLMClient())


# ---- 周报 ----

@router.get("/weekly-report/{user_id}/due")
def weekly_report_due(user_id: str, db: Session = Depends(get_session)):
    """打开 App 时调用:返回是否要弹本周周报(需要时后台生成)。"""
    store.get_or_create_user(db, user_id)
    return weekly_mod.due(db, user_id)


@router.get("/weekly-report/{user_id}/{week_key}")
def weekly_report_get(user_id: str, week_key: str, db: Session = Depends(get_session)):
    data = weekly_mod.get(db, user_id, week_key)
    if data is None:
        raise HTTPException(404, "本周周报不存在")
    return data


@router.get("/weekly-report/{user_id}")
def weekly_report_list(user_id: str, db: Session = Depends(get_session)):
    """看板:历史周报列表(按周倒序)。"""
    store.get_or_create_user(db, user_id)
    return {"reports": weekly_mod.list_reports(db, user_id)}


class WeeklySeenReq(BaseModel):
    week_key: str


@router.post("/weekly-report/{user_id}/seen")
def weekly_report_seen(user_id: str, req: WeeklySeenReq, db: Session = Depends(get_session)):
    """关闭周报弹窗时调用,标记已看,本周不再弹。"""
    return weekly_mod.mark_seen(db, user_id, req.week_key)


# ---- 鉴权:用户名 + 密码(哈希存储 + 会话 token) ----

class AuthRegisterReq(BaseModel):
    username: str
    password: str


class AuthLoginReq(BaseModel):
    username: str
    password: str


class AuthLogoutReq(BaseModel):
    token: str


def _normalize_username(username: str) -> str:
    return username.strip().lower()


@router.post("/auth/register")
def auth_register(req: AuthRegisterReq, db: Session = Depends(get_session)):
    username = _normalize_username(req.username)
    password = req.password
    if len(username) < 2 or len(username) > 32:
        raise HTTPException(422, "用户名需 2–32 个字符")
    if len(password) < 6:
        raise HTTPException(422, "密码至少 6 位")
    if store.get_auth_by_username(db, username) is not None:
        raise HTTPException(409, "该用户名已被注册")
    hash_hex, salt_hex = hash_password(password)
    user_id = uuid4().hex
    auth = store.register_user(db, user_id=user_id, username=username,
                               password_hash=hash_hex, password_salt=salt_hex)
    token = new_token()
    store.create_session(db, user_id, token, new_expiry())
    return {"token": token, "user_id": user_id, "username": auth.username}


@router.post("/auth/login")
def auth_login(req: AuthLoginReq, db: Session = Depends(get_session)):
    username = _normalize_username(req.username)
    auth = store.get_auth_by_username(db, username)
    if auth is None or not verify_password(req.password, auth.password_salt, auth.password_hash):
        raise HTTPException(401, "用户名或密码错误")
    token = new_token()
    store.create_session(db, auth.user_id, token, new_expiry())
    return {"token": token, "user_id": auth.user_id, "username": auth.username}


@router.post("/auth/logout")
def auth_logout(req: AuthLogoutReq, db: Session = Depends(get_session)):
    store.delete_session(db, req.token)
    return {"ok": True}


@router.get("/auth/me")
def auth_me(user_id: str = Depends(get_current_user), db: Session = Depends(get_session)):
    auth = store.get_auth_by_user(db, user_id)
    return {"user_id": user_id, "username": auth.username if auth else None}


# ---- 单用户状态(N1–N5,走 token 鉴权) ----

class StatePatchReq(BaseModel):
    first_letter_status: str | None = None       # pending|opened
    first_report_status: str | None = None       # pending|pinned
    home_intro_seen: bool | None = None
    board_intro_seen: bool | None = None
    tts_enabled: bool | None = None
    tts_intro_seen: bool | None = None
    subject_name: str | None = None
    dismissed_moods: list | None = None
    pending_events: list | None = None


class RelationshipInferReq(BaseModel):
    answer: str


class RelationshipSetReq(BaseModel):
    relationship_type: str
    subject_name: str | None = None


class EndingCommitReq(BaseModel):
    ritual: str  # dissolved | buried | skipped


def _state_payload(s: UserState, user_id: str) -> dict:
    return {
        "user_id": user_id,
        "relationship_type": s.relationship_type,
        "relationship_type_source": s.relationship_type_source,
        "relationship_type_confidence": s.relationship_type_confidence,
        "subject_name": s.subject_name,
        "first_letter_status": s.first_letter_status,
        "first_report_status": s.first_report_status,
        "home_intro_seen": s.home_intro_seen,
        "board_intro_seen": s.board_intro_seen,
        "tts_enabled": s.tts_enabled,
        "tts_intro_seen": s.tts_intro_seen,
        "dismissed_moods": s.dismissed_moods,
        "pending_events": s.pending_events,
        "ending_stage": s.ending_stage,
        "ending_started_at": s.ending_started_at.isoformat() if s.ending_started_at else None,
        "ending_ritual": s.ending_ritual,
        "ending_committed_at": s.ending_committed_at.isoformat() if s.ending_committed_at else None,
        "archived_at": s.archived_at.isoformat() if s.archived_at else None,
        "destination": _destination(s),
    }


def _destination(s: UserState) -> str:
    """登录分流:018(已归档只读) / 005(活动陪伴) / 002(未完成引导)。"""
    if s.archived_at is not None:
        return "018"
    if s.home_intro_seen or s.board_intro_seen:
        return "005"
    return "002"


@router.get("/state")
def get_state(user_id: str = Depends(get_current_user), db: Session = Depends(get_session)):
    store.get_or_create_user(db, user_id)
    s = store.get_or_create_user_state(db, user_id)
    return _state_payload(s, user_id)


@router.patch("/state")
def patch_state(req: StatePatchReq, user_id: str = Depends(get_current_user), db: Session = Depends(get_session)):
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    s = store.update_user_state(db, user_id, **fields)
    return _state_payload(s, user_id)


@router.post("/relationship/infer")
def relationship_infer(req: RelationshipInferReq, user_id: str = Depends(get_current_user), db: Session = Depends(get_session)):
    """003 首问「Ta 是谁」后调用:AI 三分类,高置信度才写库,否则返回 null 让前端弹窗兜底。"""
    result = relationship_mod.infer(LLMClient(), req.answer)
    rt, conf = result["relationship_type"], result["confidence"]
    adopted = rt is not None and conf is not None and conf >= relationship_mod.ADOPT_CONFIDENCE
    if adopted:
        store.update_user_state(db, user_id, relationship_type=rt,
                                relationship_type_source="inferred",
                                relationship_type_confidence=conf)
    return {"relationship_type": rt if adopted else None,
            "confidence": conf if adopted else None,
            "adopted": adopted}


@router.post("/relationship")
def relationship_set(req: RelationshipSetReq, user_id: str = Depends(get_current_user), db: Session = Depends(get_session)):
    """兜底弹窗 / 手动修正:显式设置陪伴类型(source=manual)。"""
    rt = store.normalize_relationship_type(req.relationship_type)
    if rt is None:
        raise HTTPException(422, "关系类型需为 breakup / pet / relative")
    fields = {"relationship_type": rt, "relationship_type_source": "manual"}
    if req.subject_name is not None:
        fields["subject_name"] = req.subject_name.strip() or None
    s = store.update_user_state(db, user_id, **fields)
    return _state_payload(s, user_id)


@router.post("/ending/commit")
def ending_commit(req: EndingCommitReq, user_id: str = Depends(get_current_user), db: Session = Depends(get_session)):
    """结束提交(幂等):置 ending_stage=complete + archived_at,进入终端只读档案态。"""
    if req.ritual not in ("dissolved", "buried", "skipped"):
        raise HTTPException(422, "ritual 需为 dissolved / buried / skipped")
    store.get_or_create_user(db, user_id)
    s = store.get_or_create_user_state(db, user_id)
    if s.archived_at is not None:
        return _state_payload(s, user_id)  # 已归档:幂等返回当前结果
    if not s.relationship_type:
        raise HTTPException(400, "请先确认这段陪伴的类型")
    now = utcnow()
    s = store.update_user_state(
        db, user_id,
        ending_stage="complete",
        ending_ritual=req.ritual,
        ending_committed_at=now,
        archived_at=now,
    )
    return _state_payload(s, user_id)


# ---- 意见反馈(帮助与反馈页,轻量落库) ----

class FeedbackReq(BaseModel):
    content: str
    contact: str | None = None
    user_id: str | None = None


@router.post("/feedback")
def submit_feedback(req: FeedbackReq, db: Session = Depends(get_session)):
    content = (req.content or "").strip()
    if not content:
        raise HTTPException(422, "反馈内容不能为空")
    store.add_feedback(db, content, user_id=req.user_id, contact=(req.contact or "").strip() or None)
    return {"ok": True}


# ---- 日记便利贴(「写下今天」) ----

class DiaryCreateReq(BaseModel):
    user_id: str
    content: str
    emotion: str | None = None


@router.post("/diary")
def diary_create(req: DiaryCreateReq, db: Session = Depends(get_session)):
    content = (req.content or "").strip()
    if not content:
        raise HTTPException(422, "内容不能为空")
    store.get_or_create_user(db, req.user_id)
    emotion = req.emotion or classify(content).get("emotion")
    note = store.add_diary_note(db, req.user_id, content, emotion=emotion)
    return {"note_id": note.id, "emotion": emotion, "created_at": note.ts.isoformat()}


@router.get("/diary/{user_id}")
def diary_list(user_id: str, db: Session = Depends(get_session)):
    """看板:用户所有日记便利贴(按时间倒序,created_at 已转东八区本地时间)。"""
    store.get_or_create_user(db, user_id)
    offset = get_settings().timezone_offset_hours
    notes = []
    for n in store.list_diary_notes(db, user_id):
        local = n.ts + timedelta(hours=offset)
        notes.append({
            "note_id": n.id,
            "content": n.content,
            "emotion": n.emotion,
            "created_at": local.isoformat(),
        })
    return {"notes": notes}


# ---- 结束仪式 AI 纪念文案(019/020 结束流程) ----

class EndingContentReq(BaseModel):
    user_id: str


@router.post("/ending/content")
def ending_content(req: EndingContentReq, db: Session = Depends(get_session)):
    store.get_or_create_user(db, req.user_id)
    return ending_mod.memorial(db, req.user_id, LLMClient())


@router.get("/health")
def health():
    return {"status": "ok"}
