(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  if (root == null || shared == null || state == null) return;
  const params = new URL(location.href).searchParams;
  await state.ready();
  const guard = state.activeGuard();
  if (!guard.allowed) {
    window.location.replace(guard.redirect);
    return;
  }

  const phone = root.querySelector(".ma-letter-phone");
  const screen = root.querySelector(".ma-voice-screen");
  const mirror = root.querySelector("[data-voice-mirror]");
  const mirrorLabel = root.querySelector("[data-mirror-label]");
  const reply = root.querySelector("[data-current-reply]");
  const mirrorStatus = root.querySelector("[data-mirror-status]");
  const orb = root.querySelector(".ma-voice-orb");
  const close = root.querySelector(".ma-voice-close");
  const textComposer = root.querySelector(".ma-voice-text-composer");
  const textInput = root.querySelector("#ma-voice-text-input");
  const textSend = root.querySelector(".ma-voice-text-send");
  const hint = root.querySelector(".ma-voice-mode-hint");
  const home = root.querySelector(".ma-voice-home-return");
  const ttsToggle = root.querySelector(".ma-voice-tts-toggle");
  const ttsTip = root.querySelector("[data-tts-tip]");
  const artifactStage = root.querySelector("[data-artifact-stage]");
  const artifactSymbol = root.querySelector("[data-artifact-symbol]");
  const artifactKicker = root.querySelector("[data-artifact-kicker]");
  const artifactTitle = root.querySelector("[data-artifact-title]");
  const artifactCopy = root.querySelector("[data-artifact-copy]");
  const artifactAction = root.querySelector("[data-artifact-action]");
  const artifactDecline = root.querySelector("[data-artifact-decline]");
  const artifactFile = root.querySelector("[data-artifact-file]");
  const artifactFloat = root.querySelector("[data-artifact-float]");
  const artifactFloatObject = root.querySelector("[data-artifact-float-object]");
  const artifactFloatLoading = root.querySelector("[data-artifact-float-loading]");
  const artifactFloatHint = root.querySelector("[data-artifact-float-hint]");
  const portal = root.querySelector("[data-collect-portal]");
  const toast = root.querySelector("[data-collect-toast]");
  const undo = root.querySelector("[data-collect-undo]");
  if ([phone, screen, mirror, mirrorLabel, reply, mirrorStatus, orb, close, textComposer, textInput, textSend, hint, home, ttsToggle, ttsTip, artifactStage, artifactSymbol, artifactKicker, artifactTitle, artifactCopy, artifactAction, artifactDecline, artifactFile, artifactFloat, artifactFloatObject, artifactFloatLoading, artifactFloatHint, portal, toast, undo].some((node) => node == null)) return;

  const relationshipPicker = root.querySelector("[data-relationship-picker]");
  const relationshipOptions = Array.from(root.querySelectorAll("[data-relationship-option]"));
  const API = window.MakeAgainAPI;
  let awaitingRelationship = false;
  let relationshipAnswer = ""; // 「TA 是谁」首答,访谈启动时复用为第一答,避免重复问对象维度
  const uid = (state.currentAccountId && state.currentAccountId()) || (API && API.getUserId ? API.getUserId() : null);
  const chatSessionId = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  let currentArtifactTool = null;
  let pendingFile = null;
  const interview = { mode: "idle", sessionId: null, lossType: null };
  const kicker = root.querySelector(".ma-voice-kicker");
  // 退出/跳页前清空本次会话上下文(无感),不依赖 pagehide 单独兜底。
  const clearChatSession = () => {
    if (uid && API && API.chatSessionClear) {
      API.chatSessionClear(uid, chatSessionId).catch(() => {});
    }
  };
  const navigate = (href, opts) => {
    clearChatSession();
    shared.nextPage(href, opts);
  };

  const icon = {
    letter: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M8 15.5 24 7l16 8.5v22H8z"/><path d="m8 16 16 12 16-12M8 37.5l12.5-13M40 37.5l-12.5-13"/><circle cx="24" cy="28" r="4.2" fill="currentColor" fill-opacity=".16"/><path d="m22.3 28 1.2 1.3 2.5-2.7"/></svg>',
    object: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17v-5h5M32 12h5v5M37 31v5h-5M16 36h-5v-5"/><path d="M18 30c-3-4-1.8-10.2 2.6-12.8 4.3-2.6 10-.6 11.5 4.1 1.6 5-1.9 10.2-7 10.5-2.8.2-5.3-.5-7.1-1.8Z"/><path d="M20.5 20.5c2-1.5 5.1-1.6 7.1.1" opacity=".62"/></svg>',
    photo: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="m13 10 24 3-3 25-24-3z" opacity=".56"/><rect x="8" y="8" width="27" height="31" rx="2.5" fill="currentColor" fill-opacity=".04"/><circle cx="17" cy="17" r="3"/><path d="m11 31 7-7 5 5 4-4 5 5M13 35h17"/></svg>',
  };
  const artifactData = {
    letter: { kicker: "Wakey 递来一封信", title: "有些话，想写下来给你", copy: "这是第一次深聊后为你写下的信。打开它，我们再进入下一段旅程。", action: "打开这封信", decline: "", required: true, tts: "我想递给你一封信。打开它，我们再进入下一段旅程。" },
    object: { kicker: "Wakey 想留下一个物件", title: "要不要把它单独收藏起来", copy: "选择一张照片，Wakey 会把其中的物件取出来。", action: "选择物件照片", decline: "这次不要", required: false, tts: "这件物品似乎很重要。你想把它单独留下来吗？" },
    photo: { kicker: "Wakey 想留下这一刻", title: "要不要把整张照片留下来", copy: "选择照片后，它会变成一张带日期的拍立得。", action: "选择一张照片", decline: "这次不要", required: false, tts: "这一刻似乎值得留下。你想收藏这张照片吗？" },
  };
  const labels = {
    idle: "Voice · 点按球体录音",
    recording: "正在录音 · 再点一次发送",
    sending: "语音已收到 · 正在送给 Wakey",
    thinking: "Wakey 正在整理",
    speaking: "回应已到达 · 这里只留下当前一句",
  };
  let timer = null;
  let longWaitTimer = null;
  let holdTimer = null;
  let hintResetTimer = null;
  let recordingTicker = null;
  let recordingStartedAt = 0;
  let recording = false;
  let mediaRecorder = null;
  let mediaStream = null;
  let recordedChunks = [];
  let recordingReady = false;
  let voiceDiscard = false;
  let micPending = false;   // 麦克风权限申请中(可能弹权限框)
  let captureSeq = 0;
  let audioContext = null;
  let audioSourceNode = null;
  let audioProcessorNode = null;
  let rawChunks = [];
  let captureSampleRate = 0;
  let captureIsWav = false;
  let currentArtifact = "letter";
  let currentPreview = "";
  let drag = null;
  let toastTimer = null;
  let modeTimer = null;
  let lastCollected = null;
  let mattingDone = false;
  let cutoutUrl = "";
  let uploading = false;
  let pendingResult = null;
  let ttsTipTimer = null;
  let currentTtsText = "";
  let ttsAudio = null;
  const browserTtsSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const ttsSupported = browserTtsSupported || !!(API && API.speechTts);
  let ttsEnabled = ttsSupported && (() => {
    const stored = state.getAccount()?.preferences?.ttsEnabled;
    return stored !== false;
  })();

  const updateTtsControl = () => {
    screen.dataset.ttsMuted = String(!ttsEnabled);
    ttsToggle.setAttribute("aria-pressed", String(ttsEnabled));
    ttsToggle.setAttribute("aria-label", ttsEnabled ? "关闭 Wakey 朗读" : "开启 Wakey 朗读");
    ttsToggle.disabled = !ttsSupported;
  };
  const stopSpeech = () => {
    if (browserTtsSupported) window.speechSynthesis.cancel();
    if (ttsAudio) { try { ttsAudio.pause(); } catch (error) { /* 忽略 */ } ttsAudio.src = ""; ttsAudio = null; }
    delete screen.dataset.ttsSpeaking;
  };
  const showTtsIntro = () => {
    const seen = state.getAccount()?.preferences?.ttsIntroSeen === true;
    if (seen) return;
    ttsTip.hidden = false;
    state.updateAccount((account) => { account.preferences.ttsIntroSeen = true; });
    if (ttsTipTimer != null) window.clearTimeout(ttsTipTimer);
    ttsTipTimer = window.setTimeout(() => { ttsTip.hidden = true; ttsTipTimer = null; }, 3600);
  };
  const playBackendAudio = (url) => {
    const audio = new Audio(url);
    ttsAudio = audio;
    audio.addEventListener("play", () => { screen.dataset.ttsSpeaking = "true"; showTtsIntro(); });
    const clear = () => { delete screen.dataset.ttsSpeaking; if (ttsAudio === audio) ttsAudio = null; };
    audio.addEventListener("ended", clear);
    audio.addEventListener("error", clear);
    audio.play().catch(clear);
  };
  const speakBrowser = (text) => {
    if (!browserTtsSupported || !ttsEnabled || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.addEventListener("start", () => { screen.dataset.ttsSpeaking = "true"; showTtsIntro(); });
    utterance.addEventListener("end", () => { delete screen.dataset.ttsSpeaking; });
    utterance.addEventListener("error", () => { delete screen.dataset.ttsSpeaking; });
    window.speechSynthesis.speak(utterance);
  };
  const speakText = async (copy) => {
    const text = String(copy || "").trim();
    currentTtsText = text;
    stopSpeech();
    if (!ttsEnabled || text === "") return;
    if (uid && API && API.speechTts) {
      try {
        const res = await API.speechTts(text);
        if (currentTtsText !== text) return;
        const url = res && res.audio_url;
        if (url) { playBackendAudio(url); return; }
      } catch (error) { /* 回退浏览器朗读 */ }
    }
    if (currentTtsText !== text) return;
    speakBrowser(text);
  };
  const setTtsEnabled = (enabled) => {
    ttsEnabled = Boolean(enabled);
    state.updateAccount((account) => { account.preferences.ttsEnabled = ttsEnabled; });
    updateTtsControl();
    if (!ttsEnabled) {
      stopSpeech();
      ttsTip.hidden = true;
      if (ttsTipTimer != null) window.clearTimeout(ttsTipTimer);
      ttsTipTimer = null;
    }
    else if (currentTtsText !== "") speakText(currentTtsText);
  };

  const clearTimer = () => {
    if (timer != null) window.clearTimeout(timer);
    if (longWaitTimer != null) window.clearTimeout(longWaitTimer);
    timer = null;
    longWaitTimer = null;
  };
  const clearHold = () => { if (holdTimer != null) window.clearTimeout(holdTimer); holdTimer = null; };
  const clearHintReset = () => { if (hintResetTimer != null) window.clearTimeout(hintResetTimer); hintResetTimer = null; };
  const clearRecordingTicker = () => { if (recordingTicker != null) window.clearInterval(recordingTicker); recordingTicker = null; };
  const vibrate = (duration = 8) => {
    if (typeof navigator.vibrate === "function") navigator.vibrate(duration);
  };
  const formatRecordingTime = () => {
    const elapsed = Math.max(0, Math.floor((performance.now() - recordingStartedAt) / 1000));
    return "00:" + String(Math.min(elapsed, 59)).padStart(2, "0");
  };
  const updateRecordingHint = () => {
    hint.textContent = formatRecordingTime() + " · 再点一次发送";
  };
  const resetVoiceGesture = () => {
    clearHold();
    clearRecordingTicker();
    delete screen.dataset.voiceGesture;
    delete screen.dataset.recordingIntent;
    orb.style.removeProperty("transform");
  };
  const showTemporaryHint = (copy, delay = 1100) => {
    clearHintReset();
    hint.textContent = copy;
    hintResetTimer = window.setTimeout(() => {
      hintResetTimer = null;
      if (!recording && screen.dataset.inputMode === "voice") hint.textContent = labels.idle;
    }, delay);
  };
  const setOrb = (state) => {
    screen.dataset.orbState = state;
    orb.dataset.orbState = state;
    orb.setAttribute("aria-pressed", String(state !== "idle"));
    orb.setAttribute("aria-label", screen.dataset.inputMode === "text" ? "切回 Voice 语音模式" : labels[state]);
    const locked = screen.dataset.artifactActive === "true";
    orb.disabled = locked;
    close.disabled = locked || screen.dataset.inputMode === "text" || state === "recording" || state === "sending" || state === "thinking";
    hint.textContent = screen.dataset.inputMode === "text" ? "文字 · 输入内容后发送" : labels[state];
  };
  const setMirrorState = (state) => {
    mirror.dataset.mirrorState = state;
    mirrorStatus.textContent = state === "thinking" ? "Wakey 正在整理，下一句话会替换这里" : state === "listening" ? "我在听" : "屏幕上只留下此刻这一句话";
  };
  const setInteractionLocked = (locked) => {
    if (locked) screen.dataset.artifactActive = "true";
    else delete screen.dataset.artifactActive;
    orb.disabled = locked;
    close.disabled = locked || screen.dataset.inputMode === "text" || orb.dataset.orbState === "recording" || orb.dataset.orbState === "sending" || orb.dataset.orbState === "thinking";
    textInput.disabled = locked || screen.dataset.inputMode !== "text";
    textSend.disabled = locked || textInput.value.trim() === "";
  };
  const showMirror = () => {
    artifactStage.hidden = true;
    artifactFloat.hidden = true;
    mirror.hidden = false;
    setInteractionLocked(false);
  };
  const replaceReply = async (copy) => {
    showMirror();
    mirror.getAnimations().forEach((animation) => animation.cancel());
    if (!shared.reducedMotion()) {
      try {
        await mirror.animate(
          [{ opacity: 1, filter: "blur(0)", transform: "translateY(0)" }, { opacity: 0, filter: "blur(3px)", transform: "translateY(-5px)" }],
          { duration: 160, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" }
        ).finished;
      } catch (error) { /* A new answer may interrupt the old one. */ }
    }
    mirrorLabel.textContent = "Wakey · 回应已抵达";
    reply.textContent = copy;
    setMirrorState("ready");
    speakText(copy);
    if (!shared.reducedMotion()) mirror.animate(
      [{ opacity: 0, filter: "blur(3px)", transform: "translateY(6px)" }, { opacity: 1, filter: "blur(0)", transform: "translateY(0)" }],
      { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" }
    );
  };

  const presentArtifact = (type) => {
    const data = artifactData[type];
    if (data == null) return;
    clearTimer();
    stopSpeech();
    currentArtifact = type;
    currentArtifactTool = null;
    pendingFile = null;
    currentPreview = "";
    mirror.hidden = true;
    artifactFloat.hidden = true;
    artifactStage.hidden = false;
    artifactStage.dataset.artifactType = type;
    artifactStage.dataset.artifactRequired = String(data.required);
    artifactSymbol.innerHTML = icon[type];
    artifactKicker.textContent = data.kicker;
    artifactTitle.textContent = data.title;
    artifactCopy.textContent = data.copy;
    artifactAction.textContent = data.action;
    artifactDecline.textContent = data.decline;
    artifactDecline.hidden = data.required;
    setOrb("idle");
    setInteractionLocked(true);
    shared.setStatus("003 · Wakey 触发了" + (type === "letter" ? "一封信" : type === "object" ? "物件收藏" : "照片收藏"));
    if (!shared.reducedMotion()) artifactStage.animate(
      [{ opacity: 0, filter: "blur(5px)", transform: "translateY(8px) scale(.96)" }, { opacity: 1, filter: "blur(0)", transform: "translateY(0) scale(1)" }],
      { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" }
    );
    speakText(data.tts);
  };

  const continueAfterArtifact = (copy) => {
    showMirror();
    setOrb("speaking");
    replaceReply(copy);
    timer = window.setTimeout(() => setOrb("idle"), 1500);
  };

  const beginLongWait = () => {
    longWaitTimer = window.setTimeout(() => {
      longWaitTimer = null;
      mirrorStatus.textContent = "Wakey 还在整理，不用重复发送";
      hint.textContent = "仍在整理 · 不用重复发送";
    }, shared.reducedMotion() ? 20 : 2000);
  };
  const clearLongWait = () => { if (longWaitTimer != null) window.clearTimeout(longWaitTimer); longWaitTimer = null; };

  const placeholderReply = () => {
    setOrb("speaking");
    replaceReply("我听见你的声音了。语音转文字还在准备中，先用下面的文字输入和我说说，好吗？");
    timer = window.setTimeout(() => setOrb("idle"), 1600);
  };

  const deliver = async (source) => {
    if (interview.mode === "qna") { submitInterviewAnswer(String(source || "").trim()); return; }
    if (interview.mode !== "idle") return; // 访谈启动/生成中,不接普通对话
    if (awaitingRelationship) { inferRelationship(source); return; }
    if (!uid || !API || !API.chat) { placeholderReply(); return; }
    realChatDeliver(source);
  };

  const realChatDeliver = async (source) => {
    const text = String(source || "").trim();
    if (text === "" || text === "语音") { placeholderReply(); return; }
    clearTimer();
    setOrb("thinking");
    setMirrorState("thinking");
    beginLongWait();
    let res = null;
    try { res = await API.chat(uid, text, chatSessionId); }
    catch (error) { res = null; }
    clearLongWait();
    clearTimer();
    if (!res || typeof res.reply !== "string" || res.reply === "") {
      setOrb("speaking");
      replaceReply("我还在听，只是刚才有点走神，你能再说一句吗？");
      timer = window.setTimeout(() => setOrb("idle"), 1500);
      return;
    }
    setOrb("speaking");
    replaceReply(res.reply);
    if (res.tool) presentToolArtifact(res.tool);
    else timer = window.setTimeout(() => setOrb("idle"), shared.reducedMotion() ? 40 : 1500);
  };

  const presentToolArtifact = (tool) => {
    const type = (tool && tool.type) === "photo_upload" ? "photo" : "object";
    presentArtifact(type);
    currentArtifactTool = tool || null;
  };

  // ---- 内嵌访谈(复用魔镜界面,走 /interview/*,替代旧 025 独立页) ----
  const mapLossType = (relationshipType) => (
    relationshipType === "relative" ? "loved_one" : (relationshipType === "pet" ? "pet" : "breakup")
  );

  const enterInterview = (question, dimension) => {
    interview.mode = "qna";
    showMirror();
    mirrorLabel.textContent = dimension ? ("Wakey · " + dimension) : "Wakey · 想听你说";
    reply.textContent = question || "…";
    setMirrorState("ready");
    setOrb("idle");
    hint.textContent = screen.dataset.inputMode === "text"
      ? "访谈中 · 文字回答，回车发送"
      : "访谈中 · 点按球体录音，再点一次发送";
    if (kicker != null) kicker.textContent = "Wakey · 初次访谈";
  };

  const startInterview = async (lossType, firstAnswer = "") => {
    if (!API || !uid) return;
    interview.mode = "starting";
    setOrb("thinking");
    setMirrorState("thinking");
    try {
      const res = await API.interviewStart(uid, lossType);
      interview.sessionId = res.session_id;
      interview.lossType = res.loss_type;
      if (firstAnswer && String(firstAnswer).trim() !== "") {
        // 复用首答:把「TA 是谁」的回答直接作为访谈第一答,跳过重复的对象维度提问。
        await submitInterviewAnswer(String(firstAnswer).trim());
      } else {
        enterInterview(res.question, null);
      }
    } catch (error) {
      interview.mode = "idle";
      setOrb("idle");
      setMirrorState("ready");
      shared.setStatus("访谈开始失败 · " + error.message);
    }
  };

  const submitInterviewAnswer = async (answer) => {
    if (!API || !interview.sessionId) return;
    interview.mode = "generating";
    setOrb("thinking");
    setMirrorState("thinking");
    try {
      const res = await API.interviewAnswer(interview.sessionId, answer);
      if (res.action === "complete" || res.action === "done") {
        await pollReport();
      } else {
        enterInterview(res.question, res.dimension);
      }
    } catch (error) {
      interview.mode = "qna";
      setOrb("idle");
      setMirrorState("ready");
      shared.setStatus("回答发送失败 · " + error.message);
    }
  };

  const goReport = () => {
    navigate("004-report-board.html?from=interview", {
      exitState: "interview",
      delay: 260,
      status: "访谈已完成 · 打开你的初次报告",
    });
  };

  const pollReport = async () => {
    interview.mode = "generating";
    mirrorLabel.textContent = "Wakey · 正在整理你的报告";
    reply.textContent = "需要一点点时间，把刚才的话整理成一份属于你的报告…";
    setMirrorState("thinking");
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 40; i++) {
      await wait(1500);
      try {
        const st = await API.interviewState(interview.sessionId);
        if (st && st.report_ready) { goReport(); return; }
      } catch (error) { /* 后台可能仍在生成，继续轮询 */ }
    }
    goReport(); // 兜底：超时也进报告页，由 004 拉取
  };

  // 重进 003 时若首份报告未生成,优先续接进行中的访谈/报告,否则新开。
  const resumeOrStartInterview = async (relationshipType) => {
    const lossType = mapLossType(relationshipType);
    if (API && uid && API.onboarding) {
      try {
        const onb = await API.onboarding(uid);
        if (onb.phase === "interview" && onb.interview && onb.interview.session_id) {
          interview.sessionId = onb.interview.session_id;
          enterInterview(onb.interview.question, onb.interview.dimension);
          return;
        }
        if (onb.phase === "report") { goReport(); return; }
      } catch (error) { /* 落到新开 */ }
    }
    await startInterview(lossType);
  };

  const afterRelationship = () => {
    awaitingRelationship = false;
    const journey = state.getCurrentJourney();
    if (!journey || !journey.relationshipType) return;
    if (journey.firstReportStatus !== "pinned") { startInterview(mapLossType(journey.relationshipType), relationshipAnswer); return; }
    const rt = journey.relationshipType;
    setOrb("speaking");
    replaceReply(rt === "pet" ? "我明白了，它是你牵挂的小家伙。" : rt === "relative" ? "我懂了，TA 是你心里放不下的人。" : "我懂了，这段感情，你还没舍得放下。");
    timer = window.setTimeout(() => setOrb("idle"), 1500);
  };

  // 「Ta 是谁」关系类型推断:首问后把回答送 /relationship/infer,高置信度静默采用,否则弹窗兜底。
  const inferRelationship = async (answer) => {
    const text = String(answer || "").trim();
    if (text === "" || text === "语音") { showRelationshipPicker(); return; }
    relationshipAnswer = text;
    setOrb("thinking");
    setMirrorState("thinking");
    let result = null;
    if (API && API.relationshipInfer) {
      try { result = await API.relationshipInfer(text); } catch (error) { result = null; }
    }
    if (result && result.adopted && result.relationship_type) {
      await state.refresh();
      afterRelationship();
    } else {
      showRelationshipPicker();
    }
  };

  const showRelationshipPicker = () => {
    if (relationshipPicker == null) return;
    stopSpeech();
    setOrb("idle");
    relationshipPicker.hidden = false;
    relationshipPicker.setAttribute("aria-hidden", "false");
    shared.setStatus("003 · 推断未把握，请你确认这段陪伴是关于谁的");
  };

  const chooseRelationship = async (option) => {
    if (relationshipPicker != null) { relationshipPicker.hidden = true; relationshipPicker.setAttribute("aria-hidden", "true"); }
    setOrb("thinking");
    setMirrorState("thinking");
    try { await state.setRelationshipType(option); } catch (error) { /* 落到 refresh 兜底 */ }
    await state.refresh();
    afterRelationship();
  };
  relationshipOptions.forEach((button) => button.addEventListener("click", () => chooseRelationship(button.dataset.relationshipOption)));

  const setMode = (mode) => {
    if (screen.dataset.artifactActive === "true") return;
    const isText = mode === "text";
    if (isText) stopSpeech();
    const wasText = screen.dataset.inputMode === "text";
    if (modeTimer != null) window.clearTimeout(modeTimer);
    delete screen.dataset.inputTransition;
    if (!isText && wasText) {
      screen.dataset.inputTransition = "to-voice";
      modeTimer = window.setTimeout(() => {
        delete screen.dataset.inputTransition;
        modeTimer = null;
      }, shared.reducedMotion() ? 0 : 360);
    }
    screen.dataset.inputMode = isText ? "text" : "voice";
    textComposer.setAttribute("aria-hidden", String(!isText));
    textInput.disabled = !isText;
    close.disabled = isText;
    setOrb("idle");
    if (isText) {
      window.setTimeout(() => textInput.focus({ preventScroll: true }), shared.reducedMotion() ? 0 : 180);
    }
  };

  // 把多段 Float32 PCM 合并并降采样到 16kHz(近邻采样,语音 ASR 足够)。
  const downsamplePcm = (chunks, fromRate, toRate) => {
    let total = 0;
    for (const chunk of chunks) total += chunk.length;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    if (!fromRate || fromRate <= toRate) return merged;
    const ratio = fromRate / toRate;
    const out = new Float32Array(Math.floor(total / ratio));
    for (let i = 0; i < out.length; i++) out[i] = merged[Math.floor(i * ratio)];
    return out;
  };

  // 16kHz 单声道 PCM16 → WAV Blob(与后端验证过的探针格式一致,腾讯 ASR 只认 WAV)。
  const encodeWavPcm16 = (samples, sampleRate) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  };

  const releaseMedia = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => { try { track.stop(); } catch (error) { /* 忽略 */ } });
      mediaStream = null;
    }
    mediaRecorder = null;
    if (audioProcessorNode) { try { audioProcessorNode.disconnect(); } catch (error) { /* 忽略 */ } }
    if (audioSourceNode) { try { audioSourceNode.disconnect(); } catch (error) { /* 忽略 */ } }
    if (audioContext) { try { audioContext.close(); } catch (error) { /* 忽略 */ } }
    audioProcessorNode = null;
    audioSourceNode = null;
    audioContext = null;
  };

  // 用 Web Audio 采 PCM(原始 Float32 分段),为后续转 16kHz WAV 做准备。
  const startPcmCapture = (stream, AudioCtx) => {
    const ctx = new AudioCtx();
    audioContext = ctx;
    const source = ctx.createMediaStreamSource(stream);
    audioSourceNode = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    audioProcessorNode = processor;
    processor.onaudioprocess = (event) => {
      rawChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (error) { /* 忽略 */ } }
    captureSampleRate = ctx.sampleRate;
    captureIsWav = true;
    recordingReady = true;
  };

  // 开始采集麦克风(异步授权);优先 Web Audio 采 PCM(转 16kHz WAV 给 ASR),回退 MediaRecorder。
  const beginMediaCapture = async () => {
    recordedChunks = [];
    rawChunks = [];
    recordingReady = false;
    voiceDiscard = false;
    captureIsWav = false;
    captureSampleRate = 0;
    releaseMedia();
    const seq = ++captureSeq;
    if (!API || !API.speechRecognize) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
    micPending = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (seq === captureSeq) micPending = false;
      if (seq !== captureSeq || !recording) {
        stream.getTracks().forEach((track) => { try { track.stop(); } catch (error) { /* 忽略 */ } });
        return;
      }
      mediaStream = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && typeof AudioCtx.prototype.createScriptProcessor === "function") {
        startPcmCapture(stream, AudioCtx);
      } else if (window.MediaRecorder) {
        const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
        const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        rec.addEventListener("dataavailable", (event) => {
          if (event.data && event.data.size > 0) recordedChunks.push(event.data);
        });
        rec.addEventListener("stop", handleVoiceStop);
        rec.start();
        mediaRecorder = rec;
        recordingReady = true;
      } else {
        stream.getTracks().forEach((track) => { try { track.stop(); } catch (error) { /* 忽略 */ } });
      }
    } catch (error) {
      if (seq === captureSeq) micPending = false;
      if (seq !== captureSeq) return;
      recordingReady = false;
      releaseMedia();
    }
  };

  const handleVoiceStop = () => {
    const discard = voiceDiscard;
    voiceDiscard = false;
    const wasWav = captureIsWav;
    const wavChunks = rawChunks.slice();
    const wavRate = captureSampleRate;
    const mimeType = mediaRecorder ? mediaRecorder.mimeType : "";
    const chunks = recordedChunks.slice();
    rawChunks = [];
    recordedChunks = [];
    releaseMedia();
    recordingReady = false;
    if (discard) return;
    if (wasWav) {
      if (wavChunks.length === 0) return;
      const pcm = downsamplePcm(wavChunks, wavRate, 16000);
      transcribeVoice(encodeWavPcm16(pcm, 16000), "voice.wav");
      return;
    }
    if (chunks.length === 0) return;
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    transcribeVoice(new Blob(chunks, { type: mimeType || "audio/webm" }), "voice." + ext);
  };

  const transcribeVoice = async (blob, filename) => {
    let text = "";
    try {
      const result = await API.speechRecognize(blob, filename);
      text = String((result && result.text) || "").trim();
    } catch (error) {
      text = "";
    }
    if (text === "") {
      setOrb("speaking");
      showTemporaryHint("没听清，改用文字输入告诉我吧");
      timer = window.setTimeout(() => deliver("语音"), shared.reducedMotion() ? 20 : 360);
      return;
    }
    deliver(text);
  };

  const stopMediaCapture = () => {
    if (captureIsWav) { handleVoiceStop(); return; }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try { mediaRecorder.stop(); } catch (error) { releaseMedia(); }
    } else {
      releaseMedia();
    }
  };

  const startRecording = () => {
    if (recording || screen.dataset.inputMode !== "voice" || orb.dataset.orbState !== "idle") return;
    recording = true;
    stopSpeech();
    recordingStartedAt = performance.now();
    screen.dataset.voiceGesture = "recording";
    setOrb("recording");
    setMirrorState("listening");
    updateRecordingHint();
    recordingTicker = window.setInterval(updateRecordingHint, 250);
    vibrate(10);
    beginMediaCapture();
  };
  const finishRecording = () => {
    clearHold();
    if (!recording) return;
    // 麦克风权限框仍在申请中(用户刚去点了「允许」):不结束录音,等权限就绪后再点一次球体发送。
    if (micPending) {
      hint.textContent = "麦克风权限已请求 · 允许后再点一次球体发送";
      return;
    }
    const wasReady = recordingReady;
    recording = false;
    voiceDiscard = !wasReady;
    captureSeq++;
    resetVoiceGesture();
    stopMediaCapture();
    setOrb("sending");
    setMirrorState("thinking");
    if (!wasReady) {
      timer = window.setTimeout(() => deliver("语音"), shared.reducedMotion() ? 20 : 360);
    }
  };

  const showFloating = (kind, imageUrl = "") => {
    clearTimer();
    stopSpeech();
    currentArtifact = kind;
    currentPreview = imageUrl;
    mattingDone = false;
    cutoutUrl = "";
    pendingResult = null;
    uploading = false;
    artifactStage.hidden = true;
    mirror.hidden = true;
    artifactFloat.hidden = false;
    artifactFloat.dataset.kind = kind;
    setFloatState("preview");
    artifactFloat.style.transform = "translateY(0) scale(1)";
    artifactFloat.style.opacity = "1";
    portal.classList.remove("is-visible");
    setInteractionLocked(true);
    if (imageUrl !== "") artifactFloatObject.innerHTML = '<img alt="刚刚选择的照片" src="' + imageUrl.replace(/"/g, "&quot;") + '">';
    else artifactFloatObject.textContent = kind === "object" ? "一件被认真留下的物件" : "一张想要记住的照片";
  };

  const runUpload = async () => {
    // 上传并处理(物件:识别+裁切+抠图;照片:整图)。成功返回 {backendId, backendPreview};校验不通过返回 {failed, reason};否则 null。
    if (!uid || !API || !currentArtifactTool || !pendingFile) return null;
    const collectedType = currentArtifact;
    try {
      if (collectedType === "photo" && API.photoUpload) {
        const up = await API.photoUpload(uid, currentArtifactTool.photo_title || "这一刻", currentArtifactTool.scene_description || "", pendingFile);
        if (up && (up.photo_id || up.id)) return { backendId: up.photo_id || up.id, backendPreview: up.photo_url || "" };
      } else if (API.itemUpload) {
        const up = await API.itemUpload(uid, currentArtifactTool.intent || "keep", currentArtifactTool.item_name || "这件物品", currentArtifactTool.item_description || "", pendingFile);
        if (up && (up.item_id || up.id)) return { backendId: up.item_id || up.id, backendPreview: up.cutout_url || "" };
        if (up && up.ok === false) return { failed: true, reason: up.reason || "" };
      }
    } catch (error) { /* 网络/后端失败 */ }
    return null;
  };

  const setFloatState = (stateName) => {
    artifactFloat.dataset.state = stateName;
    if (stateName === "matting") {
      artifactFloatLoading.hidden = false;
      artifactFloatHint.textContent = "Wakey 正在抠图，稍等一下…";
    } else {
      artifactFloatLoading.hidden = true;
      artifactFloatHint.textContent = stateName === "cutout" ? "向上滑，存入看板" : "向上滑，收进时间看板";
    }
  };

  const renderCutout = (url) => {
    artifactFloatObject.innerHTML = '<img alt="抠好的物品" src="' + String(url).replace(/"/g, "&quot;") + '">';
  };

  // 物件两段式:第一段上滑 → 上传+抠图(保持加载界面);抠图完成后第二段上滑 → 存入看板。
  const startObjectMatting = async () => {
    if (uploading) return;
    uploading = true;
    portal.classList.remove("is-visible");
    // 结束上滑拖拽,回到中心再进入加载态,避免加载态停在拖拽偏移位置。
    artifactFloat.style.transition = "transform 260ms cubic-bezier(0.23, 1, 0.32, 1)";
    artifactFloat.style.transform = "translateY(0) scale(1)";
    window.setTimeout(() => { artifactFloat.style.transition = ""; }, 280);
    setFloatState("matting");
    const result = await runUpload();
    uploading = false;
    if (result && result.backendPreview) {
      pendingResult = result;
      mattingDone = true;
      cutoutUrl = result.backendPreview;
      renderCutout(result.backendPreview);
      setFloatState("cutout");
    } else {
      mattingDone = false;
      pendingResult = null;
      setFloatState("preview");
      const reason = (result && result.failed) ? result.reason : "";
      showTemporaryHint(reason || "没抠出来，换一张更清晰、主体更明显的照片再试试");
    }
  };

  const finalizeCollect = async (result) => {
    const collectedType = currentArtifact;
    const backendId = result ? result.backendId : null;
    const backendPreview = result ? result.backendPreview : "";
    currentArtifactTool = null;
    pendingFile = null;
    pendingResult = null;
    mattingDone = false;
    cutoutUrl = "";
    portal.classList.add("is-visible");
    const item = { id: String(Date.now()), type: collectedType, createdAt: new Date().toISOString(), source: "Wakey 触发", preview: backendPreview || "" };
    if (backendId) item.backendId = backendId;
    lastCollected = { ...item, preview: backendPreview || currentPreview };
    // 上传成功:物件/照片已进后端 item/photo 表,由看板/档案读回;上传失败不落任何本地数据。
    if (!shared.reducedMotion()) {
      try { await artifactFloat.animate(
        [{ opacity: 1, transform: artifactFloat.style.transform || "translateY(0) scale(1)" }, { opacity: .7, transform: "translateY(-38%) scale(.82)" }, { opacity: 0, transform: "translateY(-118%) scale(.48)" }],
        { duration: 520, easing: "cubic-bezier(0.77, 0, 0.175, 1)", fill: "forwards" }
      ).finished; } catch (error) { /* Gesture can be interrupted. */ }
    }
    artifactFloat.hidden = true;
    portal.classList.remove("is-visible");
    toast.hidden = false;
    if (toastTimer != null) window.clearTimeout(toastTimer);
    continueAfterArtifact(collectedType === "object" ? "我帮你把它收好了。我们继续说刚才的事。" : "这一刻已经替你留下。你想继续说什么，我还在听。" );
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3600);
  };

  const collect = async () => {
    // 照片:单步上传并收进看板;物件走两段式(startObjectMatting → commitCutout)。
    portal.classList.add("is-visible");
    const result = await runUpload();
    await finalizeCollect(result);
  };

  const commitCutout = () => { finalizeCollect(pendingResult); };

  artifactAction.addEventListener("click", async () => {
    if (currentArtifact === "letter") {
      // 等 first_letter_status 落库后再跳转,避免 004 的 requireLetter 读到旧值被弹回。
      await state.updateCurrentJourney((journey) => { journey.firstLetterStatus = "opened"; });
      stopSpeech();
      navigate("004-report-board.html?from=voice&letterOpened=1", { exitState: "voice", delay: 260, status: "信封正在打开" });
      return;
    }
    stopSpeech();
    artifactFile.value = "";
    artifactFile.click();
  });
  artifactDecline.addEventListener("click", () => {
    if (currentArtifact === "letter") return;
    continueAfterArtifact("好，这次不留下。我们继续聊刚才的事。" );
  });
  artifactFile.addEventListener("change", () => {
    const file = artifactFile.files?.[0];
    if (file == null) return;
    pendingFile = file;
    const reader = new FileReader();
    reader.addEventListener("load", () => showFloating(currentArtifact, String(reader.result || "")));
    reader.readAsDataURL(file);
  });

  artifactFloat.addEventListener("pointerdown", (event) => {
    if (drag != null || uploading) return;
    drag = { id: event.pointerId, startY: event.clientY, lastY: event.clientY, lastAt: performance.now(), velocity: 0 };
    artifactFloat.classList.add("is-dragging");
    try { artifactFloat.setPointerCapture(event.pointerId); } catch (error) { /* Native tracking remains. */ }
  });
  artifactFloat.addEventListener("pointermove", (event) => {
    if (drag == null || drag.id !== event.pointerId) return;
    const now = performance.now();
    const delta = Math.min(18, Math.max(-160, event.clientY - drag.startY));
    drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastAt);
    drag.lastY = event.clientY;
    drag.lastAt = now;
    artifactFloat.style.transform = "translateY(" + String(delta) + "px) scale(" + String(1 + Math.min(0, delta) / 900) + ")";
    portal.classList.toggle("is-visible", delta < -34);
  });
  const endDrag = (event) => {
    if (drag == null || drag.id !== event.pointerId) return;
    const distance = event.clientY - drag.startY;
    const shouldCollect = distance < -72 || drag.velocity < -0.11;
    drag = null;
    artifactFloat.classList.remove("is-dragging");
    if (shouldCollect) {
      if (currentArtifact === "object") {
        if (mattingDone) commitCutout();
        else startObjectMatting();
      } else {
        collect();
      }
    } else {
      portal.classList.remove("is-visible");
      artifactFloat.style.transition = "transform 260ms cubic-bezier(0.23, 1, 0.32, 1)";
      artifactFloat.style.transform = "translateY(0) scale(1)";
      window.setTimeout(() => { artifactFloat.style.transition = ""; }, 280);
    }
  };
  artifactFloat.addEventListener("pointerup", endDrag);
  artifactFloat.addEventListener("pointercancel", endDrag);
  undo.addEventListener("click", () => {
    if (lastCollected == null) return;
    toast.hidden = true;
    showFloating(lastCollected.type, lastCollected.preview || "");
    lastCollected = null;
  });

  const syncTextState = () => {
    const hasText = textInput.value.trim() !== "";
    textSend.disabled = screen.dataset.artifactActive === "true" || !hasText;
    textComposer.dataset.hasText = String(hasText);
    if (screen.dataset.inputMode === "text") {
      hint.textContent = hasText ? "文字 · 点击箭头或键盘发送" : "文字 · 输入内容后发送";
    }
  };
  const sendText = () => {
    const source = textInput.value.trim();
    if (source === "") return;
    textInput.value = "";
    syncTextState();
    setMode("voice");
    deliver(source);
  };

  close.addEventListener("click", () => setMode("text"));
  ttsToggle.addEventListener("click", () => setTtsEnabled(!ttsEnabled));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSpeech();
  });
  window.addEventListener("pagehide", () => {
    stopSpeech();
    clearChatSession();
  });
  orb.addEventListener("click", () => {
    if (screen.dataset.inputMode === "text") { setMode("voice"); return; }
    if (recording) finishRecording();
    else startRecording();
  });
  // 阻止长按弹出系统图片菜单(保存/选择 Voice 球图片),避免打断点按录音。
  orb.addEventListener("contextmenu", (event) => event.preventDefault());
  orb.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat) return;
    if (recording) finishRecording();
    else startRecording();
  });
  textInput.addEventListener("input", syncTextState);
  textInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || textInput.value.trim() === "") return;
    event.preventDefault();
    sendText();
  });
  textSend.addEventListener("click", sendText);
  const pageEntry = shared.pageEntry || params.get("from") || "";
  const returnableEntries = new Set(["home", "home-voice", "home-tip", "report", "history", "event", "archive"]);
  const canReturnHome = returnableEntries.has(pageEntry);
  home.hidden = !canReturnHome;
  home.setAttribute("aria-hidden", String(!canReturnHome));
  home.addEventListener("click", () => {
    if (!canReturnHome) return;
    navigate("005-home.html?from=voice", { exitState: "voice-home", delay: 240, status: "返回首页" });
  });

  setMode("voice");
  syncTextState();
  setMirrorState("ready");
  updateTtsControl();
  const initializeEntry = () => {
    const journey = state.getCurrentJourney();
    const relationshipType = journey?.relationshipType;
    if (relationshipType == null) {
      awaitingRelationship = true;
      reply.textContent = "先跟我聊聊 TA 吧——TA 是你什么人，叫什么（昵称也可以）？";
      speakText(reply.textContent);
      return;
    }
    if (relationshipType != null && journey.firstReportStatus !== "pinned") {
      resumeOrStartInterview(relationshipType);
      return;
    }
    if (relationshipType === "pet") reply.textContent = "最近，你最常想起它的哪一个瞬间";
    else if (relationshipType === "relative") reply.textContent = "最近，哪一段记忆最常回到你心里";
    else if (relationshipType === "breakup") reply.textContent = "最近，是什么让你有些放不下";
    const trigger = params.get("trigger");
    if (artifactData[trigger] != null) presentArtifact(trigger);
    else if (params.get("autoReply") === "1") timer = window.setTimeout(() => deliver(params.get("topic") || "语音"), shared.reducedMotion() ? 20 : 220);
  };
  initializeEntry();
})();
