(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  if (root == null || state == null) return;
  const phone = root.querySelector(".ma-letter-phone");
  const track = root.querySelector(".ma-board-track");
  const boardScroll = root.querySelector(".ma-board-scroll");
  const detailLayer = root.querySelector("[data-board-detail-layer]");
  const detailClose = root.querySelector("[data-board-detail-close]");
  const detailSource = root.querySelector("[data-board-detail-source]");
  const detailTitle = root.querySelector("[data-board-detail-title]");
  const detailBody = root.querySelector("[data-board-detail-body]");
  const writeButton = root.querySelector("[data-board-write]");
  const writeLayer = root.querySelector("[data-board-write-layer]");
  const writeForm = root.querySelector("[data-board-write-form]");
  const writeCancel = root.querySelector("[data-board-write-cancel]");
  const journal = root.querySelector("#ma-board-journal");
  const firstGuide = root.querySelector("[data-board-first-guide]");
  const pinToast = root.querySelector("[data-board-pin-toast]");
  const pinToastTitle = root.querySelector("[data-board-pin-toast-title]");
  const pinToastCopy = root.querySelector("[data-board-pin-toast-copy]");
  if ([phone, track, boardScroll, detailLayer, detailClose, detailSource, detailTitle, detailBody, writeButton, writeLayer, writeForm, writeCancel, journal, firstGuide, pinToast, pinToastTitle, pinToastCopy].some((node) => node == null)) return;

  const overlayEvent = "makeagain:board-overlay-change";
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const params = new URL(location.href).searchParams;
  const uid = API && API.getUserId ? API.getUserId() : null;
  let toastTimer = null;

  const hidePinToast = () => {
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toastTimer = null;
    pinToast.getAnimations().forEach((animation) => animation.cancel());
    pinToast.hidden = true;
  };

  const requestOverlay = (name) => {
    root.dispatchEvent(new CustomEvent(overlayEvent, { detail: { name } }));
  };

  root.addEventListener(overlayEvent, (event) => {
    const active = event.detail?.name || "none";
    if (active !== "detail") detailLayer.setAttribute("aria-hidden", "true");
    if (active !== "write") writeLayer.setAttribute("aria-hidden", "true");
    if (active !== "first-guide") firstGuide.hidden = true;
    if (active !== "toast") hidePinToast();
    root.dataset.boardOverlay = active;
  });

  // 看板条目 = 后端 diary(日记便利贴)+ item/photo(真实物件与拍立得),三源合一。
  let dynamicItems = [];
  const toDiary = (n) => ({
    id: "diary:" + n.note_id, type: "diary", backendId: String(n.note_id),
    text: n.content || "", body: n.content || "",
    title: (n.content || "").slice(0, 120), source: "你写下的",
    createdAt: n.created_at || new Date().toISOString(),
  });
  const loadRemoteItems = async () => {
    if (!uid || !API) return;
    const toObject = (it) => ({
      id: "item:" + it.item_id, type: "object", backendId: String(it.item_id),
      title: it.item_name || "收藏的物件", body: it.description || "",
      source: "Wakey 触发 · AI 抠图", preview: it.cutout_url || "",
      createdAt: it.created_at || new Date().toISOString(),
    });
    const toPhoto = (p) => ({
      id: "photo:" + p.photo_id, type: "photo", backendId: String(p.photo_id),
      title: p.title || "留下的照片", body: p.description || "",
      source: "Wakey 触发 · 保留整张照片", preview: p.photo_url || "",
      createdAt: p.created_at || new Date().toISOString(),
    });
    let itemData = { items: [] };
    let photoData = { photos: [] };
    let diaryData = { notes: [] };
    try { if (API.itemList) itemData = await API.itemList(uid); } catch (error) { itemData = { items: [] }; }
    try { if (API.photoList) photoData = await API.photoList(uid); } catch (error) { photoData = { photos: [] }; }
    try { if (API.diaryList) diaryData = await API.diaryList(uid); } catch (error) { diaryData = { notes: [] }; }
    dynamicItems = [
      ...(diaryData.notes || []).map(toDiary),
      ...(itemData.items || []).map(toObject),
      ...(photoData.photos || []).map(toPhoto),
    ];
    renderDynamic();
  };
  const dateLabel = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join(".");
  };

  const setDetail = (open, data = null) => {
    requestOverlay(open ? "detail" : "none");
    detailLayer.setAttribute("aria-hidden", String(!open));
    if (!open || data == null) return;
    detailSource.textContent = data.source || "内容来源";
    detailTitle.textContent = data.title || "被留下的一页";
    detailBody.textContent = data.body || "";
    window.setTimeout(() => {
      if (detailLayer.getAttribute("aria-hidden") === "false") detailClose.focus({ preventScroll: true });
    }, 80);
  };
  const setWrite = (open, { restoreFocus = true } = {}) => {
    requestOverlay(open ? "write" : "none");
    writeLayer.setAttribute("aria-hidden", String(!open));
    if (open) window.setTimeout(() => {
      if (writeLayer.getAttribute("aria-hidden") === "false") journal.focus({ preventScroll: true });
    }, 100);
    else if (restoreFocus) writeButton.focus({ preventScroll: true });
  };

  const showPinToast = (title, copy) => {
    requestOverlay("toast");
    pinToastTitle.textContent = title;
    pinToastCopy.textContent = copy;
    pinToast.hidden = false;
    const frames = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: "translateY(calc(-50% + 8px)) scale(.97)" },
          { opacity: 1, transform: "translateY(-50%) scale(1)" },
        ];
    pinToast.animate(frames, {
      duration: reducedMotion() ? 160 : 240,
      easing: reducedMotion() ? "ease" : "cubic-bezier(.23,1,.32,1)",
      fill: "both",
    });
    toastTimer = window.setTimeout(() => {
      if (root.dataset.boardOverlay === "toast") requestOverlay("none");
    }, 1900);
  };

  const animateStickyPin = async (sticky) => {
    if (sticky == null) return;
    const frames = reducedMotion()
      ? [{ opacity: 0.35 }, { opacity: 1 }]
      : [
          { opacity: 0.25, transform: "translateY(-12px) scale(.96) rotate(-1.2deg)" },
          { opacity: 1, transform: "translateY(0) scale(1) rotate(-1.2deg)" },
        ];
    const animation = sticky.animate(frames, {
      duration: reducedMotion() ? 160 : 240,
      easing: reducedMotion() ? "ease" : "cubic-bezier(.23,1,.32,1)",
      fill: "both",
    });
    try { await animation.finished; } catch (error) { /* A replacement interaction may cancel the animation. */ }
    animation.cancel();
  };

  const createDynamicPage = (item) => {
    const page = document.createElement("section");
    page.className = "ma-board-page ma-board-page-dynamic" + (item.type === "diary" ? " ma-board-page-today" : "");
    page.dataset.dynamicId = item.id;
    page.setAttribute("aria-label", dateLabel(item.createdAt) + " " + (item.type === "diary" ? "文字便利贴" : item.type === "reply" ? "匿名回信" : "新收藏"));
    const time = document.createElement("div");
    time.className = "ma-board-time";
    const timeValue = document.createElement("time");
    timeValue.textContent = item.type === "diary" ? "今天" : dateLabel(item.createdAt);
    const timeCopy = document.createElement("span");
    timeCopy.textContent = item.type === "diary" ? "今天 · 你写下的" : item.type === "reply" ? "一封写给你的匿名回信" : "Wakey 触发并收进看板";
    time.append(timeValue, timeCopy);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ma-board-keepsake " + (item.type === "diary" ? "ma-board-sticky-note" : item.type === "reply" ? "ma-board-envelope" : item.type === "object" ? "ma-board-cutout" : "ma-board-polaroid");
    button.dataset.boardDynamic = item.id;
    const visual = document.createElement("i");
    visual.setAttribute("aria-hidden", "true");
    if (item.type === "object") visual.textContent = "物";
    if (item.type === "object" && item.preview) {
      // 抠图成品:直接放 <img>,按原图自适应居中,去掉阴影框与固定尺寸占位。
      const preload = new Image();
      preload.onload = () => {
        visual.textContent = "";
        visual.dataset.hasImage = "true";
        const img = document.createElement("img");
        img.src = item.preview;
        img.alt = "";
        img.decoding = "async";
        visual.appendChild(img);
      };
      preload.onerror = () => { /* 图片加载失败保留占位 */ };
      preload.src = item.preview;
    } else if (item.type === "photo" && item.preview) {
      const preload = new Image();
      preload.onload = () => {
        visual.textContent = "";
        visual.dataset.hasImage = "true";
        visual.style.backgroundImage = `url("${item.preview}")`;
        visual.style.backgroundSize = "cover";
        visual.style.backgroundPosition = "center";
        visual.style.backgroundRepeat = "no-repeat";
      };
      preload.onerror = () => { /* 图片加载失败保留占位 */ };
      preload.src = item.preview;
    }
    const title = document.createElement("strong");
    title.textContent = item.type === "diary" ? (item.text || "今天写下的一句话").slice(0, 120) : item.type === "reply" ? (item.title || "一封写给你的回信") : item.type === "object" ? (item.title || "刚刚收藏的物件") : (item.title || "刚刚留下的照片");
    const source = document.createElement("small");
    source.textContent = item.source || (item.type === "diary" ? "你写下的" : "Wakey 触发");
    button.append(visual, title, source);
    page.append(time, button);
    return page;
  };

  const renderDynamic = () => {
    track.querySelectorAll(".ma-board-page-dynamic").forEach((node) => node.remove());
    dynamicItems.forEach((item) => track.appendChild(createDynamicPage(item)));
    document.dispatchEvent(new CustomEvent("makeagain:board-items"));
  };

  track.addEventListener("click", (event) => {
    const button = event.target.closest("[data-board-dynamic]");
    if (button == null) return;
    const item = dynamicItems.find((entry) => entry.id === button.dataset.boardDynamic);
    if (item == null) return;
    setDetail(true, {
      source: (item.source || "内容来源") + " · " + dateLabel(item.createdAt),
      title: item.type === "diary" ? "你写给今天的自己" : item.type === "reply" ? (item.title || "一封写给你的回信") : item.type === "object" ? (item.title || "被单独留下的物件") : (item.title || "被完整留下的照片"),
      body: item.type === "diary" ? item.text : item.type === "reply" ? item.body : (item.body || (item.type === "object" ? "这个物件由 Wakey 在对话中触发上传并完成处理。" : "这张照片由 Wakey 在对话中触发上传，并以拍立得形式保存。")),
    });
  });
  detailClose.addEventListener("click", () => setDetail(false));
  detailLayer.addEventListener("click", (event) => { if (event.target === detailLayer) setDetail(false); });
  writeButton.addEventListener("click", () => setWrite(true));
  writeCancel.addEventListener("click", () => setWrite(false));
  writeLayer.addEventListener("click", (event) => { if (event.target === writeLayer) setWrite(false); });
  writeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = journal.value.trim();
    if (text === "") return;
    const item = { id: String(Date.now()), type: "diary", source: "你写下的", createdAt: new Date().toISOString(), text };
    dynamicItems.unshift(item);
    journal.value = "";
    renderDynamic();
    setWrite(false, { restoreFocus: false });
    // 持久化到后端 /diary;失败不影响本次展示(下次进页会少这一条)。
    if (uid && API && API.diaryCreate) API.diaryCreate(uid, text).catch(() => {});
    const page = Array.from(track.querySelectorAll(".ma-board-page-dynamic")).find((node) => node.dataset.dynamicId === item.id);
    const sticky = page?.querySelector(".ma-board-sticky-note");
    await wait(reducedMotion() ? 160 : 220);
    page?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
    await animateStickyPin(sticky);
    if (root.dataset.boardOverlay !== "none") return;
    sticky?.focus({ preventScroll: true });
    showPinToast("今天已经贴到时间看板", "这是一张便利贴，以后可以随时回来看看");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (writeLayer.getAttribute("aria-hidden") === "false") setWrite(false);
    else if (detailLayer.getAttribute("aria-hidden") === "false") setDetail(false);
  });

  renderDynamic();
  loadRemoteItems();
})();
