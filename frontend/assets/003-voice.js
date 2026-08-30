(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  if (root == null) return;

  const phone = root.querySelector(".ma-letter-phone");
  const voiceScreen = root.querySelector(".ma-voice-screen");
  const mirror = root.querySelector("[data-voice-mirror]");
  const mirrorLabel = root.querySelector("[data-mirror-label]");
  const currentReply = root.querySelector("[data-current-reply]");
  const mirrorStatus = root.querySelector("[data-mirror-status]");
  const voiceOrb = root.querySelector(".ma-voice-orb");
  const voiceClose = root.querySelector(".ma-voice-close");
  const textComposer = root.querySelector(".ma-voice-text-composer");
  const textInput = root.querySelector("#ma-voice-text-input");
  const voiceHint = root.querySelector(".ma-voice-mode-hint");
  const homeReturn = root.querySelector(".ma-voice-home-return");
  const handoff = root.parentElement?.parentElement?.querySelector(".ma-page-handoff");
  const handoffLink = handoff?.querySelector(".ma-standalone-next");
  const shared = window.MakeAgainShared;
  if (
    phone == null || voiceScreen == null || mirror == null || mirrorLabel == null || currentReply == null ||
    mirrorStatus == null || voiceOrb == null || voiceClose == null || textComposer == null || textInput == null ||
    voiceHint == null || homeReturn == null || shared == null
  ) return;

  let voiceTimer = null;
  let voiceHoldTimer = null;
  let voiceModeTimer = null;
  let voicePointerActive = false;
  let voiceKeyboardActive = false;
  let voicePointerId = null;
  let responseTurn = 0;

  const labels = {
    idle: "Voice · 长按球体录音，松开发送",
    recording: "正在录音 · 松开发送",
    sending: "语音已收到 · 正在送给 Wakey",
    thinking: "Wakey 正在整理 · 回答会整句出现",
    speaking: "回应已到达 · 此刻只留下这一句",
  };

  const replies = [
    "你不需要立刻放下，先允许自己承认舍不得。",
    "那些反复想起的事，也许只是在等你认真地听完自己。",
    "我听见了，你不必急着整理好，再慢慢说一点也可以。",
  ];

  const clearVoiceTimer = () => {
    if (voiceTimer != null) window.clearTimeout(voiceTimer);
    voiceTimer = null;
  };

  const clearVoiceHold = () => {
    if (voiceHoldTimer != null) window.clearTimeout(voiceHoldTimer);
    voiceHoldTimer = null;
  };

  const clearVoiceModeTransition = () => {
    if (voiceModeTimer != null) window.clearTimeout(voiceModeTimer);
    voiceModeTimer = null;
    voiceScreen.removeAttribute("data-input-transition");
  };

  const setVoiceMode = (mode, transition = "none") => {
    clearVoiceModeTransition();
    const textMode = mode === "text";
    voiceScreen.dataset.inputMode = textMode ? "text" : "voice";
    if (transition === "to-voice" && !shared.reducedMotion()) {
      voiceScreen.dataset.inputTransition = "to-voice";
      voiceModeTimer = window.setTimeout(() => {
        voiceModeTimer = null;
        voiceScreen.removeAttribute("data-input-transition");
      }, 260);
    }
    textComposer.setAttribute("aria-hidden", String(!textMode));
    textInput.disabled = !textMode;
    voiceOrb.disabled = false;
    voiceClose.disabled = textMode;
    voiceHint.textContent = textMode ? "文字 · 输入你想说的…" : labels.idle;
  };

  const setOrbState = (state) => {
    const nextState = labels[state] == null ? "idle" : state;
    voiceScreen.dataset.orbState = nextState;
    voiceOrb.dataset.orbState = nextState;
    voiceOrb.setAttribute("aria-pressed", String(nextState !== "idle"));
    voiceOrb.setAttribute("aria-label", voiceScreen.dataset.inputMode === "text" ? "切回 Voice 语音模式" : "Voice 球，" + labels[nextState]);
    if (voiceScreen.dataset.inputMode !== "text") voiceHint.textContent = labels[nextState];
  };

  const setMirrorState = (state) => {
    mirror.dataset.mirrorState = state;
    const status = {
      ready: "屏幕上只留下此刻这一句话",
      listening: "我在听，当前这句话会暂时留在这里",
      thinking: "Wakey 正在整理，下一句话会替换这里",
    };
    mirrorStatus.textContent = status[state] || status.ready;
  };

  const replaceCurrentReply = async (copy, label = "Wakey · 回应已抵达") => {
    mirror.getAnimations().forEach((animation) => animation.cancel());
    if (shared.reducedMotion()) {
      mirrorLabel.textContent = label;
      currentReply.textContent = copy;
      setMirrorState("ready");
      return;
    }
    try {
      const outgoing = mirror.animate(
        [{ opacity: 1, filter: "blur(0)", transform: "translateY(0) scale(1)" }, { opacity: 0, filter: "blur(6px)", transform: "translateY(-6px) scale(0.98)" }],
        { duration: 140, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" }
      );
      await outgoing.finished;
    } catch (error) {
      // A newer response may interrupt this one; continue from the live state.
    }
    mirrorLabel.textContent = label;
    currentReply.textContent = copy;
    setMirrorState("ready");
    mirror.animate(
      [{ opacity: 0, filter: "blur(6px)", transform: "translateY(7px) scale(0.98)" }, { opacity: 1, filter: "blur(0)", transform: "translateY(0) scale(1)" }],
      { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "both" }
    );
  };

  const responseFor = (source = "") => {
    if (source.includes("语音")) return replies[2];
    if (source.includes("想起") || source.includes("话想说")) return replies[1];
    const reply = replies[responseTurn % replies.length];
    responseTurn += 1;
    return reply;
  };

  const deliverReply = (source = "") => {
    setOrbState("thinking");
    setMirrorState("thinking");
    shared.setStatus("003 Voice · Wakey 正在整理 · 当前句即将被替换");
    voiceTimer = window.setTimeout(() => {
      setOrbState("speaking");
      replaceCurrentReply(responseFor(source));
      shared.setStatus("003 Voice · 新回复已替换上一句 · 屏幕只显示当前一句");
      voiceTimer = window.setTimeout(() => {
        setOrbState("idle");
        if (handoff != null) handoff.hidden = false;
      }, 2200);
    }, shared.reducedMotion() ? 40 : 780);
  };

  const sendRecordedVoice = () => {
    if (voiceScreen.dataset.inputMode !== "voice") return;
    voicePointerActive = false;
    voiceKeyboardActive = false;
    clearVoiceTimer();
    setOrbState("sending");
    setMirrorState("thinking");
    shared.setStatus("003 Voice · 语音已收到 · 正在交给 Wakey");
    voiceTimer = window.setTimeout(() => deliverReply("语音"), shared.reducedMotion() ? 20 : 420);
  };

  const startRecording = (event) => {
    if (phone.dataset.transitionState !== "voice" || voiceScreen.dataset.inputMode !== "voice" || voiceOrb.disabled || voiceOrb.dataset.orbState !== "idle") return;
    clearVoiceTimer();
    setOrbState("recording");
    setMirrorState("listening");
    shared.setStatus("Voice · 正在录音 · 松开球体发送");
    if (event?.pointerId != null) {
      voicePointerActive = true;
      voicePointerId = event.pointerId;
      try { voiceOrb.setPointerCapture(event.pointerId); } catch (error) { /* Embedded previews may not expose pointer capture. */ }
    } else {
      voiceKeyboardActive = true;
    }
  };

  const cancelRecording = (event) => {
    clearVoiceHold();
    if (!voicePointerActive && !voiceKeyboardActive) return;
    voicePointerActive = false;
    voiceKeyboardActive = false;
    if (event?.pointerId != null && voicePointerId === event.pointerId) {
      try { voiceOrb.releasePointerCapture(event.pointerId); } catch (error) { /* Pointer may already be released. */ }
    }
    voicePointerId = null;
    setOrbState("idle");
    setMirrorState("ready");
    shared.setStatus("003 Voice · 录音已取消");
  };

  const finishRecording = (event) => {
    clearVoiceHold();
    if (!voicePointerActive && !voiceKeyboardActive) return;
    if (event?.pointerId != null && voicePointerId !== event.pointerId) return;
    voicePointerActive = false;
    voiceKeyboardActive = false;
    voicePointerId = null;
    if (event?.pointerId != null) {
      try { voiceOrb.releasePointerCapture(event.pointerId); } catch (error) { /* Pointer may already be released. */ }
    }
    sendRecordedVoice();
  };

  const returnToVoiceMode = () => {
    if (phone.dataset.transitionState !== "voice" || voiceScreen.dataset.inputMode !== "text") return;
    clearVoiceTimer();
    setVoiceMode("voice", "to-voice");
    setOrbState("idle");
    shared.setStatus("003 Voice · 已切回语音模式");
  };

  voiceClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (voiceScreen.dataset.inputMode !== "voice") return;
    clearVoiceHold();
    clearVoiceTimer();
    setVoiceMode("text");
    setOrbState("idle");
    shared.setStatus("003 文字输入 · 点击小球可切回 Voice");
  });

  voiceOrb.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (voiceScreen.dataset.inputMode === "text" || phone.dataset.transitionState !== "voice" || voiceOrb.disabled || voiceOrb.dataset.orbState !== "idle") return;
    clearVoiceHold();
    const pointerId = event.pointerId;
    voiceHoldTimer = window.setTimeout(() => {
      voiceHoldTimer = null;
      startRecording({ pointerId });
    }, 180);
  });
  voiceOrb.addEventListener("pointerup", (event) => { event.preventDefault(); finishRecording(event); });
  voiceOrb.addEventListener("pointercancel", cancelRecording);
  voiceOrb.addEventListener("lostpointercapture", (event) => { if (voicePointerActive) cancelRecording(event); });
  voiceOrb.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!voiceKeyboardActive) startRecording();
  });
  voiceOrb.addEventListener("keyup", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    finishRecording();
  });
  voiceOrb.addEventListener("blur", () => { if (voiceKeyboardActive) cancelRecording(); });
  voiceOrb.addEventListener("click", returnToVoiceMode);

  textInput.addEventListener("input", () => {
    const length = textInput.value.trim().length;
    voiceHint.textContent = length > 0 ? "文字 · 已输入 " + String(length) + " 字 · 回车发送" : "文字 · 输入你想说的…";
  });
  textInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || textInput.value.trim() === "") return;
    event.preventDefault();
    const copy = textInput.value.trim();
    textInput.value = "";
    deliverReply(copy);
  });

  homeReturn.addEventListener("click", () => {
    if (!shared.pageEntry.startsWith("home")) return;
    clearVoiceHold();
    clearVoiceTimer();
    shared.nextPage("005-home.html?from=voice", { exitState: "voice-home", delay: 280, status: "魔镜正在收拢 · 返回 Make Again 主页" });
  });

  handoffLink?.addEventListener("click", (event) => {
    event.preventDefault();
    if (phone.dataset.transitionState !== "voice") return;
    shared.nextPage("004-report-board.html?from=voice", { exitState: "voice", delay: 560, status: "当前回应正在收进时间线 · 初次报告即将抵达" });
  });

  setVoiceMode("voice");
  setOrbState("idle");
  setMirrorState("ready");
  const pageParams = new URL(window.location.href).searchParams;
  const enteredFromHome = shared.pageEntry.startsWith("home");
  const requestedTopic = pageParams.get("topic") || "";
  const autoReply = pageParams.get("autoReply") === "1";
  homeReturn.hidden = !enteredFromHome;
  if (shared.pageEntry === "report") {
    mirrorLabel.textContent = "Wakey · 继续告诉我";
    currentReply.textContent = "哪一句不像你，我们就从那里重新认识。";
  } else if (enteredFromHome && requestedTopic !== "" && autoReply) {
    setMirrorState("thinking");
    voiceTimer = window.setTimeout(() => deliverReply(requestedTopic), shared.reducedMotion() ? 20 : 260);
  }
  if (handoff != null) handoff.hidden = true;
})();
