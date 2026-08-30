(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  const list = root?.querySelector("[data-archive-reader-list]");
  const title = root?.querySelector("[data-archive-reader-title]");
  const index = root?.querySelector("[data-archive-reader-index]");
  const detail = root?.querySelector("[data-archive-detail]");
  if (!root || !shared || !state || !list || !title || !index || !detail) return;
  const params = new URL(location.href).searchParams;
  const uid = API && API.getUserId ? API.getUserId() : null;
  const archive = state.getArchive(params.get("archive") || "");
  if (!archive) { window.location.replace("018-archive-bag.html?from=reader-guard"); return; }
  root.querySelector("[data-archive-back]")?.addEventListener("click", () => shared.nextPage("018-archive-bag.html?from=reader", { exitState:"ending", delay:shared.reducedMotion()?0:180, status:"返回档案" }));
  if (!archive) return;
  title.textContent = new Date(archive.createdAt).getFullYear() + " · " + archive.title;
  index.textContent = archive.relationshipType === "pet" ? "小动物 · 只读" : archive.relationshipType === "relative" ? "亲人 · 只读" : "一段关系 · 只读";
  const localItems = archive.snapshot?.firstReportStatus === "pinned"
    ? [{ id:"first-report", type:"report", title:"初次见面后的记录", body:"报告还在整理中，稍后会在这里呈现。" }]
    : [];
  const renderItems = (items) => {
    list.replaceChildren(...(items.length ? items : [{ id:"empty", type:"note", title:"这段陪伴已经被保存", body:"当前没有更多可展示的内容。" }]).map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ma-archive-item";
      button.dataset.archiveItem = "";
      button.dataset.archiveTitle = item.title || (item.type === "diary" ? "你写下的一页" : "一段被保存的内容");
      button.dataset.archiveCopy = item.body || item.text || "这条内容只允许重新阅读。";
      button.setAttribute("aria-expanded", "false");
      const mark = item.type === "reply" ? "回" : item.type === "photo" ? "照" : item.type === "object" ? "物" : item.type === "diary" ? "记" : "报";
      button.innerHTML = '<span>'+mark+'</span><div><strong></strong><small>只读档案</small></div><b aria-hidden="true">›</b>';
      button.querySelector("strong").textContent = button.dataset.archiveTitle;
      return button;
    }));
  };
  renderItems(localItems);
  // 只读档案真源:首份报告 /initial-report、物件 /item、拍立得 /photo、收到的回信 /treehole/letters,四源合一。
  if (uid && API) {
    const toObject = (it) => ({ id: "item:" + it.item_id, type: "object", title: it.item_name || "收藏的物件", body: it.description || "" });
    const toPhoto = (p) => ({ id: "photo:" + p.photo_id, type: "photo", title: p.title || "留下的照片", body: p.description || "" });
    const toReply = (r) => ({ id: "reply:" + (r.reply_id || ""), type: "reply", title: "一封写给你的回信", body: r.content || "" });
    Promise.all([
      API.initialReport ? API.initialReport(uid).catch(() => null) : Promise.resolve(null),
      API.itemList ? API.itemList(uid).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      API.photoList ? API.photoList(uid).catch(() => ({ photos: [] })) : Promise.resolve({ photos: [] }),
      API.treeholeLetters ? API.treeholeLetters(uid).catch(() => ({ letters: [] })) : Promise.resolve({ letters: [] }),
    ]).then(([report, itemData, photoData, letterData]) => {
      const items = [];
      if (report && report.title) items.push({ id:"first-report", type:"report", title: report.title || "初次见面后的记录", body: report.summary || "" });
      items.push(...(itemData.items || []).map(toObject));
      items.push(...(photoData.photos || []).map(toPhoto));
      for (const letter of (letterData.letters || [])) {
        for (const r of (letter.replies || [])) items.push(toReply(r));
      }
      renderItems(items.length ? items : localItems);
    });
  }
  const detailTitle = detail.querySelector("[data-archive-detail-title]");
  const detailCopy = detail.querySelector("[data-archive-detail-copy]");
  const close = root.querySelector("[data-archive-detail-close]");
  const hide = () => { detail.hidden=true;detail.setAttribute("aria-hidden","true");list.querySelectorAll("[data-archive-item]").forEach((item)=>item.setAttribute("aria-expanded","false")); };
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-archive-item]");
    if (!item) return;
    detailTitle.textContent = item.dataset.archiveTitle;
    detailCopy.textContent = item.dataset.archiveCopy;
    detail.hidden = false;
    detail.setAttribute("aria-hidden", "false");
    item.setAttribute("aria-expanded", "true");
    close?.focus({ preventScroll:true });
  });
  close?.addEventListener("click", hide);
})();
