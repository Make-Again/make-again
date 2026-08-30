(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  if (root == null || shared == null || state == null) return;
  const params = new URL(location.href).searchParams;
  await state.ready();
  const guard = state.activeGuard();
  if (!guard.allowed) { window.location.replace(guard.redirect); return; }

  const phone = root.querySelector(".ma-chat-day-phone");
  const list = root.querySelector("[data-message-list]");
  const title = root.querySelector("[data-day-title]");
  const count = root.querySelector("[data-day-count]");
  const manage = root.querySelector("[data-message-manage]");
  const selectionBar = root.querySelector("[data-selection-bar]");
  const selectionDone = root.querySelector("[data-selection-done]");
  const selectionCount = root.querySelector("[data-selection-count]");
  const deleteOpen = root.querySelector("[data-delete-open]");
  const deleteLayer = root.querySelector("[data-delete-layer]");
  const deleteTitle = root.querySelector("[data-delete-title]");
  const deleteCancel = root.querySelector("[data-delete-cancel]");
  const deleteConfirm = root.querySelector("[data-delete-confirm]");
  const toast = root.querySelector("[data-chat-toast]");
  const back = root.querySelector("[data-history-back]");
  const required = [phone,list,title,count,manage,selectionBar,selectionDone,selectionCount,deleteOpen,deleteLayer,deleteTitle,deleteCancel,deleteConfirm,toast,back];
  if (required.some((node) => node == null)) return;

  const pad2 = (n) => String(n).padStart(2, "0");
  const formatTitle = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "当天";
    const now = new Date();
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return "今天";
    return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  };

  // 真源:恒走 /chat/history/{user}/day,网络失败保持空态。
  const dayParam = params.get("day") || "";
  let day = { title: formatTitle(dayParam), groups: [] };
  const backendDeleted = new Set();
  const uid = state.currentAccountId();

  if (uid && API) {
    let res = null;
    try { res = await API.chatHistoryDay(uid, dayParam); } catch (error) { res = null; }
    const groups = [];
    let current = null;
    (res && Array.isArray(res.messages) ? res.messages : []).forEach((m) => {
      const hhmm = String(m.ts || "").slice(11, 16);
      if (!current || current.time !== hhmm) { current = { time: hhmm, messages: [] }; groups.push(current); }
      current.messages.push({ id: String(m.id), speaker: m.role === "user" ? "user" : "wakey", text: m.content });
    });
    day = { title: formatTitle(dayParam), groups };
  }

  let selecting = false;
  const selected = new Set();
  const holdTimers = new Set();
  let toastTimer = null;

  const deletedIds = () => new Set(backendDeleted);
  const allMessages = () => day.groups.flatMap((group) => group.messages);
  const visibleMessages = () => allMessages().filter((message) => !deletedIds().has(message.id));

  const go = (href, status) => shared.nextPage(href, { exitState:"utility-home", delay:shared.reducedMotion() ? 0 : 220, status });

  const showToast = (copy) => {
    toast.textContent = copy;
    toast.hidden = false;
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; toastTimer = null; }, 1800);
  };

  const updateSelectionUI = () => {
    phone.dataset.selecting = String(selecting);
    selectionBar.hidden = !selecting;
    manage.hidden = visibleMessages().length === 0;
    manage.disabled = selecting;
    manage.setAttribute("aria-hidden", String(selecting));
    if (!selecting) {
      title.textContent = day.title;
      const total = visibleMessages().length;
      count.textContent = String(total) + " 条对话";
      return;
    }
    const size = selected.size;
    title.textContent = size === 0 ? "选择消息" : "已选择 " + String(size) + " 条";
    count.textContent = "";
    selectionCount.textContent = size === 0 ? "请选择要删除的消息" : "已选择 " + String(size) + " 条消息";
    deleteOpen.disabled = size === 0;
  };

  const setSelecting = (value) => {
    selecting = value;
    if (!value) selected.clear();
    list.querySelectorAll(".ma-chat-row").forEach((row) => row.setAttribute("aria-pressed", String(selected.has(row.dataset.messageId))));
    updateSelectionUI();
  };

  const toggleMessage = (id, force = null) => {
    const shouldSelect = force == null ? !selected.has(id) : force;
    if (shouldSelect) selected.add(id); else selected.delete(id);
    list.querySelectorAll(".ma-chat-row").forEach((row) => {
      if (row.dataset.messageId === id) row.setAttribute("aria-pressed", String(shouldSelect));
    });
    updateSelectionUI();
  };

  const makeRow = (message) => {
    const row = document.createElement("div");
    row.className = "ma-chat-row " + (message.speaker === "user" ? "is-me" : "is-wakey");
    row.dataset.messageId = message.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-pressed", "false");
    row.setAttribute("aria-label", (message.speaker === "user" ? "我的消息：" : "Wakey 的回复：") + message.text + "。长按可选择删除");

    const avatar = document.createElement("span");
    avatar.className = "ma-chat-avatar " + (message.speaker === "user" ? "ma-chat-avatar-user" : "ma-chat-avatar-wakey");
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = message.speaker === "user" ? "旅" : "M";
    const bubble = document.createElement("p");
    bubble.className = "ma-chat-bubble";
    bubble.textContent = message.text;
    const selector = document.createElement("span");
    selector.className = "ma-chat-select";
    selector.setAttribute("aria-hidden", "true");
    row.append(avatar, bubble, selector);

    let startX = 0;
    let startY = 0;
    let holdTimer = null;
    let suppressClick = false;
    const clearHold = () => {
      if (holdTimer != null) {
        window.clearTimeout(holdTimer);
        holdTimers.delete(holdTimer);
      }
      holdTimer = null;
    };
    row.addEventListener("pointerdown", (event) => {
      if (selecting) return;
      startX = event.clientX;
      startY = event.clientY;
      holdTimer = window.setTimeout(() => {
        holdTimers.delete(holdTimer);
        holdTimer = null;
        suppressClick = true;
        setSelecting(true);
        toggleMessage(message.id, true);
        if (typeof navigator.vibrate === "function") navigator.vibrate(10);
      }, 440);
      holdTimers.add(holdTimer);
    });
    row.addEventListener("pointermove", (event) => {
      if (Math.abs(event.clientX - startX) > 9 || Math.abs(event.clientY - startY) > 9) clearHold();
    });
    row.addEventListener("pointerup", clearHold);
    row.addEventListener("pointercancel", clearHold);
    row.addEventListener("contextmenu", (event) => { if (selecting || suppressClick) event.preventDefault(); });
    row.addEventListener("click", () => {
      if (suppressClick) { suppressClick = false; return; }
      if (selecting) toggleMessage(message.id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!selecting) setSelecting(true);
      toggleMessage(message.id);
    });
    return row;
  };

  const render = () => {
    const deleted = deletedIds();
    const nodes = [];
    day.groups.forEach((group) => {
      const messages = group.messages.filter((message) => !deleted.has(message.id));
      if (messages.length === 0) return;
      if (group.time) {
        const time = document.createElement("p");
        time.className = "ma-chat-time";
        time.textContent = group.time;
        nodes.push(time);
      }
      nodes.push(...messages.map(makeRow));
    });
    if (nodes.length === 0) {
      const empty = document.createElement("section");
      empty.className = "ma-chat-empty-day";
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "…";
      const heading = document.createElement("h2");
      heading.textContent = "这一天的消息已删除";
      const copy = document.createElement("p");
      copy.textContent = "删除不会改动已经收入时间看板的旧报告。";
      empty.append(mark, heading, copy);
      nodes.push(empty);
    }
    list.replaceChildren(...nodes);
    setSelecting(false);
  };

  const setDeleteDialog = (open) => {
    deleteLayer.setAttribute("aria-hidden", String(!open));
    if (open) window.requestAnimationFrame(() => deleteCancel.focus({ preventScroll:true }));
    else deleteOpen.focus({ preventScroll:true });
  };

  manage.addEventListener("click", () => setSelecting(true));
  selectionDone.addEventListener("click", () => { setSelecting(false); manage.focus({ preventScroll:true }); });
  deleteOpen.addEventListener("click", () => {
    if (selected.size === 0) return;
    deleteTitle.textContent = "确认删除 " + String(selected.size) + " 条消息？";
    setDeleteDialog(true);
  });
  deleteCancel.addEventListener("click", () => setDeleteDialog(false));
  deleteLayer.addEventListener("click", (event) => { if (event.target === deleteLayer) setDeleteDialog(false); });
  deleteConfirm.addEventListener("click", async () => {
    const total = selected.size;
    const numeric = Array.from(selected).map(Number).filter((n) => !Number.isNaN(n));
    numeric.forEach((n) => backendDeleted.add(String(n)));
    if (uid && API && numeric.length) { try { await API.chatHistoryDelete(uid, numeric); } catch (error) { /* 本地已隐藏 */ } }
    deleteLayer.setAttribute("aria-hidden", "true");
    render();
    manage.focus({ preventScroll:true });
    showToast("已永久删除 " + String(total) + " 条消息");
  });
  back.addEventListener("click", () => go("007-chat-history.html?from=day", "返回聊天历史"));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (deleteLayer.getAttribute("aria-hidden") === "false") setDeleteDialog(false);
    else if (selecting) setSelecting(false);
  });
  window.addEventListener("pagehide", () => {
    holdTimers.forEach((timer) => window.clearTimeout(timer));
    if (toastTimer != null) window.clearTimeout(toastTimer);
  });

  render();
})();
