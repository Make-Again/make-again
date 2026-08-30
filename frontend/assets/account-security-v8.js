(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  if (root == null || shared == null || state == null) return;
  await state.ready();
  if (window.top === window.self && !state.currentAccountId()) {
    window.location.replace("001-login.html?from=guard");
    return;
  }

  const open = root.querySelector("[data-logout-open]");
  const layer = root.querySelector("[data-logout-layer]");
  const cancel = root.querySelector("[data-logout-cancel]");
  const confirm = root.querySelector("[data-logout-confirm]");
  const accountName = root.querySelector("[data-account-name]");
  if ([open,layer,cancel,confirm].some((node) => node == null)) return;

  // 展示真实账号名(用户名 + 密码登录),失败时保留默认文案「账号」。
  if (accountName && API) {
    try {
      const me = await API.me();
      if (me && typeof me.username === "string" && me.username) accountName.textContent = me.username;
    } catch (error) { /* 保留默认文案 */ }
  }

  const setOpen = (value) => {
    layer.setAttribute("aria-hidden", String(!value));
    if (value) window.requestAnimationFrame(() => cancel.focus({ preventScroll:true }));
    else open.focus({ preventScroll:true });
  };

  open.addEventListener("click", () => setOpen(true));
  cancel.addEventListener("click", () => setOpen(false));
  layer.addEventListener("click", (event) => { if (event.target === layer) setOpen(false); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && layer.getAttribute("aria-hidden") === "false") setOpen(false); });
  confirm.addEventListener("click", () => {
    state.logout();
    shared.nextPage("001-login.html?from=logout", {
    exitState:"utility-home",
    delay:shared.reducedMotion() ? 0 : 220,
    status:"已退出登录",
    });
  });
})();
