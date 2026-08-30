(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  if (root == null || shared == null || state == null) return;
  const params = new URL(location.href).searchParams;
  await state.ready();
  const guard = state.activeGuard({ requireRelationship:true, requireReport:true });
  if (!guard.allowed) {
    window.location.replace(guard.redirect);
    return;
  }

  // 真源:登录后拉 /home(情绪日历 + 软引导 + 今日主题),一次往返;失败回落演示/空态。
  const uid = state.currentAccountId();
  let homeData = null;
  if (uid && API) {
    try { homeData = await API.home(uid); } catch (error) { homeData = null; }
  }
  let weeklyReady = false;
  if (uid && API && API.weeklyDue) {
    try { const due = await API.weeklyDue(uid); weeklyReady = !!(due && due.due); } catch (error) { weeklyReady = false; }
  }

  // 树洞一次性弹窗:写信邀请→015,回信邀请→024,收到回信→022;处理一个即标记已看。
  if (uid && API && API.treeholePopup) {
    API.treeholePopup(uid).then((data) => {
      const popups = (data && data.popups) || [];
      for (const popup of popups) {
        const kind = popup && popup.kind;
        if (API.treeholePopupSeen) API.treeholePopupSeen(uid, kind, popup && popup.data && popup.data.reply_id).catch(() => {});
        if (kind === "write") {
          shared.nextPage("015-letter-box.html?from=write-invite", { exitState: "home-event", delay: 220, status: "树洞信箱邀请你写一封信" });
          return;
        }
        if (kind === "reply_invite") {
          shared.nextPage("024-reply-compose.html?from=reply-invite", { exitState: "home-event", delay: 220, status: "一封来信等待你的回信" });
          return;
        }
        if (kind === "reply_received") {
          shared.nextPage("022-letter-invitation.html?from=reply-arrival", { exitState: "home-event", delay: 220, status: "一封回信正在展开" });
          return;
        }
      }
    }).catch(() => {});
  }

  const pad2 = (n) => String(n).padStart(2, "0");
  const emotionFaceMap = {
    "难过": { face:"sad", color:"#6ca9ff" },
    "想念": { face:"longing", color:"#eb77b1" },
    "平静": { face:"calm", color:"#5ab9b1" },
    "内疚": { face:"guilt", color:"#a87aff" },
    "释怀": { face:"relief", color:"#64c977" },
    "焦虑": { face:"anxious", color:"#ffc34a" },
    "孤独": { face:"longing", color:"#eb77b1" },
    "不甘": { face:"guilt", color:"#a87aff" },
    "愤怒": { face:"anxious", color:"#ffc34a" },
    "恐惧": { face:"anxious", color:"#ffc34a" },
    "回避": { face:"calm", color:"#5ab9b1" },
    "其他": { face:"waiting", color:"#8c8fa7" },
  };
  const emotionCopy = (emo) => "这一天，Wakey 感受到的情绪偏向「" + emo + "」。";
  const weekDates = (() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      dates.push(d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()));
    }
    return dates;
  })();
  let moodByDate = new Map();
  if (homeData && Array.isArray(homeData.calendar?.days)) {
    homeData.calendar.days.forEach((d) => { if (d && d.emotion) moodByDate.set(d.date, d); });
  }
  let backendWidgets = [];
  if (homeData && Array.isArray(homeData.nudges?.nudges)) {
    backendWidgets = homeData.nudges.nudges
      .map((n) => ({
        label: n.type === "quote" ? "今日 · Wakey" : "Wakey 的小提示",
        copy: n.text || "",
        note: n.trigger ? ("常在「" + n.trigger + "」的时刻想起你") : "",
        source: n.type === "quote" ? "每日语录" : "此刻的陪伴",
        action: "收下",
      }))
      .filter((w) => w.copy);
  }

  const phone = root.querySelector(".ma-home-v6-phone");
  const moodWeek = root.querySelector("[data-mood-week]");
  const moodLayer = root.querySelector("[data-mood-detail-layer]");
  const moodClose = root.querySelector("[data-mood-detail-close]");
  const moodDetailTitle = root.querySelector("[data-mood-detail-title]");
  const moodDetailCopy = root.querySelector("[data-mood-detail-copy]");
  const moodDisagree = root.querySelector("[data-mood-disagree]");
  const widget = root.querySelector("[data-smart-widget]");
  const widgetTrack = root.querySelector("[data-widget-track]");
  const widgetKicker = root.querySelector("[data-widget-kicker]");
  const widgetIndex = root.querySelector("[data-widget-index]");
  const widgetLabel = root.querySelector("[data-widget-label]");
  const widgetCopy = root.querySelector("[data-widget-copy]");
  const widgetDone = root.querySelector("[data-widget-done]");
  const widgetDots = root.querySelector("[data-widget-dots]");
  const conversation = root.querySelector("[data-open-chat]");
  const suggestion = root.querySelector("[data-ai-suggestion]");
  const voice = root.querySelector("[data-home-voice]");
  const voiceStatus = root.querySelector("[data-home-voice-status]");
  const menuButton = root.querySelector("[data-menu-button]");
  const menuDrawer = root.querySelector("[data-menu-drawer]");
  const menuScrim = root.querySelector("[data-menu-scrim]");
  const menuClose = root.querySelector("[data-menu-close]");
  const philosophyLayer = root.querySelector("[data-philosophy-layer]");
  const philosophyStack = root.querySelector("[data-philosophy-stack]");
  const eventLayer = root.querySelector("[data-event-layer]");
  const eventTitle = root.querySelector("[data-event-title]");
  const eventKicker = root.querySelector("[data-event-kicker]");
  const eventCopy = root.querySelector("[data-event-copy]");
  const eventLater = root.querySelector("[data-event-later]");
  const eventReject = root.querySelector("[data-event-reject]");
  const eventConfirm = root.querySelector("[data-event-confirm]");
  const pendingShelf = root.querySelector("[data-pending-shelf]");
  const pendingTitle = root.querySelector("[data-pending-title]");
  const pendingCount = root.querySelector("[data-pending-count]");
  const toast = root.querySelector("[data-home-toast]");
  const toastCopy = root.querySelector("[data-home-toast-copy]");
  const toastAction = root.querySelector("[data-home-toast-action]");
  const required = [phone,moodWeek,moodLayer,moodClose,moodDetailTitle,moodDetailCopy,moodDisagree,widget,widgetTrack,widgetKicker,widgetIndex,widgetLabel,widgetCopy,widgetDone,widgetDots,conversation,suggestion,voice,voiceStatus,menuButton,menuDrawer,menuScrim,menuClose,philosophyLayer,philosophyStack,eventLayer,eventTitle,eventKicker,eventCopy,eventLater,eventReject,eventConfirm,pendingShelf,pendingTitle,pendingCount,toast,toastCopy,toastAction];
  if (required.some((node) => node == null)) return;

  const pageEntry = params.get("from") || shared.pageEntry || "";

  const markIntroSeen = () => {
    state.updateCurrentJourney((journey) => { journey.homeIntroSeen = true; });
  };
  if (pageEntry === "board-intro") markIntroSeen();

  let toastTimer = null;
  let toastUndo = null;
  const hideToast = () => {
    toast.hidden = true;
    toastUndo = null;
    toastAction.hidden = true;
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = null;
  };
  const showToast = (copy, undo = null) => {
    toastCopy.textContent = copy;
    toastUndo = typeof undo === "function" ? undo : null;
    toastAction.hidden = toastUndo == null;
    toast.hidden = false;
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 3200);
  };
  toastAction.addEventListener("click", () => {
    const undo = toastUndo;
    hideToast();
    undo?.();
  });

  const dayLabels = ["一","二","三","四","五","六","日"];
  const todayIndex = (new Date().getDay() + 6) % 7;
  const moodFaceSvg = {
    sad:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><path d="M5.5 8.2Q7.1 7.2 8.7 8.2M15.3 8.2q1.6-1 3.2 0"/><circle cx="7.4" cy="11" r=".75" data-fill/><circle cx="16.6" cy="11" r=".75" data-fill/><path d="M8.3 17q3.7-3.2 7.4 0"/><path d="M18.6 12.6c1.1 1.4 1.3 2 .2 2.7-1.2-.6-1.1-1.4-.2-2.7Z" data-fill/></svg>',
    longing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><circle cx="7.2" cy="10.2" r=".8" data-fill/><circle cx="15.8" cy="9.4" r=".8" data-fill/><path d="M8.7 16.2q3.2-1.9 6.4-.1"/><path d="M17.1 14.4c1.9-2.1 4.4.4.4 3.2-3.9-2.8-1.5-5.3-.4-3.2Z" stroke-width="1.05"/></svg>',
    calm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5.4 10.5q2 1.6 4 0M14.6 10.5q2 1.6 4 0M8 15.2q4 3.4 8 0"/><path d="M6.1 7.3q1.6-.8 3.1 0M14.8 7.3q1.6-.8 3.1 0" opacity=".55"/></svg>',
    guilt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><path d="M5.3 7.8l3.2 1M18.7 7.8l-3.2 1M6.2 11.3q1.4 1.1 2.8 0M15 11.3q1.4 1.1 2.8 0M9.4 17.1q2.6-1.8 5.2 0"/><circle cx="12" cy="14" r=".55" data-fill/></svg>',
    relief:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5.4 10.2q2.1 1.8 4.2 0M14.4 10.2q2.1 1.8 4.2 0M7.6 14.7q4.4 4.6 8.8 0"/><circle cx="5.9" cy="14" r=".7" data-fill opacity=".5"/><circle cx="18.1" cy="14" r=".7" data-fill opacity=".5"/></svg>',
    anxious:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><path d="M5.2 7.6q2-1.3 4 0M14.8 7.6q2-1.3 4 0"/><circle cx="7.2" cy="11" r="1"/><circle cx="16.8" cy="11" r="1"/><path d="M7.8 17c1.4-2 2.8 1.6 4.2-.3 1.4-1.9 2.8 1.5 4.2-.4"/></svg>',
    waiting:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="7.6" cy="10.3" r=".65" data-fill/><circle cx="16.4" cy="10.3" r=".65" data-fill/><circle cx="9.6" cy="16" r=".45" data-fill/><circle cx="12" cy="16" r=".45" data-fill/><circle cx="14.4" cy="16" r=".45" data-fill/></svg>',
  };
  let moodItems = dayLabels.map((day, index) => ({ day, today:index === todayIndex, mood:null, face:"waiting", color:"#8c8fa7", copy:"" }));
  let activeMoodIndex = null;
  let dismissedMoods = [];
  dismissedMoods = state.getCurrentJourney()?.dismissedMoods || [];

  const setMoodDetail = (open, index = null) => {
    moodLayer.setAttribute("aria-hidden", String(!open));
    if (!open || index == null) { activeMoodIndex = null; return; }
    const item = moodItems[index];
    if (item?.mood == null) return;
    activeMoodIndex = index;
    moodDetailTitle.textContent = item.mood;
    moodDetailCopy.textContent = item.copy || "这是 Wakey 根据当天对话形成的理解。";
  };

  const renderMoods = () => {
    moodItems = dayLabels.map((day, index) => {
      const rec = moodByDate.get(weekDates[index]);
      const emo = rec && rec.emotion ? rec.emotion : null;
      const mapped = emo ? emotionFaceMap[emo] : null;
      return { day, today:index === todayIndex, mood:emo, face:mapped?.face || "waiting", color:mapped?.color || "#8c8fa7", copy:emo ? emotionCopy(emo) : "", dismissed:dismissedMoods.includes(index) };
    });
    moodWeek.replaceChildren(...moodItems.map((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ma-mood-day" + (item.today ? " is-today" : "");
      button.style.setProperty("--mood-color", item.color);
      button.dataset.recorded = String(item.mood != null);
      button.dataset.dismissed = String(Boolean(item.dismissed));
      button.dataset.face = item.face;
      button.innerHTML = '<small>' + item.day + '</small><span class="ma-mood-face' + (item.mood == null ? ' is-empty' : '') + '" aria-hidden="true">' + moodFaceSvg[item.face] + '</span>';
      button.setAttribute("aria-label", "周" + item.day + "，" + (item.mood == null ? "尚未形成情绪记录" : "Wakey 感受到" + item.mood));
      button.addEventListener("click", () => {
        moodWeek.querySelectorAll(".ma-mood-day").forEach((node) => node.classList.toggle("is-selected", node === button));
        if (item.mood != null && !item.dismissed) {
          setMoodDetail(true, index);
          return;
        }
      });
      return button;
    }));
  };
  moodClose.addEventListener("click", () => setMoodDetail(false));
  moodLayer.addEventListener("click", (event) => { if (event.target === moodLayer) setMoodDetail(false); });
  moodDisagree.addEventListener("click", () => {
    if (activeMoodIndex == null) return;
    if (!dismissedMoods.includes(activeMoodIndex)) dismissedMoods.push(activeMoodIndex);
    state.updateCurrentJourney((journey) => { journey.dismissedMoods = dismissedMoods.slice(); });
    setMoodDetail(false);
    renderMoods();
    showToast("已撤下这次判断，Wakey 不会把它当作你的结论");
  });

  const emptyWidget = { label:"今日 · Wakey", copy:"今天没有需要处理的新内容。", note:"有新内容时会在这里提醒你。", source:"Wakey", action:"知道了" };
  let widgets = backendWidgets.map((item) => ({ ...item }));
  let widgetPosition = 0;
  let widgetGesture = null;
  let removedWidget = null;

  const renderWidget = (direction = 0) => {
    if (widgets.length === 0) widgets = [emptyWidget];
    widgetPosition = ((widgetPosition % widgets.length) + widgets.length) % widgets.length;
    const item = widgets[widgetPosition];
    widgetKicker.textContent = widgets.length === 1 ? item.label : widgets.length + " 条新内容";
    widgetIndex.textContent = widgets.length === 1 ? "" : (widgetPosition + 1) + " / " + widgets.length;
    widgetLabel.textContent = item.label;
    widgetCopy.textContent = item.copy;
    widgetDone.textContent = item.action || "收下";
    widgetDots.hidden = widgets.length <= 1;
    widgetDots.innerHTML = widgets.map((_,index) => '<i class="' + (index === widgetPosition ? "is-active" : "") + '"></i>').join("");
    if (direction !== 0 && !shared.reducedMotion()) widgetTrack.animate(
      [{ opacity:.3, filter:"blur(2px)", transform:"translateX(" + (direction > 0 ? "8px" : "-8px") + ")" }, { opacity:1, filter:"blur(0)", transform:"translateX(0)" }],
      { duration:200, easing:"cubic-bezier(0.23, 1, 0.32, 1)", fill:"both" }
    );
  };
  const moveWidget = (delta) => { widgetPosition += delta; renderWidget(delta); };
  widget.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    widgetGesture = { id:event.pointerId, x:event.clientX, y:event.clientY };
    try { widget.setPointerCapture(event.pointerId); } catch (error) { /* Native tracking remains. */ }
  });
  widget.addEventListener("pointerup", (event) => {
    if (widgetGesture == null || widgetGesture.id !== event.pointerId) return;
    const dx = event.clientX - widgetGesture.x;
    const dy = event.clientY - widgetGesture.y;
    widgetGesture = null;
    if (Math.abs(dx) < 28 || Math.abs(dx) <= Math.abs(dy)) return;
    moveWidget(dx < 0 ? 1 : -1);
  });
  widgetDone.addEventListener("click", () => {
    const item = widgets[widgetPosition];
    if (item?.route) {
      shared.nextPage(item.route, { exitState:"home-menu", delay:220, status:"正在打开" + item.label });
      return;
    }
    if (widgets.length === 1 && item === emptyWidget) return;
    removedWidget = { item:{ ...item }, index:widgetPosition };
    widgets.splice(widgetPosition, 1);
    widgetPosition = Math.min(widgetPosition, widgets.length - 1);
    renderWidget(1);
    showToast("已收下这条内容", () => {
      if (removedWidget == null) return;
      widgets.splice(removedWidget.index, 0, removedWidget.item);
      widgetPosition = removedWidget.index;
      removedWidget = null;
      renderWidget(-1);
    });
  });

  const setMenu = (open) => {
    menuDrawer.setAttribute("aria-hidden", String(!open));
    menuScrim.setAttribute("aria-hidden", String(!open));
    menuButton.setAttribute("aria-expanded", String(open));
  };
  menuButton.addEventListener("click", () => setMenu(true));
  menuClose.addEventListener("click", () => setMenu(false));
  menuScrim.addEventListener("click", () => setMenu(false));

  const routes = {
    membership:"006-membership.html?from=home",
    board:"004-report-board.html?from=home&view=board",
    history:"007-chat-history.html?from=home",
    settings:"008-settings.html?from=home",
    help:"010-help-feedback.html?from=home",
    ending:"016-ending-confirm.html?from=home",
  };
  root.querySelectorAll("[data-destination]").forEach((button) => button.addEventListener("click", () => {
    const href = routes[button.dataset.destination];
    if (!href) return;
    setMenu(false);
    shared.nextPage(href, { exitState:"home-menu", delay:220, status:"正在打开" + button.textContent.trim() });
  }));

  let noteIndex = 0;
  const notes = Array.from(philosophyStack.querySelectorAll("article"));
  const renderNote = () => notes.forEach((note,index) => note.classList.toggle("is-active", index === noteIndex));
  root.querySelector("[data-philosophy-open]").addEventListener("click", () => { setMenu(false); philosophyLayer.setAttribute("aria-hidden","false"); });
  root.querySelector("[data-philosophy-close]").addEventListener("click", () => philosophyLayer.setAttribute("aria-hidden","true"));
  root.querySelector("[data-philosophy-next]").addEventListener("click", () => { noteIndex = (noteIndex + 1) % notes.length; renderNote(); });
  renderNote();

  // 本周小报:文案由 /weekly-report/{uid}/due 决定是否已生成;trial 无接口已移除,写信邀请改由树洞弹窗触发。
  const eventData = {
    weekly:{ kicker:"WAKEY · 本周小报", title:"这一周的你", copy: weeklyReady ? "这一周的小报已经整理好了，点开回看过去七天的变化。" : "这一周的小报还在整理中，稍后再来看看。", route:"007-chat-history.html?from=event" },
  };
  let activeEvent = null;
  let pending = state.getCurrentJourney()?.pendingEvents || [];
  const savePending = () => state.updateCurrentJourney((journey) => { journey.pendingEvents = pending.slice(); });
  savePending();
  const renderPending = () => {
    pendingShelf.hidden = pending.length === 0;
    if (pending.length === 0) return;
    const title = eventData[pending[0]]?.title || "有一件事被收在这里";
    pendingTitle.textContent = title;
    pendingCount.textContent = String(pending.length);
    pendingShelf.setAttribute("aria-label", "稍后再读，共 " + String(pending.length) + " 条，第一条是" + title);
  };
  const showEvent = (type) => {
    const data = eventData[type];
    if (!data) return;
    activeEvent = type;
    eventKicker.textContent = data.kicker;
    eventTitle.textContent = data.title;
    eventCopy.textContent = data.copy;
    eventLater.textContent = "稍后再读";
    eventReject.textContent = "不需要";
    eventConfirm.textContent = "现在查看";
    eventLayer.setAttribute("aria-hidden","false");
  };
  const hideEvent = () => { eventLayer.setAttribute("aria-hidden","true"); activeEvent = null; };
  const resolvePending = (type) => {
    const index = pending.indexOf(type);
    if (index < 0) return;
    pending.splice(index, 1);
    savePending();
    renderPending();
  };
  eventReject.addEventListener("click", () => {
    const type = activeEvent;
    hideEvent();
    if (type != null) resolvePending(type);
  });
  eventConfirm.addEventListener("click", () => {
    const type = activeEvent;
    const data = eventData[type];
    if (!data) return;
    if (type != null) resolvePending(type);
    shared.nextPage(data.route, { exitState:"home-event", delay:220, status:"正在打开" + data.title });
  });
  eventLater.addEventListener("click", async () => {
    if (activeEvent == null) return;
    const type = activeEvent;
    const card = eventLayer.querySelector(".ma-home-event");
    if (!shared.reducedMotion()) try {
      await card.animate(
        [{ opacity:1, transform:"translateY(0) scale(1)" }, { opacity:0, transform:"translateY(-18px) scale(.96)" }],
        { duration:200, easing:"cubic-bezier(0.23, 1, 0.32, 1)", fill:"forwards" }
      ).finished;
    } catch (error) { /* A second action may interrupt the card. */ }
    if (!pending.includes(type)) pending.push(type);
    savePending();
    hideEvent();
    renderPending();
    if (!shared.reducedMotion()) pendingShelf.animate(
      [{ opacity:0, transform:"scale(.9)" }, { opacity:1, transform:"scale(1)" }],
      { duration:180, easing:"cubic-bezier(0.23, 1, 0.32, 1)", fill:"both" }
    );
  });
  pendingShelf.addEventListener("click", () => { if (pending.length > 0) showEvent(pending[0]); });
  renderPending();

  let holdTimer = null;
  let navTimer = null;
  let hintTimer = null;
  let recording = false;
  let voiceGesture = null;
  const setVoiceState = (state) => {
    phone.dataset.homeVoiceState = state;
    const copy = { idle:"", pressing:"继续按住开始录音", recording:"正在听你说 · 上滑取消", sending:"语音已收到", thinking:"Wakey 正在整理 · 即将进入对话" };
    voiceStatus.textContent = copy[state] || copy.idle;
  };
  const releaseVoice = (id) => { try { if (id != null && voice.hasPointerCapture(id)) voice.releasePointerCapture(id); } catch (error) { /* Capture may already be released. */ } };
  const resetVoiceGesture = () => {
    delete phone.dataset.homeVoiceIntent;
    voice.style.removeProperty("transform");
    voiceGesture = null;
  };
  const showVoiceHint = (copy) => {
    if (hintTimer != null) window.clearTimeout(hintTimer);
    voiceStatus.textContent = copy;
    hintTimer = window.setTimeout(() => { hintTimer = null; if (!recording) setVoiceState("idle"); }, 1100);
  };
  const beginRecording = () => {
    if (recording || voiceGesture == null || phone.dataset.homeVoiceState !== "pressing") return;
    recording = true;
    setVoiceState("recording");
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);
  };
  const cancelRecording = () => {
    const id = voiceGesture?.id;
    recording = false;
    if (holdTimer != null) window.clearTimeout(holdTimer);
    holdTimer = null;
    resetVoiceGesture();
    releaseVoice(id);
    setVoiceState("idle");
    showVoiceHint("录音已取消");
  };
  const finishRecording = () => {
    if (!recording || voiceGesture == null) return;
    const id = voiceGesture.id;
    const cancelled = phone.dataset.homeVoiceIntent === "cancel";
    recording = false;
    resetVoiceGesture();
    releaseVoice(id);
    if (cancelled) { showVoiceHint("录音已取消"); return; }
    setVoiceState("sending");
    navTimer = window.setTimeout(() => {
      setVoiceState("thinking");
      navTimer = window.setTimeout(() => shared.nextPage(
        "003-voice.html?from=home-voice&topic=" + encodeURIComponent("刚刚的语音") + "&autoReply=1",
        { exitState:"home-voice", delay:220, status:"正在进入 Wakey 对话" }
      ), 420);
    }, 260);
  };
  voice.addEventListener("pointerdown", (event) => {
    if (voiceGesture != null || phone.dataset.homeVoiceState !== "idle") return;
    event.preventDefault();
    voiceGesture = { id:event.pointerId, startY:event.clientY };
    setVoiceState("pressing");
    try { voice.setPointerCapture(event.pointerId); } catch (error) { /* Native tracking remains. */ }
    holdTimer = window.setTimeout(() => { holdTimer = null; beginRecording(); }, 160);
  });
  voice.addEventListener("pointermove", (event) => {
    if (!recording || voiceGesture?.id !== event.pointerId) return;
    const deltaY = event.clientY - voiceGesture.startY;
    const cancelling = deltaY < -52;
    if (cancelling) phone.dataset.homeVoiceIntent = "cancel";
    else delete phone.dataset.homeVoiceIntent;
    voiceStatus.textContent = cancelling ? "松开取消" : "正在听你说 · 上滑取消";
    const dragY = Math.max(-16, Math.min(4, deltaY * .22));
    voice.style.transform = "translateY(" + String(dragY) + "px) scale(" + (cancelling ? ".94" : ".97") + ")";
  });
  voice.addEventListener("pointerup", (event) => {
    if (voiceGesture?.id !== event.pointerId) return;
    if (holdTimer != null) window.clearTimeout(holdTimer);
    holdTimer = null;
    if (recording) { finishRecording(); return; }
    const id = voiceGesture.id;
    resetVoiceGesture();
    releaseVoice(id);
    setVoiceState("idle");
    showVoiceHint("请长按球体开始录音");
  });
  voice.addEventListener("pointercancel", cancelRecording);
  voice.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && !recording) { event.preventDefault(); voiceGesture = { id:null, startY:0 }; setVoiceState("pressing"); beginRecording(); } });
  voice.addEventListener("keyup", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); finishRecording(); } });

  conversation.addEventListener("click", () => {
    markIntroSeen();
    shared.nextPage("003-voice.html?from=home", { exitState:"home-voice", delay:220, status:"正在进入 Wakey 对话" });
  });
  suggestion.addEventListener("click", () => {
    markIntroSeen();
    shared.nextPage(
      "003-voice.html?from=home-tip&topic=" + encodeURIComponent("最近，有一件事总在心里绕回来") + "&autoReply=1",
      { exitState:"home-voice", delay:220, status:"Wakey 已收到这个话题" }
    );
  });

  const eventParam = params.get("event");
  if (eventData[eventParam]) window.setTimeout(() => showEvent(eventParam), 220);
  if (params.get("reply") === "1") window.setTimeout(() => shared.nextPage("022-letter-invitation.html?from=reply-arrival", { exitState:"home-event", delay:220, status:"一封回信正在展开" }), 260);
  if (pageEntry === "letter-sent") window.setTimeout(() => showToast("信已经匿名寄出"), 180);
  if (pageEntry === "letter-later") window.setTimeout(() => showToast("草稿已经收在顶部信件里"), 180);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && recording) cancelRecording();
  });
  window.addEventListener("pagehide", () => {
    if (toastTimer != null) window.clearTimeout(toastTimer);
    if (holdTimer != null) window.clearTimeout(holdTimer);
    if (navTimer != null) window.clearTimeout(navTimer);
    if (hintTimer != null) window.clearTimeout(hintTimer);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (moodLayer.getAttribute("aria-hidden") === "false") setMoodDetail(false);
    else if (eventLayer.getAttribute("aria-hidden") === "false") hideEvent();
    else if (philosophyLayer.getAttribute("aria-hidden") === "false") philosophyLayer.setAttribute("aria-hidden","true");
    else setMenu(false);
  });

  const suggestionStrong = suggestion.querySelector("strong");
  if (suggestionStrong && homeData && Array.isArray(homeData.themes?.themes) && homeData.themes.themes.length) {
    const themes = homeData.themes.themes;
    const t1 = themes[0]?.title;
    const t2 = themes[1]?.title;
    if (t1) suggestionStrong.textContent = t2 ? "今天想聊聊「" + t1 + "」，还是「" + t2 + "」？" : "今天想聊聊「" + t1 + "」？";
  }

  renderMoods();
  renderWidget();
  setVoiceState("idle");
  if (["membership","settings","help","history","account-security","notifications","general-settings","about"].includes(pageEntry)) setMenu(true);
})();
