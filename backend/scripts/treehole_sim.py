"""树洞信箱模拟(纯 mock,无网络):写信资格 → 写信 → 回信资格 → 匹配 → 回信 → 审核。"""
import os
import sys
from datetime import timedelta

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from agent import treehole
from config import Settings
from gateway.client import LLMClient
from memory import store
from memory.db import Base
from memory.models import utcnow

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
S = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
client = LLMClient(settings=Settings(mock_llm=True))


def add_mem(db, uid, content, score, emo, days_ago):
    e = store.add_memory(db, uid, content=content, summary=content,
                         emotion={"score": score, "emotion": emo})
    e.ts = utcnow() - timedelta(days=days_ago)
    db.commit()


# 用户 A(亲友离世):已使用 4 天,写一封树洞信
db = S()
store.get_or_create_user(db, "A", loss_type="loved_one")
for i, (score, emo) in enumerate([(40, "难过"), (45, "想念"), (50, "孤独"), (48, "难过")]):
    add_mem(db, "A", f"第{i}天的倾诉,想起奶奶", score, emo, days_ago=i)

print("== 写信资格 ==")
elig = treehole.write_eligibility(db, "A")
print(elig)

print("\n== 写信(无敏感信息) ==")
r = treehole.write_letter(db, "A", "奶奶走后,我总觉得心里空了一块,很多话没来得及说。", client)
print(r)
letter_a = r["letter_id"]

print("\n== 再写一封(应被拒绝) ==")
print(treehole.write_letter(db, "A", "又想说点什么", client))

print("\n== 写信(含手机号,应被 PII 拦截) ==")
db2 = S()
store.get_or_create_user(db2, "C", loss_type="breakup")
for i in range(4):
    add_mem(db2, "C", f"第{i}天", 50, "难过", days_ago=i)
print(treehole.write_letter(db2, "C", "我电话是13800138000,想找人聊聊", client))

# 用户 B(亲友离世):已使用 7+ 天,情绪趋稳
print("\n== 用户 B 情绪趋稳,回信资格 ==")
db3 = S()
store.get_or_create_user(db3, "B", loss_type="loved_one")
for i in range(8):
    emo = "平静" if i <= 2 else "释怀"
    score = 55 + i * 2
    add_mem(db3, "B", f"第{i}天,慢慢接受了", score, emo, days_ago=i)
print(treehole.reply_eligibility(db3, "B"))

print("\n== 匹配(B 应匹配到 A 的信) ==")
m = treehole.get_matches(db3, "B", client)
for x in m["matches"]:
    print("-", x["letter_id"], x["loss_type"], x["emotion"], "|", x["summary"])

print("\n== 回信(B 回复 A 的信) ==")
rp = treehole.submit_reply(db3, "B", letter_a, "我也失去过很重要的人。想对你说:慢慢来,你没有被忘记。", client)
print(rp)

print("\n== 回信含联系方式(应被拦截) ==")
print(treehole.submit_reply(db3, "B", letter_a, "加我微信 abc12345 详聊", client))

print("\n== 回信自己写的信(应被拒绝) ==")
print(treehole.submit_reply(db, "A", letter_a, "给自己的回信", client))

print("\n== 审核队列 + 审批 ==")
print(treehole.review_pending(db3))
rid = rp["reply_id"]
print(treehole.approve_reply(db3, rid))
print("待审剩余:", len(treehole.review_pending(db3)))
