(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  if (root == null) return;

  const phone = root.querySelector(".ma-letter-phone");
  const form = root.querySelector(".ma-letter-login-form");
  const usernameInput = form == null ? null : form.querySelector('input[name="username"]');
  const passwordInput = form == null ? null : form.querySelector('input[name="password"]');
  const errorEl = form == null ? null : form.querySelector(".ma-letter-form-error");
  const submitBtn = form == null ? null : form.querySelector(".ma-letter-form-submit");
  const tabs = Array.from(root.querySelectorAll(".ma-letter-form-tab"));
  const shared = window.MakeAgainShared;
  const API = window.MakeAgainAPI;
  if (phone == null || form == null || usernameInput == null || passwordInput == null || errorEl == null || submitBtn == null || tabs.length === 0 || shared == null || API == null) return;

  let handoffTimer = null;
  let mode = "login";

  const setState = (next) => { phone.dataset.transitionState = next; };
  const clearHandoff = () => {
    if (handoffTimer != null) window.clearTimeout(handoffTimer);
    handoffTimer = null;
  };
  const setBusy = (busy) => {
    submitBtn.disabled = busy;
    Array.from(form.querySelectorAll("input, button")).forEach((node) => { node.disabled = busy; });
  };
  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = false;
  };
  const hideError = () => { errorEl.hidden = true; };
  const destinationFrom = (state) => {
    if (state && state.destination === "018") return "018-archive-bag.html?from=login";
    if (state && state.destination === "005") return "005-home.html?from=login";
    return "002-founder-letter.html?from=auth";
  };

  const setMode = (next) => {
    mode = next;
    tabs.forEach((tab) => {
      const active = tab.dataset.formMode === next;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    hideError();
    submitBtn.textContent = next === "login" ? "进入 Make Again" : "创建并进入";
    shared.setStatus(next === "login" ? "登录 · 用已有账号继续这段陪伴" : "注册 · 新建一个账号保存这段陪伴");
  };

  const proceed = (session) => {
    clearHandoff();
    setBusy(true);
    setState("returning");
    API.setSession(session.user_id, session.token);
    shared.setStatus("身份已确认 · 正在恢复陪伴状态");
    API.state().then((state) => {
      const destination = destinationFrom(state);
      phone.dataset.handoff = destination.startsWith("002-") ? "letter" : "direct";
      handoffTimer = window.setTimeout(() => {
        handoffTimer = null;
        setState("transitioning");
        shared.nextPage(destination, {
          exitState: "auth",
          delay: 2500,
          status: destination.startsWith("002-") ? "Make Again 正在消散 · 信封即将从底部出现" : "账号状态已恢复",
        });
      }, shared.reducedMotion() ? 20 : 720);
    }).catch(() => {
      setBusy(false);
      setState("login");
      showError("网络不通：后端未连接");
    });
  };

  // 已有有效会话时自动恢复,免重复登录(用户持久化:token 存 localStorage,后端 auth_sessions 30 天有效)。
  const autoResume = async () => {
    const userId = API.getUserId();
    const token = API.getToken();
    if (!userId || !token) return;
    try {
      const st = await API.state();
      const destination = destinationFrom(st);
      phone.dataset.handoff = destination.startsWith("002-") ? "letter" : "direct";
      clearHandoff();
      setBusy(true);
      setState("returning");
      shared.setStatus("已登录 · 正在恢复陪伴状态");
      handoffTimer = window.setTimeout(() => {
        handoffTimer = null;
        setState("transitioning");
        shared.nextPage(destination, {
          exitState: "auth",
          delay: 2500,
          status: destination.startsWith("002-") ? "Make Again 正在消散 · 信封即将从底部出现" : "账号状态已恢复",
        });
      }, shared.reducedMotion() ? 20 : 720);
    } catch (error) {
      const msg = String((error && error.message) || "");
      if (msg.includes("未登录") || msg.includes("401")) API.clearSession();
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (phone.dataset.transitionState === "returning") return;
    hideError();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username) { showError("请输入用户名"); usernameInput.focus(); return; }
    if (username.length < 2 || username.length > 32) { showError("用户名需为 2–32 个字符"); usernameInput.focus(); return; }
    if (password.length < 6) { showError("密码至少 6 位"); passwordInput.focus(); return; }
    setBusy(true);
    try {
      const session = mode === "login" ? await API.login(username, password) : await API.register(username, password);
      proceed(session);
    } catch (error) {
      setBusy(false);
      showError(error.message || "出错了，请重试");
    }
  };

  tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.formMode)));
  form.addEventListener("submit", submit);

  setMode("login");
  setState("login");
  // 触屏设备不自动聚焦,避免键盘弹出遮挡品牌字样;桌面(细指针)保留自动聚焦便于直接输入。
  if (window.matchMedia("(pointer: fine)").matches) usernameInput.focus();
  autoResume();
})();
