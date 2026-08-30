(() => {
  "use strict";

  // 后端状态门面:保持 window.MakeAgainState 的原方法面不变(23 个页面零散调用它),
  // 把「真源状态」全部搬到后端 /state(N1–N5,走 token 鉴权),不保留任何本地残留数据。
  //
  // 后端真源(字段见 user_states + /state payload):relationship_type、subject_name、
  //   first_letter_status、first_report_status、home_intro_seen、board_intro_seen、
  //   tts_enabled、tts_intro_seen、dismissed_moods、pending_events、ending_*、archived_at、destination。
  // 曾在本地的 boardItems/chat.deletedByDay/outgoingLetter/replies/followUp 已迁移到各自后端端点:
  //   看板 = /item + /photo + /diary;树洞信/回信 = /treehole/letters + /treehole/replies;
  //   聊天删除 = /chat/history/{user_id}/delete。页面直接调 MakeAgainAPI,不再经 state 层合成。
  //
  // 单用户模型:一次登录 = 一行 user_states = 一段陪伴(active 或 archived 二态)。
  const API = window.MakeAgainAPI;
  const VALID_RELATIONSHIPS = new Set(["breakup", "pet", "relative"]);

  const clone = (value) => {
    if (value == null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  const now = () => new Date().toISOString();
  const normalizeRelationshipType = (value) => (VALID_RELATIONSHIPS.has(String(value || "").trim().toLowerCase()) ? String(value).trim().toLowerCase() : null);

  // ---- 内存态 ----
  let userId = null;      // 当前登录用户(后端下发的真实 id,未登录为 null)
  let state = null;       // /state payload 的镜像
  let readyPromise = null;

  const load = async () => {
    userId = API ? API.getUserId() : null;
    if (!API || !userId || !API.getToken()) { state = null; return; }
    try {
      state = await API.state();
    } catch (error) {
      const msg = String((error && error.message) || "");
      if (msg.includes("未登录") || msg.includes("401")) {
        API.clearSession();
        userId = null;
      }
      state = null;
    }
  };

  const ready = () => {
    if (readyPromise == null) readyPromise = load().catch(() => { state = null; });
    return readyPromise;
  };

  // 强制重拉 /state(用于 /relationship/infer、/ending/commit 等后端已写库、本地需要同步的场景)。
  const refresh = async () => {
    if (!API || !API.getToken()) { state = null; return null; }
    try { state = await API.state(); } catch (error) { state = null; }
    return state;
  };

  // ---- 合成:把 /state 拼回原来的 journey/account/archive 形状 ----

  const journeyFull = () => {
    if (!state) return null;
    const archived = state.archived_at != null;
    const relationshipType = normalizeRelationshipType(state.relationship_type);
    const journey = {
      id: "journey-primary",
      accountId: userId || "account-primary",
      relationshipType,
      subjectName: state.subject_name || "",
      status: archived ? "archived" : "active",
      createdAt: null,
      updatedAt: null,
      firstLetterStatus: state.first_letter_status || "pending",
      firstReportStatus: state.first_report_status || "pending",
      homeIntroSeen: !!state.home_intro_seen,
      boardIntroSeen: !!state.board_intro_seen,
      dismissedMoods: Array.isArray(state.dismissed_moods) ? clone(state.dismissed_moods) : [],
      pendingEvents: Array.isArray(state.pending_events) ? clone(state.pending_events) : [],
      ending: {
        stage: state.ending_stage || "active",
        startedAt: state.ending_started_at || null,
        ritual: state.ending_ritual || null,
        committedAt: state.ending_committed_at || null,
      },
      archive: null,
    };
    if (archived) {
      const labels = { breakup: "曾经的那段陪伴", pet: "一段温柔的陪伴", relative: "被好好记住的人" };
      journey.archive = {
        id: "archive-journey-primary",
        journeyId: journey.id,
        accountId: journey.accountId,
        relationshipType: journey.relationshipType,
        subjectName: journey.subjectName,
        title: journey.subjectName ? "关于“" + journey.subjectName + "”的陪伴" : (labels[relationshipType] || "一段被保存的陪伴"),
        createdAt: state.archived_at || now(),
        snapshot: clone({
          firstReportStatus: journey.firstReportStatus,
          pendingEvents: journey.pendingEvents,
        }),
      };
    }
    return journey;
  };

  const getCurrentJourney = () => {
    const journey = journeyFull();
    return journey && journey.status === "active" ? journey : null;
  };

  const listArchives = () => {
    const journey = journeyFull();
    return journey && journey.archive ? [clone(journey.archive)] : [];
  };

  const getArchive = (archiveId) => listArchives().find((archive) => archive.id === archiveId) || null;

  const getAccount = () => {
    const journey = journeyFull();
    const completed = state && (state.home_intro_seen || state.board_intro_seen);
    return {
      id: userId || "account-primary",
      createdAt: null,
      onboarding: {
        founderLetterSeen: !!(state && (state.first_letter_status === "opened" || state.home_intro_seen || state.board_intro_seen)),
        completedAt: completed ? now() : null,
      },
      preferences: {
        ttsEnabled: state ? state.tts_enabled !== false : true,
        ttsIntroSeen: !!(state && state.tts_intro_seen),
      },
      activeJourneyId: journey && journey.status === "active" ? journey.id : null,
      journeyOrder: journey ? [journey.id] : [],
      journeys: journey ? { [journey.id]: journey } : {},
    };
  };

  const currentAccountId = () => (typeof userId === "string" && userId !== "" ? userId : null);

  // ---- 写操作(乐观更新 + 异步落到后端) ----

  const updateCurrentJourney = (updater) => {
    const journey = getCurrentJourney();
    if (!journey) return Promise.resolve(null);
    updater(journey);
    const backendPatch = {
      first_letter_status: journey.firstLetterStatus,
      first_report_status: journey.firstReportStatus,
      home_intro_seen: !!journey.homeIntroSeen,
      board_intro_seen: !!journey.boardIntroSeen,
      dismissed_moods: Array.isArray(journey.dismissedMoods) ? journey.dismissedMoods : [],
      pending_events: Array.isArray(journey.pendingEvents) ? journey.pendingEvents : [],
      subject_name: journey.subjectName ? String(journey.subjectName) : null,
    };
    // 乐观更新内存镜像
    state = Object.assign({}, state, {
      first_letter_status: journey.firstLetterStatus,
      first_report_status: journey.firstReportStatus,
      home_intro_seen: !!journey.homeIntroSeen,
      board_intro_seen: !!journey.boardIntroSeen,
      dismissed_moods: backendPatch.dismissed_moods,
      pending_events: backendPatch.pending_events,
      subject_name: backendPatch.subject_name,
    });
    if (!userId || !API || !API.getToken()) return Promise.resolve(clone(journey));
    return API.patchState(backendPatch).then((s) => { state = s; return getCurrentJourney(); }).catch(() => getCurrentJourney());
  };

  const updateAccount = (updater) => {
    const account = getAccount();
    if (!account) return Promise.resolve(null);
    updater(account);
    const backendPatch = {};
    if (typeof account.preferences.ttsEnabled === "boolean") backendPatch.tts_enabled = account.preferences.ttsEnabled;
    if (typeof account.preferences.ttsIntroSeen === "boolean") backendPatch.tts_intro_seen = account.preferences.ttsIntroSeen;
    // 注:onboarding.founderLetterSeen / completedAt 是派生值,不单独落库,
    // 真源由 first_letter_status / home_intro_seen / board_intro_seen 表达。
    if (Object.keys(backendPatch).length) {
      state = Object.assign({}, state, backendPatch);
    }
    if (!userId || !API || !API.getToken() || !Object.keys(backendPatch).length) return Promise.resolve(clone(account));
    return API.patchState(backendPatch).then((s) => { state = s; return getAccount(); }).catch(() => getAccount());
  };

  const setRelationshipType = (value) => {
    const normalized = normalizeRelationshipType(value);
    if (!normalized || !userId || !API || !API.getToken()) return Promise.resolve(null);
    return API.relationshipSet(normalized, null).then((s) => { state = s; return getCurrentJourney(); }).catch(() => getCurrentJourney());
  };

  const ensureActiveJourney = () => getCurrentJourney();

  const login = (accountId) => currentAccountId();

  const logout = () => {
    if (API) {
      API.clearSession();
      API.logout().catch(() => {});
    }
    userId = null;
    state = null;
    readyPromise = null;
  };

  const commitArchive = (ritual = "completed") => {
    const journey = getCurrentJourney();
    if (!journey || !journey.relationshipType) return Promise.resolve(null);
    if (!userId || !API || !API.getToken()) return Promise.resolve(null);
    return API.endingCommit(ritual).then((s) => { state = s; return listArchives()[0] || null; }).catch(() => null);
  };

  const resolveLoginDestination = () => {
    if (!currentAccountId() || !API || !API.getToken()) return "001-login.html";
    const destination = state?.destination;
    if (destination === "018") return "018-archive-bag.html?from=login";
    if (destination === "005") return "005-home.html?from=login";
    return "002-founder-letter.html?from=auth";
  };

  const activeGuard = ({ requireRelationship = false, requireLetter = false, requireReport = false } = {}) => {
    if (!currentAccountId() || !API || !API.getToken()) return { allowed: false, redirect: "001-login.html?from=guard" };
    const journey = getCurrentJourney();
    if (!journey) return { allowed: false, redirect: listArchives().length ? "018-archive-bag.html?from=guard" : "002-founder-letter.html?from=guard" };
    if (requireRelationship && !journey.relationshipType) return { allowed: false, redirect: "003-voice.html?from=relationship-required" };
    if (requireLetter && journey.firstLetterStatus !== "opened") return { allowed: false, redirect: "003-voice.html?from=letter-required&trigger=letter" };
    if (requireReport && journey.firstReportStatus !== "pinned") return { allowed: false, redirect: "004-report-board.html?from=report-required" };
    return { allowed: true, journey };
  };

  window.MakeAgainState = {
    ready,
    refresh,
    normalizeRelationshipType,
    login,
    logout,
    currentAccountId,
    getAccount,
    getCurrentJourney,
    ensureActiveJourney,
    setRelationshipType,
    updateCurrentJourney,
    updateAccount,
    listArchives,
    getArchive,
    commitArchive,
    resolveLoginDestination,
    activeGuard,
  };
})();
