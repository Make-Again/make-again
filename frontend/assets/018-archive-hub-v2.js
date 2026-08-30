(() => {
  "use strict";
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  const uid = API && API.getUserId ? API.getUserId() : null;
  const track = root?.querySelector("[data-archive-track]");
  const pagination = root?.querySelector("[data-archive-pagination]");
  const count = root?.querySelector("[data-archive-count]");
  const letterLayer = root?.querySelector("[data-archive-letter-layer]");
  const mailButton = root?.querySelector("[data-archive-mail]");
  const unreadButton = root?.querySelector("[data-archive-unread]");
  const toast = root?.querySelector("[data-archive-toast]");
  if (!root || !shared || !state || !track || !pagination || !count || !letterLayer || !mailButton || !unreadButton || !toast) return;

  const params = new URL(window.location.href).searchParams;
  if (!state.currentAccountId()) {
    window.location.replace("001-login.html?from=guard");
    return;
  }
  if (state.getCurrentJourney()) {
    window.location.replace("005-home.html?from=archive-guard");
    return;
  }

  const pathData = {
    breakup:{ label:"一段关系", title:"曾经的那段陪伴", seal:"曾" },
    pet:{ label:"小动物", title:"一段温柔的陪伴", seal:"伴" },
    relative:{ label:"亲人", title:"被好好记住的人", seal:"忆" },
  };
  const archives = state.listArchives();
  if (archives.length === 0) {
    window.location.replace("002-founder-letter.html?from=archive-empty");
    return;
  }
  let selectedArchiveId = params.get("archive") || archives[0]?.id || "";
  if (!archives.some((archive) => archive.id === selectedArchiveId)) selectedArchiveId = archives[0]?.id || "";

  const formatDate = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "2026";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join(".");
  };
  const showToast = (copy) => {
    toast.textContent = copy;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 1600);
  };
  const go = (href, status) => shared.nextPage(href, { exitState:"archive-hub", delay:shared.reducedMotion() ? 0 : 220, status });
  root.querySelector("[data-archive-settings]")?.addEventListener("click", () => go("008-settings.html?from=archive", "正在打开设置"));

  const setLayer = (layer, open, focusTarget = null) => {
    [letterLayer].forEach((other) => { if (other !== layer) other.setAttribute("aria-hidden", "true"); });
    layer.setAttribute("aria-hidden", String(!open));
    if (open && focusTarget) window.setTimeout(() => focusTarget.focus({ preventScroll:true }), shared.reducedMotion() ? 0 : 60);
  };
  const createArchiveCard = (archive, index) => {
    const archivePath = state.normalizeRelationshipType(archive.relationshipType) || "relative";
    const data = pathData[archivePath];
    const card = document.createElement("article");
    card.className = "ma-archive-card";
    card.dataset.path = archivePath;
    card.dataset.archiveId = archive.id;
    card.setAttribute("aria-label", data.label + "档案，" + archive.title);
    card.innerHTML = '<div class="ma-archive-card-top"><span class="ma-archive-type"></span><span class="ma-archive-lock">只读</span></div><span class="ma-archive-seal" aria-hidden="true"></span><time></time><h3></h3><p>文字、照片与物品都完整保存。打开时只允许阅读，不会继续修改。</p><div class="ma-archive-card-actions"><button type="button" data-open>打开档案</button><button type="button" data-keepsake>实体纪念物</button></div>';
    card.querySelector(".ma-archive-type").textContent = data.label + " · ARCHIVE " + String(index + 1).padStart(2, "0");
    card.querySelector(".ma-archive-seal").textContent = data.seal;
    card.querySelector("time").dateTime = archive.createdAt || "";
    card.querySelector("time").textContent = formatDate(archive.createdAt);
    card.querySelector("h3").textContent = archive.title || data.title;
    card.querySelector("[data-open]").addEventListener("click", () => go("023-archive-reader.html?archive=" + encodeURIComponent(archive.id), "正在打开只读档案"));
    card.querySelector("[data-keepsake]").addEventListener("click", () => go("021-keepsake-shop.html?from=archive&archive=" + encodeURIComponent(archive.id) + "&path=" + encodeURIComponent(archivePath), "查看实体纪念物"));
    card.addEventListener("pointerdown", () => { selectedArchiveId = archive.id; });
    return card;
  };

  archives.forEach((archive, index) => track.appendChild(createArchiveCard(archive, index)));
  count.textContent = String(archives.length) + " 段陪伴 · 全部只读";

  const pages = Array.from(track.children);
  const dots = pages.map(() => { const dot = document.createElement("i"); pagination.appendChild(dot); return dot; });
  const renderPosition = () => {
    const center = track.getBoundingClientRect().left + track.getBoundingClientRect().width / 2;
    let closest = 0;
    let distance = Infinity;
    pages.forEach((page, index) => {
      const rect = page.getBoundingClientRect();
      const current = Math.abs(rect.left + rect.width / 2 - center);
      if (current < distance) { closest = index; distance = current; }
    });
    dots.forEach((dot, index) => dot.classList.toggle("is-active", index === closest));
    if (archives[closest]) selectedArchiveId = archives[closest].id;
  };
  let scrollFrame = null;
  track.addEventListener("scroll", () => {
    if (scrollFrame != null) return;
    scrollFrame = window.requestAnimationFrame(() => { scrollFrame = null; renderPosition(); });
  }, { passive:true });
  renderPosition();

  // 未读回信后端真源:/treehole/popup 的 reply_received(已送达且未看过的回信),不再读本地 followUp。
  let unreadReply = null;
  const refreshUnread = async () => {
    unreadReply = null;
    if (!uid || !API || !API.treeholePopup) return;
    try {
      const data = await API.treeholePopup(uid);
      const received = ((data && data.popups) || []).find((popup) => popup && popup.kind === "reply_received");
      if (received && received.data && received.data.reply_id) {
        unreadReply = { replyId: String(received.data.reply_id), archiveId: selectedArchiveId };
      }
    } catch (error) { unreadReply = null; }
  };
  const renderMail = () => {
    unreadButton.hidden = unreadReply == null;
    if (unreadReply) unreadButton.querySelector("b").textContent = "1";
  };
  const laterLetter = () => {
    setLayer(letterLayer, false);
    showToast("写信邀请已经收起");
  };
  root.querySelector("[data-archive-letter-later]")?.addEventListener("click", laterLetter);
  root.querySelector("[data-archive-letter-close]")?.addEventListener("click", laterLetter);
  root.querySelector("[data-archive-letter-reject]")?.addEventListener("click", laterLetter);
  root.querySelector("[data-archive-letter-now]")?.addEventListener("click", () => {
    go("015-letter-box.html?from=archive&archive=" + encodeURIComponent(selectedArchiveId), "正在打开写信界面");
  });
  // 写信邀请:点击时查 /treehole/write-eligibility,资格不足则提示原因,否则打开写信邀请层。
  mailButton.addEventListener("click", async () => {
    if (!uid || !API || !API.treeholeWriteEligibility) return;
    let elig = null;
    try { elig = await API.treeholeWriteEligibility(uid); } catch (error) { elig = null; }
    if (elig && elig.eligible === false) { showToast(elig.reason || "现在还没有可以写的信"); return; }
    setLayer(letterLayer, true, letterLayer.querySelector("[data-archive-letter-now]"));
  });
  unreadButton.addEventListener("click", () => {
    if (unreadReply) go("022-letter-invitation.html?from=archive&archive=" + encodeURIComponent(unreadReply.archiveId), "继续阅读回信");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (letterLayer.getAttribute("aria-hidden") === "false") laterLetter();
  });

  renderMail();
  refreshUnread().then(renderMail);
  if (params.get("mail") === "1") window.setTimeout(() => setLayer(letterLayer, true, letterLayer.querySelector("[data-archive-letter-now]")), 80);
  if (params.get("from") === "reply-saved") window.setTimeout(() => showToast("回信已经收入只读档案"), 180);
})();
