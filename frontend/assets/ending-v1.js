(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  if (root == null || shared == null || state == null) return;

  const reduce = shared.reducedMotion;
  const params = new URL(window.location.href).searchParams;
  const API = window.MakeAgainAPI;
  const uid = API && API.getUserId ? API.getUserId() : null;
  const endingPage = root.dataset.endingPage || "";
  if (["confirm", "call", "message"].includes(endingPage)) {
    const guard = state.activeGuard({ requireRelationship:true });
    if (!guard.allowed) {
      window.location.replace(guard.redirect);
      return;
    }
  }
  const currentJourney = state.getCurrentJourney();
  const archiveContext = state.getArchive(params.get("archive") || "");
  const path = currentJourney?.relationshipType || archiveContext?.relationshipType || "breakup";
  const relationshipType = path;
  const subjectName = String(currentJourney?.subjectName || "").trim();
  const endingContext = { path, relationshipType, subjectName };
  root.dataset.endingPath = path;

  const go = (href, status, delay = 240) => shared.nextPage(href, { exitState: "ending", delay: reduce() ? 0 : delay, status });
  root.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
    const base = button.dataset.go;
    const suffix = button.dataset.keepPath === "true" ? (base.includes("?") ? "&" : "?") + "path=" + encodeURIComponent(path) : "";
    go(base + suffix, button.dataset.status || "继续");
  }));

  const confirmLayer = root.querySelector("[data-end-confirm-layer]");
  const openConfirm = root.querySelector("[data-end-open-confirm]");
  const closeConfirm = root.querySelector("[data-end-close-confirm]");
  const hold = root.querySelector("[data-hold-confirm]");
  const holdStatus = root.querySelector("[data-hold-status]");
  const accessibleConfirm = root.querySelector("[data-end-accessible-confirm]");
  let holdTimer = null;
  let endingStarted = false;
  const setHoldStatus = (copy) => { if (holdStatus) holdStatus.textContent = copy; };
  const resetAccessibleConfirm = () => {
    if (!accessibleConfirm) return;
    accessibleConfirm.setAttribute("aria-pressed", "false");
    accessibleConfirm.textContent = "无法长按？改用点按确认";
  };
  const cancelHold = (announce = true) => {
    const wasHolding = holdTimer != null;
    if (holdTimer != null) window.clearTimeout(holdTimer);
    holdTimer = null;
    if (hold) hold.dataset.holding = "false";
    if (announce && wasHolding && !endingStarted) setHoldStatus("已取消，没有发生变化");
  };
  const finishEnd = () => {
    if (endingStarted) return;
    endingStarted = true;
    cancelHold(false);
    setHoldStatus("已确认，开始整理");
    confirmLayer?.setAttribute("data-confirm-state", "complete");
    if (hold) {
      hold.disabled = true;
      const label = hold.querySelector("span");
      if (label) label.textContent = "正在把这段陪伴收好";
    }
    if (accessibleConfirm) accessibleConfirm.disabled = true;
    if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
    state.updateCurrentJourney((journey) => {
      journey.ending = { ...journey.ending, stage:"farewell", startedAt:new Date().toISOString() };
    });
    const destination = path === "breakup" ? "019-breakup-call.html?path=breakup" : "020-memorial-message.html?path=" + encodeURIComponent(path);
    go(destination, "正在把这段陪伴收好", reduce() ? 0 : 760);
  };
  const startHold = (event) => {
    event?.preventDefault();
    if (endingStarted || holdTimer != null || confirmLayer?.getAttribute("aria-hidden") !== "false") return;
    resetAccessibleConfirm();
    if (hold) hold.dataset.holding = "true";
    setHoldStatus("继续按住 · 松开取消");
    if (navigator.vibrate) navigator.vibrate(10);
    holdTimer = window.setTimeout(finishEnd, 2000);
  };
  const closeConfirmLayer = () => {
    if (endingStarted) return;
    cancelHold(false);
    resetAccessibleConfirm();
    setHoldStatus("按住后开始计时");
    confirmLayer?.setAttribute("aria-hidden", "true");
    openConfirm?.focus({ preventScroll: true });
  };
  openConfirm?.addEventListener("click", () => {
    resetAccessibleConfirm();
    setHoldStatus("按住后开始计时");
    confirmLayer?.setAttribute("aria-hidden", "false");
    window.setTimeout(() => hold?.focus({ preventScroll: true }), reduce() ? 0 : 40);
  });
  closeConfirm?.addEventListener("click", closeConfirmLayer);
  confirmLayer?.addEventListener("click", (event) => { if (event.target === confirmLayer) closeConfirmLayer(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && confirmLayer?.getAttribute("aria-hidden") === "false") closeConfirmLayer();
  });
  accessibleConfirm?.addEventListener("click", () => {
    if (endingStarted) return;
    cancelHold(false);
    if (accessibleConfirm.getAttribute("aria-pressed") !== "true") {
      accessibleConfirm.setAttribute("aria-pressed", "true");
      accessibleConfirm.textContent = "再次点击，开始整理";
      setHoldStatus("请再次点击确认");
      return;
    }
    finishEnd();
  });
  hold?.addEventListener("pointerdown", startHold);
  hold?.addEventListener("pointerup", cancelHold);
  hold?.addEventListener("pointercancel", cancelHold);
  hold?.addEventListener("pointerleave", cancelHold);
  hold?.addEventListener("keydown", (event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) startHold(event); });
  hold?.addEventListener("keyup", (event) => { if (event.key === " " || event.key === "Enter") cancelHold(); });

  const goArchive = async (status = "已经好好收起", ritual = path === "breakup" ? "dissolved" : "buried") => {
    const archive = await state.commitArchive(ritual);
    if (!archive) return go("003-voice.html?from=relationship-required", "请先确认这段陪伴的类型");
    go("018-archive-bag.html?from=ending&archive=" + encodeURIComponent(archive.id), status);
  };
  root.querySelectorAll("[data-farewell-skip]").forEach((button) => button.addEventListener("click", () => goArchive("已跳过仪式，内容仍然保存", "skipped")));

  const callState = root.querySelector("[data-call-state]");
  if (callState) {
    const answer = root.querySelector("[data-answer]");
    const hangup = root.querySelector("[data-hangup]");
    const contact = root.querySelector("[data-call-contact]");
    const avatar = root.querySelector("[data-call-avatar]");
    const note = root.querySelector("[data-call-note]");
    const label = root.querySelector("[data-call-label]");
    const screen = root.querySelector(".ma-call-screen");
    const callBody = root.querySelector("[data-call-body]");
    const ritual = root.querySelector("[data-breakup-ritual]");
    const dissolveButton = root.querySelector("[data-breakup-dissolve]");
    const ritualStatus = root.querySelector("[data-breakup-status]");
    const displayContact = subjectName || "这次告别";
    if (contact) contact.textContent = displayContact;
    if (avatar) avatar.textContent = subjectName ? Array.from(subjectName)[0] : "某";
    let callPhase = "ringing";
    let callTimer = null;
    let ended = false;
    const setCallPhase = (phase) => {
      callPhase = phase;
      if (screen) screen.dataset.callState = phase;
      callState.hidden = phase !== "ringing";
      callState.textContent = "来电中";
      if (answer) { answer.hidden = phase !== "ringing"; answer.disabled = phase !== "ringing"; }
      if (hangup) hangup.disabled = phase === "ended";
      if (note) note.textContent = phase === "connected" ? "你接起了这一轮来电，听见自己终于可以停在这里。" : "有些告别，需要你亲自决定如何收尾。";
      if (label) label.textContent = phase === "connected" ? "挂断，完成告别" : phase === "ended" ? "告别已经收好" : "接听或挂断";
    };
    const showBreakupRitual = () => {
      if (!ritual) return goArchive("通话已经结束");
      if (callBody) callBody.hidden = true;
      ritual.hidden = false;
      ritual.dataset.ritualState = "idle";
      if (!reduce()) ritual.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 240, easing: "cubic-bezier(.23,1,.32,1)", fill: "both" });
      window.setTimeout(() => dissolveButton?.focus({ preventScroll: true }), reduce() ? 0 : 80);
    };
    answer?.addEventListener("click", () => { if (ended || callPhase !== "ringing") return; setCallPhase("connected"); });
    hangup?.addEventListener("click", () => {
      if (ended) return;
      ended = true;
      if (callTimer != null) window.clearTimeout(callTimer);
      setCallPhase("ended");
      window.setTimeout(showBreakupRitual, reduce() ? 20 : 420);
    });
    dissolveButton?.addEventListener("click", () => {
      if (!ritual || ritual.dataset.ritualState !== "idle") return;
      ritual.dataset.ritualState = "dissolving";
      dissolveButton.disabled = true;
      if (ritualStatus) ritualStatus.textContent = "画面正在散去，记录仍然完整保存";
      if (navigator.vibrate) navigator.vibrate(10);
      window.setTimeout(() => {
        ritual.dataset.ritualState = "complete";
        if (ritualStatus) ritualStatus.textContent = "画面已经散去，记录已进入只读档案";
      }, reduce() ? 20 : 1120);
      window.setTimeout(() => goArchive("画面已经散去，记录仍然保存"), reduce() ? 80 : 1780);
    });
    setCallPhase("ringing");
  }

  const message = root.querySelector("[data-memorial-message]");
  if (message) {
    const isPet = path === "pet";
    const profile = root.querySelector("[data-memorial-profile]");
    const profileBlock = root.querySelector("[data-memorial-profile-block]");
    const contact = root.querySelector("[data-memorial-contact]");
    const disclosure = root.querySelector("[data-memorial-disclosure]");
    const source = root.querySelector("[data-memorial-source]");
    const title = root.querySelector("[data-memorial-title]");
    const thread = root.querySelector("[data-message-thread]");
    const messageScreen = root.querySelector(".ma-message-screen");
    const continueButton = root.querySelector("[data-memorial-continue]");
    const ritual = root.querySelector("[data-burial-ritual]");
    const burialButton = root.querySelector("[data-burial-start]");
    const burialStatus = root.querySelector("[data-burial-status]");
    const burialTitle = root.querySelector("[data-burial-title]");
    const displayName = subjectName || (isPet ? "它" : "一段纪念");
    if (profile) profile.textContent = subjectName ? Array.from(subjectName)[0] : (isPet ? "伴" : "忆");
    if (contact) contact.textContent = displayName;
    if (title) title.textContent = isPet ? "陪伴回信" : "纪念文字";
    if (source) source.textContent = isPet ? "AI 整理 · 非真实消息" : "Make Again 整理 · 非逝者来信";
    if (disclosure) disclosure.textContent = isPet ? "以下文字由 AI 根据你留下的故事整理，采用陪伴过你的小动物的视角书写，不是真实消息。" : "以下文字由 Make Again 根据你真实保存的故事整理，不模拟离开的亲人说话。";
    if (burialTitle) burialTitle.innerHTML = isPet ? "把这些陪伴，<br />放进一个安静的地方" : "把这些记忆，<br />放进一个安静的地方";
    message.textContent = "纪念文字正在整理，稍后会在这里呈现。";
    window.setTimeout(() => message.classList.add("is-visible"), reduce() ? 10 : 260);
    // 纪念正文真源:/ending/content 返回 memorial / subject_name / disclosure,替换占位。
    if (uid && API && API.endingContent) {
      API.endingContent(uid).then((data) => {
        if (!data) return;
        if (data.memorial) message.textContent = data.memorial;
        if (data.subject_name && contact) contact.textContent = data.subject_name;
        if (data.disclosure && disclosure) disclosure.textContent = data.disclosure;
      }).catch(() => {});
    }
    continueButton?.addEventListener("click", () => {
      if (!ritual) return goArchive();
      if (thread) thread.hidden = true;
      if (profileBlock) profileBlock.hidden = true;
      if (messageScreen) messageScreen.dataset.ritualActive = "true";
      ritual.hidden = false;
      if (!reduce()) ritual.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 240, easing: "cubic-bezier(.23,1,.32,1)", fill: "both" });
      window.setTimeout(() => burialButton?.focus({ preventScroll: true }), reduce() ? 0 : 80);
    });
    burialButton?.addEventListener("click", () => {
      if (!ritual || ritual.dataset.ritualState !== "idle") return;
      ritual.dataset.ritualState = "burying";
      burialButton.disabled = true;
      if (burialStatus) burialStatus.textContent = "正在把照片、文字和物品收进纪念袋";
      if (navigator.vibrate) navigator.vibrate(10);
      window.setTimeout(() => {
        ritual.dataset.ritualState = "complete";
        if (burialStatus) burialStatus.textContent = isPet ? "它没有消失，只是换了一个安静的地方陪着你" : "这些记忆已经被好好保存";
      }, reduce() ? 20 : 2220);
      window.setTimeout(() => goArchive("纪念袋已经被好好安放"), reduce() ? 80 : 2980);
    });
  }

  const shopStatus = root.querySelector("[data-shop-status]");
  root.querySelectorAll("[data-shop-item]").forEach((card) => card.addEventListener("click", () => {
    root.querySelectorAll("[data-shop-item]").forEach((item) => item.setAttribute("aria-pressed", "false"));
    card.setAttribute("aria-pressed", "true");
    if (shopStatus) shopStatus.textContent = "已记下“" + card.dataset.shopItem + "” · 现在不购买也完全可以";
  }));

})();
