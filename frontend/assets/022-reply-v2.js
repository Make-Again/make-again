(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  const phone = root?.querySelector(".ma-letter-phone");
  const pin = root?.querySelector("[data-reply-pin]");
  const later = root?.querySelector("[data-reply-later]");
  const copy = root?.querySelector("[data-reply-copy]");
  if (!root || !shared || !state || !phone || !pin || !later || !copy) return;
  const params = new URL(window.location.href).searchParams;
  const fromArchive = params.get("from") === "archive";
  const archiveId = params.get("archive") || "";
  const uid = API && API.getUserId ? API.getUserId() : null;
  if (fromArchive && !state.getArchive(archiveId)) {
    window.location.replace("018-archive-bag.html?from=reply-guard");
    return;
  }
  if (!fromArchive) {
    const guard = state.activeGuard();
    if (!guard.allowed) { window.location.replace(guard.redirect); return; }
  }
  const reply = {
    id:"", type:"reply", status:"unread", source:"来自树洞信箱 · 匿名回信",
    title:"一封写给你的回信",
    body:"",
    createdAt:new Date().toISOString(),
  };
  // 真实回信:非演示模式从 /treehole/letters 取第一条收到的回信,替换写死的 reply-001。
  const renderReplyDom = (r) => {
    const titleNode = root.querySelector("#ma-reply-title");
    if (titleNode) titleNode.textContent = r.title;
    const paragraphs = String(r.body || "").split(/\n+/).filter((line) => line.trim() !== "");
    const copyNode = root.querySelector("[data-reply-copy]");
    if (copyNode && paragraphs.length) copyNode.replaceChildren(...paragraphs.map((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      return p;
    }));
  };
  if (uid && API && API.treeholeLetters) {
    API.treeholeLetters(uid).then((data) => {
      const letters = (data && data.letters) || [];
      for (const letter of letters) {
        const replies = letter.replies || [];
        if (replies.length) {
          const r = replies[0];
          reply.id = String(r.reply_id || "");
          reply.title = "一封写给你的回信";
          reply.body = String(r.content || "");
          reply.createdAt = r.created_at || new Date().toISOString();
          reply.source = r.source === "operator" ? "来自 Make Again · 官方回信" : "来自树洞信箱 · 匿名回信";
          renderReplyDom(reply);
          return;
        }
      }
    }).catch(() => {});
  }
  if (fromArchive) pin.textContent = "我读完了，收入只读档案";
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => { phone.dataset.replyState = "reading"; pin.focus({ preventScroll:true }); }));
  later.addEventListener("click", () => {
    const destination = fromArchive ? "018-archive-bag.html?from=reply-later" : "005-home.html?from=reply-later";
    shared.nextPage(destination, { exitState:"reply-later", delay:shared.reducedMotion() ? 0 : 180, status:"回信仍保留为未读" });
  });
  pin.addEventListener("click", () => {
    if (phone.dataset.replyState !== "reading") return;
    phone.dataset.replyState = "pinning";
    // 标记后端已读:调 /treehole/popup/seen 记录,018 的未读角标据此消失。
    if (uid && API && API.treeholePopupSeen && reply.id) {
      API.treeholePopupSeen(uid, "reply_received", reply.id).catch(() => {});
    }
    const destination = fromArchive ? "018-archive-bag.html?from=reply-saved" : "004-report-board.html?from=reply";
    window.setTimeout(() => shared.nextPage(destination, { exitState:"reply-pin", delay:shared.reducedMotion() ? 0 : 180, status:"回信已经收好" }), shared.reducedMotion() ? 80 : 240);
  });
})();
