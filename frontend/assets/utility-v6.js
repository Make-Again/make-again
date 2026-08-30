(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  if (root == null || shared == null) return;

  const params = new URL(window.location.href).searchParams;
  const fromArchive = params.get("from") === "archive";
  const go = (href, status) => shared.nextPage(href, { exitState: "utility-home", delay: shared.reducedMotion() ? 0 : 220, status });
  root.querySelectorAll("[data-home-back]").forEach((button) => {
    if (fromArchive) button.setAttribute("aria-label", "返回档案");
    button.addEventListener("click", () => go(fromArchive ? "018-archive-bag.html?from=settings" : "005-home.html?from=" + (root.dataset.utilityPage || "utility"), fromArchive ? "返回档案" : "返回首页"));
  });
  root.querySelectorAll("[data-settings-back]").forEach((button) => button.addEventListener("click", () => go("008-settings.html?from=" + (fromArchive ? "archive" : "child"), "返回设置")));
  root.querySelectorAll("[data-settings-route]").forEach((button) => button.addEventListener("click", () => go(button.dataset.settingsRoute + (fromArchive ? "?from=archive" : ""), "打开设置二级页面")));

  // 设置页账号名真源:/auth/me 返回的用户名,失败保留默认「账号」。
  const accountName = root.querySelector("[data-account-name]");
  if (accountName && window.MakeAgainAPI && window.MakeAgainAPI.me) {
    window.MakeAgainAPI.me().then((me) => {
      if (me && typeof me.username === "string" && me.username) accountName.textContent = me.username;
    }).catch(() => { /* 保留默认文案 */ });
  }
  root.querySelectorAll("[data-day]").forEach((button) => button.addEventListener("click", () => go("009-chat-day.html?day=" + encodeURIComponent(button.dataset.day), "打开当日聊天记录")));
  root.querySelectorAll("[data-history-back]").forEach((button) => button.addEventListener("click", () => go("007-chat-history.html?from=day", "返回每日总结")));
  root.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"))));
  root.querySelectorAll("[data-expand]").forEach((button) => button.addEventListener("click", () => button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true"))));

  const feedback = root.querySelector("[data-feedback-send]");
  feedback?.addEventListener("click", () => {
    const status = root.querySelector("[data-feedback-status]");
    if (status) status.textContent = "已收到，我们会认真查看";
  });
  const legacyLetter = root.querySelector("[data-letter-send]");
  legacyLetter?.addEventListener("click", () => {
    const textarea = root.querySelector(".ma-letter-box-note textarea");
    const checkbox = root.querySelector(".ma-letter-box-note input");
    const status = root.querySelector("[data-letter-status]");
    if (!textarea?.value.trim()) { if (status) status.textContent = "先写下一点想说的话"; return; }
    if (!checkbox?.checked) { if (status) status.textContent = "请先确认信件边界"; return; }
    if (status) status.textContent = "信已寄出 · 你一定会收到一封认真写来的回信";
  });

  const letterIncoming = root.querySelector("[data-letter-incoming]");
  const letterRead = root.querySelector("[data-letter-read]");
  const letterChoice = root.querySelector("[data-letter-choice]");
  const letterForm = root.querySelector("[data-letter-form]");
  const letterComplete = root.querySelector("[data-letter-complete]");
  if (letterIncoming && letterRead && letterChoice && letterForm && letterComplete) {
    const letterKey = "make-again-letter-invitation";
    const readState = () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(letterKey) || "{}");
        return { read: stored.read === true, decision: ["written", "declined"].includes(stored.decision) ? stored.decision : "pending" };
      } catch (error) {
        return { read: false, decision: "pending" };
      }
    };
    const saveState = (state) => { try { window.localStorage.setItem(letterKey, JSON.stringify(state)); } catch (error) { /* Preview remains usable without storage. */ } };
    let state = readState();
    const panels = [letterIncoming, letterRead, letterChoice, letterForm, letterComplete];
    const content = root.querySelector(".ma-letter-box-content");
    const resetScroll = () => {
      content?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    const focusWithoutScroll = (node) => window.requestAnimationFrame(() => { try { node?.focus({ preventScroll: true }); } catch (error) { node?.focus(); } });
    const showPanel = (panel, focusTarget = null, animate = true) => {
      panels.forEach((node) => { node.hidden = node !== panel; });
      resetScroll();
      if (animate && !shared.reducedMotion()) panel.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(.23,1,.32,1)", fill: "both" });
      if (focusTarget) focusWithoutScroll(focusTarget);
    };
    const render = (animate = false) => {
      if (state.decision !== "pending") showPanel(letterComplete, null, animate);
      else if (state.read) showPanel(letterChoice, null, animate);
      else showPanel(letterIncoming, null, animate);
    };
    root.querySelectorAll("[data-letter-open-envelope]").forEach((button) => button.addEventListener("click", () => {
      if (state.decision === "pending" && !state.read) showPanel(letterRead, letterRead.querySelector("[data-letter-read-complete]"));
    }));
    root.querySelector("[data-letter-read-complete]")?.addEventListener("click", () => {
      if (state.decision !== "pending") return;
      state = { ...state, read: true };
      saveState(state);
      showPanel(letterChoice, letterChoice.querySelector("[data-letter-open-form]"));
    });
    root.querySelector("[data-letter-open-form]")?.addEventListener("click", () => {
      if (state.read && state.decision === "pending") showPanel(letterForm, letterForm.querySelector("textarea"));
    });
    const archive = () => go("018-archive-bag.html", "已完成归档");
    root.querySelectorAll("[data-letter-decline]").forEach((button) => button.addEventListener("click", () => {
      if (state.decision !== "pending") return;
      state = { ...state, decision: "declined" };
      saveState(state);
      render(true);
      window.setTimeout(archive, shared.reducedMotion() ? 20 : 520);
    }));
    letterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.decision !== "pending") return;
      const textarea = letterForm.querySelector("textarea");
      const status = letterForm.querySelector("[data-letter-form-status]");
      if (!textarea?.value.trim()) { if (status) status.textContent = "可以只写一句，也可以选择这次不写"; return; }
      state = { ...state, decision: "written" };
      saveState(state);
      render(true);
      window.setTimeout(archive, shared.reducedMotion() ? 20 : 520);
    });
    root.querySelector("[data-letter-archive]")?.addEventListener("click", archive);
    render();
  }
})();
