(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  const matchesEl = root?.querySelector("[data-reply-matches]");
  const form = root?.querySelector("[data-reply-compose-form]");
  const text = root?.querySelector("[data-reply-compose-text]");
  const count = root?.querySelector("[data-reply-compose-count]");
  const status = root?.querySelector("[data-reply-compose-status]");
  const summary = root?.querySelector("[data-reply-match-summary]");
  const success = root?.querySelector("[data-reply-compose-success]");
  if (!root || !shared || !state || !API || !matchesEl || !form || !text || !count || !status || !summary || !success) return;
  const params = new URL(location.href).searchParams;
  const uid = API.getUserId ? API.getUserId() : null;
  let selectedLetter = null;

  const goHome = () => shared.nextPage("005-home.html?from=reply-compose", { exitState: "utility-home", delay: shared.reducedMotion() ? 0 : 220, status: "回到主页" });
  root.querySelectorAll("[data-reply-compose-home]").forEach((button) => button.addEventListener("click", goHome));

  const renderMatches = (letters) => {
    matchesEl.replaceChildren();
    const label = document.createElement("small");
    label.textContent = letters && letters.length ? "选择一封来信" : "暂时没有和你经历相似的信";
    matchesEl.appendChild(label);
    (letters || []).forEach((letter) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ma-reply-match-card";
      const title = document.createElement("strong");
      title.textContent = (letter.summary || letter.content || "").slice(0, 40) || "一封来信";
      const meta = document.createElement("small");
      const tags = (letter.tags || []).join(" · ");
      meta.textContent = (letter.emotion ? letter.emotion + (tags ? " · " : "") : "") + tags;
      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener("click", () => {
        selectedLetter = letter;
        const content = String(letter.content || "");
        summary.textContent = content.slice(0, 200) + (content.length > 200 ? "…" : "");
        matchesEl.hidden = true;
        form.hidden = false;
        text.focus({ preventScroll: true });
      });
      matchesEl.appendChild(card);
    });
  };

  const renderCount = () => { count.textContent = String(text.value.length) + " / 600"; };
  text.addEventListener("input", renderCount);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = text.value.trim();
    if (!body || !selectedLetter) { status.textContent = "先写下一句想说的话"; return; }
    if (uid && API && API.treeholeReply) {
      status.textContent = "正在送出…";
      let res = null;
      try { res = await API.treeholeReply(uid, String(selectedLetter.letter_id), body); } catch (error) { res = null; }
      if (!res || res.ok !== true) { status.textContent = (res && res.reason) || "暂时没有送出，请稍后再试"; return; }
    }
    form.hidden = true;
    success.hidden = false;
    window.setTimeout(() => goHome(), shared.reducedMotion() ? 500 : 1200);
  });

  // 进入页:拉取来信列表,失败保持空态。
  if (uid && API && API.treeholeMatches) {
    API.treeholeMatches(uid).then((data) => renderMatches((data && data.matches) || [])).catch(() => renderMatches([]));
  } else {
    renderMatches([]);
  }
})();
