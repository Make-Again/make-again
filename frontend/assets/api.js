(() => {
  // 后端接口层。部署时走同源 /api(nginx 反代到后端);本地 file:// 调试仍直连 127.0.0.1:8000。
  const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000/api" : "/api";
  const USER_KEY = "make-again-user-id";
  const TOKEN_KEY = "make-again-auth-token";

  // 登录后由后端下发真实 user_id + token 并持久化;换设备/重装需重新登录。
  const getUserId = () => {
    try { return localStorage.getItem(USER_KEY) || null; } catch (error) { return null; }
  };

  const getToken = () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch (error) { return null; }
  };

  const setSession = (userId, token) => {
    try {
      localStorage.setItem(USER_KEY, userId);
      localStorage.setItem(TOKEN_KEY, token);
    } catch (error) { /* 忽略 */ }
  };

  const clearSession = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch (error) { /* 忽略 */ }
  };

  const apiFetch = async (path, options = {}) => {
    const token = getToken();
    const opts = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(options.headers || {}),
      },
    };
    let res;
    try {
      res = await fetch(API_BASE + path, opts);
    } catch (error) {
      throw new Error("网络不通：后端未连接（" + error.message + "）");
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
    if (!res.ok) {
      const detail = data && data.detail ? data.detail : (text || ("HTTP " + res.status));
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data;
  };

  const get = (path) => apiFetch(path);
  const post = (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  const patch = (path, body) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });

  // 表单上传(语音识别等多部分请求,不能走 JSON)。
  const formPost = async (path, form) => {
    const token = getToken();
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method: "POST",
        body: form,
        ...(token ? { headers: { Authorization: "Bearer " + token } } : {}),
      });
    } catch (error) {
      throw new Error("网络不通：后端未连接（" + error.message + "）");
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
    if (!res.ok) {
      const detail = data && data.detail ? data.detail : (text || ("HTTP " + res.status));
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data;
  };

  window.MakeAgainAPI = {
    base: API_BASE,
    getUserId,
    getToken,
    setSession,
    clearSession,
    // 鉴权:用户名 + 密码(登录 / 注册 / 会话)
    register: (username, password) => post("/auth/register", { username, password }),
    login: (username, password) => post("/auth/login", { username, password }),
    logout: () => post("/auth/logout", { token: getToken() || "" }),
    me: () => apiFetch("/auth/me"),
    // 单用户状态(N1–N5,走 token 鉴权)
    state: () => get("/state"),
    patchState: (fields) => patch("/state", fields),
    relationshipInfer: (answer) => post("/relationship/infer", { answer }),
    relationshipSet: (relationshipType, subjectName) => post("/relationship", { relationship_type: relationshipType, subject_name: subjectName || null }),
    endingCommit: (ritual) => post("/ending/commit", { ritual }),
    // 引导阶段(new / interview / report / main)
    onboarding: (userId) => apiFetch("/onboarding/" + encodeURIComponent(userId)),
    enterMain: (userId) => post("/onboarding/" + encodeURIComponent(userId) + "/enter-main", {}),
    // 访谈
    interviewQuestions: () => apiFetch("/interview/questions"),
    interviewStart: (userId, lossType) => post("/interview/start", { user_id: userId, loss_type: lossType }),
    interviewAnswer: (sessionId, answer) => post("/interview/answer", { session_id: sessionId, answer }),
    interviewState: (sessionId) => apiFetch("/interview/" + encodeURIComponent(sessionId)),
    interviewRevise: (sessionId, supplement) => post("/interview/revise", { session_id: sessionId, supplement }),
    // 初始报告
    initialReport: (userId) => apiFetch("/initial-report/" + encodeURIComponent(userId)),
    // 语音:ASR(录音转文字,multipart) + TTS(文字转语音,返回 audio_url)
    speechRecognize: (blob, filename) => {
      const fd = new FormData();
      fd.append("file", blob, filename || "voice.webm");
      return formPost("/speech/recognize", fd);
    },
    speechTts: (text) => post("/speech/tts", { text }),
    speechUpload: (blob, filename) => {
      const fd = new FormData();
      fd.append("file", blob, filename || "audio.m4a");
      return formPost("/speech/upload", fd);
    },
    speechTranscribe: (inputUrl) => post("/speech/transcribe", { input_url: inputUrl }),
    // 主对话(陪伴核心,voice-first 自由对话)
    chat: (userId, message, sessionId) => post("/chat", { user_id: userId, message, session_id: sessionId || null }),
    chatSessionClear: (userId, sessionId) => post("/chat/session/clear", { user_id: userId, session_id: sessionId || null }),
    // 主界面聚合(情绪日历 + 软引导 + 今日主题)
    home: (userId) => apiFetch("/home/" + encodeURIComponent(userId)),
    // 聊天历史(每日总结 + 当日记录)
    chatHistoryDays: (userId) => apiFetch("/chat/history/" + encodeURIComponent(userId) + "/days"),
    chatHistoryDay: (userId, date, limit) => {
      const q = limit ? "?limit=" + encodeURIComponent(limit) : "";
      return apiFetch("/chat/history/" + encodeURIComponent(userId) + "/day/" + encodeURIComponent(date) + q);
    },
    chatHistoryPage: (userId, opts) => {
      const q = new URLSearchParams();
      const o = opts || {};
      if (o.before_id != null) q.set("before_id", String(o.before_id));
      if (o.after_id != null) q.set("after_id", String(o.after_id));
      if (o.date) q.set("date", o.date);
      if (o.limit) q.set("limit", String(o.limit));
      const s = q.toString();
      return apiFetch("/chat/history/" + encodeURIComponent(userId) + (s ? "?" + s : ""));
    },
    chatHistoryDelete: (userId, messageIds) => post("/chat/history/" + encodeURIComponent(userId) + "/delete", { message_ids: messageIds }),
    // 物品纪念(聊天 tool 触发 → 上传抠图 → 看板)
    itemUpload: (userId, intent, itemName, description, file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("user_id", userId);
      fd.append("intent", intent || "keep");
      fd.append("item_name", itemName || "");
      fd.append("description", description || "");
      return formPost("/item/upload", fd);
    },
    itemList: (userId) => apiFetch("/item/" + encodeURIComponent(userId)),
    // 场景照片(拍立得,聊天 tool 触发 → 整图上传 → 看板)
    photoUpload: (userId, title, description, file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("user_id", userId);
      fd.append("title", title || "");
      fd.append("description", description || "");
      return formPost("/photo/upload", fd);
    },
    photoList: (userId) => apiFetch("/photo/" + encodeURIComponent(userId)),
    // 画像(只读调试)+ 情绪反思洞察 + 软引导
    portraits: (userId) => apiFetch("/portraits/" + encodeURIComponent(userId)),
    reflect: (userId) => post("/reflect/" + encodeURIComponent(userId), {}),
    nudges: (userId) => apiFetch("/nudges/" + encodeURIComponent(userId)),
    // 每日主题 + 今日启发文案
    dailyThemes: (userId) => apiFetch("/daily/themes/" + encodeURIComponent(userId)),
    dailyOpening: (userId) => post("/daily/opening", { user_id: userId }),
    // 情绪日历(整月,可指定 ?month=YYYY-MM)
    calendar: (userId, month) => apiFetch("/calendar/" + encodeURIComponent(userId) + (month ? "?month=" + encodeURIComponent(month) : "")),
    // 周报
    weeklyDue: (userId) => apiFetch("/weekly-report/" + encodeURIComponent(userId) + "/due"),
    weeklyList: (userId) => apiFetch("/weekly-report/" + encodeURIComponent(userId)),
    weeklyGet: (userId, weekKey) => apiFetch("/weekly-report/" + encodeURIComponent(userId) + "/" + encodeURIComponent(weekKey)),
    weeklySeen: (userId, weekKey) => post("/weekly-report/" + encodeURIComponent(userId) + "/seen", { week_key: weekKey }),
    // 定期跟踪报告
    reportEligibility: (userId) => apiFetch("/report/eligibility/" + encodeURIComponent(userId)),
    report: (userId) => apiFetch("/report/" + encodeURIComponent(userId)),
    // 树洞信箱
    treeholeWriteEligibility: (userId) => apiFetch("/treehole/write-eligibility/" + encodeURIComponent(userId)),
    treeholeReplyEligibility: (userId) => apiFetch("/treehole/reply-eligibility/" + encodeURIComponent(userId)),
    treeholeWrite: (userId, content) => post("/treehole/letter", { user_id: userId, content }),
    treeholeMatches: (userId) => apiFetch("/treehole/matches/" + encodeURIComponent(userId)),
    treeholeReply: (userId, letterId, content) => post("/treehole/reply", { user_id: userId, letter_id: letterId, content }),
    treeholeLetters: (userId) => apiFetch("/treehole/letters/" + encodeURIComponent(userId)),
    treeholeReplies: (userId) => apiFetch("/treehole/replies/" + encodeURIComponent(userId)),
    treeholePopup: (userId) => apiFetch("/treehole/popup/" + encodeURIComponent(userId)),
    treeholePopupSeen: (userId, kind, refId) => post("/treehole/popup/" + encodeURIComponent(userId) + "/seen", { kind, ref_id: refId || null }),
    // 意见反馈(帮助与反馈页)
    feedback: (content, contact) => post("/feedback", { content, contact: contact || null, user_id: getUserId() }),
    // 日记便利贴(「写下今天」)
    diaryCreate: (userId, content) => post("/diary", { user_id: userId, content }),
    diaryList: (userId) => apiFetch("/diary/" + encodeURIComponent(userId)),
    // 结束仪式 AI 纪念文案(019/020)
    endingContent: (userId) => post("/ending/content", { user_id: userId }),
  };
})();
