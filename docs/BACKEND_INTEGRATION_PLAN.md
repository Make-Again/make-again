# Make Again · 新版前端接入后端 · 实施计划（定稿）

> 更新：2026-08-30
> 前端真源：`MakeAgain_HTML_Prototype_2026-08-30/`
> 后端真源：`backend/`
> 本文档 = 当前真实状态的差距清单 + 分阶段实施计划。**大部分接线已就绪**，本轮只做剩余缺口。

---

## 0. 已确认决策

| 议题 | 决定 |
|---|---|
| 首份报告触发 | 弃用 `025-interview.html` 独立页（UI/交互/流程有问题）；**恢复旧版 003 内嵌访谈**（复用 `/interview/*`），后端 `interview.py` 不动 |
| 关系类型 | 保留新版「Ta 是谁」推断（`/relationship/infer` + 低置信度弹窗兜底），替代旧版 loss_type 手动 chooser |
| 反馈(010)/会员(006)/商店(021) | 静态页，不做后端 |
| 018「开始新的陪伴」 | 已移除（已核实）✅ |
| 树洞回信入口 | 放 016 结束确认页（现按钮接错页，需修） |

---

## 1. 现状：已就绪、本轮不动

- **后端**：鉴权全套（`/auth/*` + `UserAuth`/`AuthSession` + `get_current_user`）、N1–N5（`/state` GET/PATCH、`/relationship/infer`、`/relationship`、`/ending/commit`）、`agent/relationship.py`、`UserState` 表、`effective_loss_type` 类型映射、原 49 端点、`onboarding/enter-main→first_report_status=pinned`，均已实现并通过编译 + DB 冒烟。
- **前端**：`assets/api.js`（含 N1–N5）+ `assets/make-again-state-v3.js` 后端门面 + 24 页 `reviewMode` 接线，均已存在。

## 2. 剩余工作清单

| # | 项 | 说明 |
|---|---|---|
| **B1** | 访谈改造（最大件） | 删 025，把旧版 003 内嵌访谈状态机搬回，保留关系推断 |
| **B2** | 016「回信他人」接错页 | `016-ending-confirm.html:27` 按钮 `data-go` 指向 015（写信页），应改 024-reply-compose（回信他人） |
| **B3** | 未读回信/草稿状态 | `replies`/`followUp` 未读回信应改读后端 `treeholeLetters`/`treeholePopup`；`outgoingLetter` 草稿定为 transient 客户端态 |
| **B4** | 聊天退出动作覆盖 | `chatSessionClear` 现仅挂 `pagehide`，需覆盖 003 内 `nextPage` 导航路径 |
| **C1** | 后端全链路验收 | 启动后端跑 `scripts/acceptance_test.py`，修失败项 |
| **C2** | 前端静态检查 | 全部 JS `node --check` + 24 页路由存在性 |
| **C3** | 手动 E2E | handoff 9 条场景过一遍 |

---

## 3. 分阶段实施

### 阶段 0 — 基线验证
启动后端 → 跑 `acceptance_test.py` → `node --check` 全前端。产出绿/红清单，红项归入后续阶段。

### 阶段 1 — 访谈改造（B1，核心）
1. `003-voice-v6.js`：从旧版照抄 `startInterview / enterInterview / submitInterviewAnswer / pollReport / bootOnboarding` 状态机。
2. 关系推断后接访谈：`afterRelationship()` 与 `initializeEntry()` 里原 `goToInterview()`（跳 025）改为 `startInterview(mapLossType(relationshipType))`，映射 `breakup→breakup / pet→pet / relative→loved_one`。
3. 关系兜底：低置信度走现有关系弹窗（breakup/pet/relative），选中后同样 `startInterview(...)`。
4. `003-voice.html` 删掉「跳到 025 访谈」链接（`003-voice.html:19`）。
5. 停用/删除 `025-interview.html` + `025-interview.js`（`index.html` 若有入口一并清理）。

### 阶段 2 — 结束/回信接线（B2）
- 016「回信他人」按钮 `data-go` 改 `024-reply-compose.html?from=ending`（或先过 `treeholeReplyEligibility` 再进）。
- 验证 016→019/020 按 relationship_type 分流、`ending/commit` 幂等。

### 阶段 3 — 残留状态 + 退出动作（B3、B4）
- 022/018 的「未读回信」改读后端 `treeholeLetters`（`replies[].source`）+ `treeholePopup`(`reply_received`) 判定，去掉本地 `replies`/`followUp` 依赖。
- `outgoingLetter` 草稿定稿为 transient（登出即弃），注释写明原因。
- 003 内所有 `nextPage` 跳转前显式调 `chatSessionClear`（home/close/report 等出口），不只依赖 `pagehide`。

### 阶段 4 — 全链路验收（C1–C3）
清库跑完整主链 + handoff 9 条场景，重点：关系推断弹窗兜底、内嵌访谈→004 报告→005、`ending/commit` 幂等、归档后历史返回跳 018/023、退出动作三件套（上下文清空/今日总结/今日心情）。

---

## 4. 验收场景

1. 新用户：001 注册 → 002 → 003「Ta 是谁」推断 → **内嵌访谈** → 004 报告 → 005。
2. 推断低置信度 → 弹窗选类型 → 继续内嵌访谈（不再有 025）。
3. 老用户（活动陪伴）→ 直接 005。
4. 已归档 → 018 只读档案，无「开始新的陪伴」。
5. 016「回信他人」→ 024 回信流程（不是 015）。
6. 003 退出 → 007 出现当日总结、005 出现今日心情。

---

## 5. 风险

- 阶段 1 是最大工作量：旧版 003 状态机和新版关系推断/artifact 代码要**合流**，注意别覆盖掉新版已有的 TTS/ASR/物品照片上传逻辑，只替换「访谈」那一段。
- `interviewStart` 的 `loss_type` 必须传旧词汇（`relative→loved_one`），传 `relative` 会被后端当非法/默认 breakup。

---

## 附：原方案已落地的部分（对照确认，非待办）

| 原待办 | 现状 |
|---|---|
| 单用户状态 `user_states` | ✅ `memory/models.py:301` |
| N1–N5 接口 | ✅ `api/routes.py:608-729` |
| 鉴权用户名+密码 | ✅ `api/routes.py:566-606` + `auth.py` |
| 关系类型 AI 推断 | ✅ `agent/relationship.py` |
| 018 去掉「开始新的陪伴」 | ✅ 已移除 |
| 前端 api.js + state-v3 门面 | ✅ 已存在并接线 |
| 聊天退出 `chat/session/clear` | ✅ 已接 `pagehide`（待补全出口覆盖） |
