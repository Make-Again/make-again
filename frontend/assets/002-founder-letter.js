(async () => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  if (root == null) return;

  const phone = root.querySelector(".ma-letter-phone");
  const envelope = root.querySelector(".ma-letter-envelope");
  const scroll = root.querySelector(".ma-letter-scroll");
  const next = root.querySelector(".ma-letter-next");
  const jumpEnd = root.querySelector(".ma-letter-jump-end");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  if (phone == null || envelope == null || scroll == null || next == null || jumpEnd == null || shared == null || state == null) return;
  await state.ready();
  if (window.top === window.self && state.currentAccountId() == null) {
    window.location.replace("001-login.html?from=guard");
    return;
  }

  let openingTimer = null;

  const clearOpening = () => {
    if (openingTimer != null) window.clearTimeout(openingTimer);
    openingTimer = null;
  };

  const setState = (state) => {
    phone.dataset.transitionState = state;
    const reading = state === "reading";
    envelope.disabled = state !== "envelope";
    next.disabled = !reading;
    scroll.setAttribute("aria-hidden", String(!reading));
  };

  const openLetter = () => {
    if (phone.dataset.transitionState !== "envelope") return;
    clearOpening();
    if (shared.reducedMotion()) {
      setState("reading");
      scroll.scrollTop = 0;
      shared.setStatus("主创来信 · 信纸已展开 · 可向下滚动阅读");
      return;
    }
    setState("opening");
    shared.setStatus("信封展开中 · 信纸正在放大");
    openingTimer = window.setTimeout(() => {
      openingTimer = null;
      setState("reading");
      scroll.scrollTop = 0;
      shared.setStatus("主创来信 · 信纸已展开 · 可向下滚动阅读");
    }, 1450);
  };

  const jumpToEnd = () => {
    clearOpening();
    setState("reading");
    scroll.scrollTop = scroll.scrollHeight;
    shared.setStatus("信末 · 复古“进入”按钮已展示");
  };

  envelope.addEventListener("click", openLetter);
  jumpEnd.addEventListener("click", jumpToEnd);
  next.addEventListener("click", () => {
    if (phone.dataset.transitionState !== "reading") return;
    state.updateCurrentJourney((journey) => { journey.firstLetterStatus = "opened"; });
    shared.nextPage("003-voice.html?from=letter", {
      exitState: "letter",
      delay: 1040,
      status: "信纸正在轻轻收拢 · Voice 即将接入",
    });
  });

  setState("envelope");
})();
