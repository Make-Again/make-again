(() => {
  const root = document.getElementById("make-again-founder-letter-wireframe");
  const shared = window.MakeAgainShared;
  const state = window.MakeAgainState;
  const API = window.MakeAgainAPI;
  const form = root?.querySelector("[data-letter-compose]");
  const text = root?.querySelector("[data-letter-text]");
  const count = root?.querySelector("[data-letter-count]");
  const draftStatus = root?.querySelector("[data-letter-draft-status]");
  const confirmLayer = root?.querySelector("[data-letter-confirm]");
  const confirmSheet = root?.querySelector(".ma-letter-confirm-sheet");
  const confirmSend = root?.querySelector("[data-letter-confirm-send]");
  const success = root?.querySelector("[data-letter-success]");
  if (!root || !shared || !state || !form || !text || !count || !draftStatus || !confirmLayer || !confirmSheet || !confirmSend || !success) return;
  const params = new URL(window.location.href).searchParams;
  const fromArchive = params.get("from") === "archive";
  const archiveId = params.get("archive") || "";
  const uid = API && API.getUserId ? API.getUserId() : null;
  const archive = fromArchive ? state.getArchive(archiveId) : null;
  const archivePath = archive?.relationshipType || state.getCurrentJourney()?.relationshipType || "relative";
  let draftTimer = null;
  const goHome = (status) => {
    const destination = fromArchive ? "018-archive-bag.html?from="+status+"&archive="+encodeURIComponent(archiveId) : "005-home.html?from="+status;
    const locationName = fromArchive ? "档案" : "主页";
    shared.nextPage(destination,{exitState:"utility-home",delay:shared.reducedMotion()?0:220,status:status==="letter-sent"?"信已经匿名寄出 · 回到"+locationName:"草稿已经收好 · 回到"+locationName});
  };
  const renderCount = () => { count.textContent=String(text.value.length)+" / 600"; };
  const saveDraft = () => { draftStatus.textContent="草稿已保存"; };
  const setConfirm = (open) => { confirmLayer.setAttribute("aria-hidden",String(!open));if(open)window.requestAnimationFrame(()=>confirmSheet.focus({preventScroll:true}));else text.focus({preventScroll:true}); };
  if(fromArchive){root.querySelectorAll("[data-letter-home]").forEach((button)=>button.setAttribute("aria-label","稍后再写并返回档案"));const successCopy=success.querySelector("p");if(successCopy)successCopy.textContent="这次邀请已经完成，现在回到你的档案。"}
  // 门槛提示:查询写信资格,资格不足时在草稿状态位展示原因(仍可编辑,提交时后端会再拦一次)。
  if (uid && API && API.treeholeWriteEligibility) {
    API.treeholeWriteEligibility(uid).then((elig) => {
      if (elig && elig.eligible === false && elig.reason) draftStatus.textContent = elig.reason;
    }).catch(() => {});
  }
  renderCount();
  text.addEventListener("input",()=>{renderCount();draftStatus.textContent="正在保存…";if(draftTimer!=null)window.clearTimeout(draftTimer);draftTimer=window.setTimeout(()=>{draftTimer=null;saveDraft()},280)});
  form.addEventListener("submit",(event)=>{event.preventDefault();if(!text.value.trim()){draftStatus.textContent="先写下一点想说的话";text.focus({preventScroll:true});return}saveDraft();setConfirm(true)});
  root.querySelectorAll("[data-letter-confirm-cancel]").forEach((button)=>button.addEventListener("click",()=>setConfirm(false)));
  root.querySelectorAll("[data-letter-home]").forEach((button)=>button.addEventListener("click",()=>{saveDraft();goHome("letter-later")}));
  confirmSend.addEventListener("click", async () => {
    const body = text.value.trim();
    if (!body) { setConfirm(false); return; }
    setConfirm(false);
    // 真实提交:/treehole/letter;ok=false 时展示拒绝原因并回到编辑。
    if (uid && API && API.treeholeWrite) {
      draftStatus.textContent = "正在寄出…";
      let res = null;
      try { res = await API.treeholeWrite(uid, body); } catch (error) { res = null; }
      if (!res || res.ok !== true) {
        draftStatus.textContent = (res && res.reason) || "暂时没有寄出，请稍后再试";
        text.focus({ preventScroll: true });
        return;
      }
    }
    text.value = "";
    form.hidden = true;
    success.hidden = false;
    if (!shared.reducedMotion()) success.animate([{ opacity: 0, transform: "translateY(8px) scale(.97)" }, { opacity: 1, transform: "translateY(0) scale(1)" }], { duration: 240, easing: "cubic-bezier(.23,1,.32,1)", fill: "both" });
    window.setTimeout(() => goHome("letter-sent"), shared.reducedMotion() ? 400 : 900);
  });
  document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&confirmLayer.getAttribute("aria-hidden")==="false"){event.preventDefault();setConfirm(false)}});
  window.addEventListener("pagehide",()=>{if(draftTimer!=null)window.clearTimeout(draftTimer);if(text.value.trim())saveDraft()});
})();
